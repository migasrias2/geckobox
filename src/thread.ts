import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { AGENT_NAMES, getAgent } from "./agents/index.js"
import { describe, isIsolated, resolveComputer } from "./computers.js"
import { isEnvName } from "./shell.js"
import { appendEvent, loadThread, saveThread, updateThread } from "./store.js"
import { cleanupRemote, interruptRemote, runTurn, type RunningTurn } from "./turn.js"
import type { AgentEvent, AgentName, ThreadState, TurnRecord, TurnResult } from "./types.js"

export const startOptionsSchema = z.object({
  agent: z.enum(AGENT_NAMES as [AgentName, ...AgentName[]]),
  prompt: z.string().min(1, "prompt is empty"),
  on: z.string().min(1).default("local"),
  cwd: z.string().startsWith("/", "cwd must be an absolute path").optional(),
  deleteOnClose: z.boolean().default(true),
  autoApprove: z.boolean().optional(),
  model: z.string().min(1).optional(),
  forwardEnv: z.array(z.string().refine(isEnvName, "invalid env var name")).default([]),
})

export type StartOptions = z.input<typeof startOptionsSchema> & {
  readonly onEvent?: (event: AgentEvent) => void
}

/** A queued turn that no worker picked up within this long is reported as failed. */
const NEVER_STARTED_MS = 60_000

function newId(agent: string): string {
  return `${agent.replace(/[^a-z0-9]/g, "")}-${randomBytes(4).toString("hex")}`
}

/** Create and persist a thread whose first turn is queued, without running it. */
export async function createThread(options: StartOptions): Promise<ThreadState> {
  const parsed = startOptionsSchema.parse(options)
  const computer = await resolveComputer(parsed.on)
  const now = new Date().toISOString()
  // Skipping permission prompts is only the default where the agent is boxed in.
  const isolated = isIsolated(computer)
  const state: ThreadState = {
    id: newId(parsed.agent),
    agent: parsed.agent,
    on: parsed.on,
    computer,
    ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
    deleteOnClose: parsed.deleteOnClose,
    autoApprove: parsed.autoApprove ?? isolated,
    ...(parsed.model ? { model: parsed.model } : {}),
    forwardEnv: [...new Set([...(computer.forwardEnv ?? []), ...parsed.forwardEnv])],
    status: "starting",
    turns: [{ index: 0, prompt: parsed.prompt, startedAt: now }],
    createdAt: now,
    updatedAt: now,
  }
  return saveThread(state)
}

/** Add a pending turn to an idle thread. */
export async function queueTurn(id: string, prompt: string): Promise<ThreadState> {
  if (!prompt) throw new Error("prompt is empty")
  return updateThread(id, (state) => {
    if (state.status === "closed") throw new Error(`Thread ${id} is closed`)
    if (state.status === "running" || state.status === "starting") throw new Error(`Thread ${id} is still working; wait for it first`)
    const turn: TurnRecord = { index: state.turns.length, prompt, startedAt: new Date().toISOString() }
    return { ...state, status: "starting", turns: [...state.turns, turn] }
  })
}

function finishTurn(state: ThreadState, result: TurnResult): ThreadState {
  const last = state.turns.at(-1)
  if (!last || last.endedAt) return state
  const done: TurnRecord = {
    ...last,
    endedAt: new Date().toISOString(),
    ok: result.ok,
    text: result.text,
    ...(result.error ? { error: result.error } : {}),
    ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
  }
  const { workerPid: _drop, ...rest } = state
  return {
    ...rest,
    ...(result.sessionId ? { sessionId: result.sessionId } : {}),
    status: state.status === "closed" ? "closed" : result.ok ? "idle" : "failed",
    turns: [...state.turns.slice(0, -1), done],
  }
}

/** Run the thread's pending (last) turn, logging events and saving the result. */
export async function executeTurn(id: string, onEvent?: (event: AgentEvent) => void): Promise<RunningTurn> {
  const state = await updateThread(id, (s) => {
    const last = s.turns.at(-1)
    if (s.status !== "starting" || !last || last.endedAt) throw new Error(`Thread ${id} has no pending turn (${s.status})`)
    return { ...s, status: "running", workerPid: process.pid }
  })
  const turn = state.turns.at(-1)!
  const pending: Promise<void>[] = []
  const turnRun = runTurn(state, getAgent(state.agent), turn.prompt, {
    onEvent: (event) => {
      pending.push(appendEvent(id, turn.index, event).catch(() => undefined))
      onEvent?.(event)
    },
  })
  const result = turnRun.result.then(async (res) => {
    await Promise.all(pending)
    await updateThread(id, (s) => finishTurn(s, res))
    return res
  })
  return { running: turnRun.running, result }
}

export async function interruptThread(id: string): Promise<void> {
  const state = await loadThread(id)
  await interruptRemote(state.computer, id)
}

export async function closeThread(id: string): Promise<ThreadState> {
  const state = await loadThread(id)
  if (state.status === "closed") return state
  await interruptRemote(state.computer, id).catch(() => undefined)
  const busy = state.status === "running" || state.status === "starting"
  if (busy && state.workerPid && state.workerPid !== process.pid && isWorkerOf(state.workerPid, id)) {
    try {
      process.kill(state.workerPid)
    } catch {
      // already gone
    }
  }
  if (state.deleteOnClose) await cleanupRemote(state).catch(() => undefined)
  return updateThread(id, (s) => {
    const pendingTurn = s.turns.at(-1)?.endedAt === undefined
    const settled = pendingTurn ? finishTurn(s, { ok: false, text: "", error: "closed before the turn finished" }) : s
    const { workerPid: _drop, ...rest } = settled
    return { ...rest, status: "closed" }
  })
}

/** True only if `pid` is still a CLI worker for this thread (guards against pid reuse). */
function isWorkerOf(pid: number, id: string): boolean {
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" })
    return command.includes(`__worker ${id}`)
  } catch {
    return false
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Current state, repairing threads whose worker died mid-turn. */
export async function threadStatus(id: string): Promise<ThreadState> {
  const state = await loadThread(id)
  const busy = state.status === "running" || state.status === "starting"
  if (busy && state.workerPid && !isAlive(state.workerPid)) {
    return updateThread(id, (s) => finishTurn(s, { ok: false, text: "", error: "worker process exited before the turn finished" }))
  }
  const age = Date.now() - Date.parse(state.updatedAt)
  if (state.status === "starting" && !state.workerPid && age > NEVER_STARTED_MS) {
    return updateThread(id, (s) => (s.status === "starting" && !s.workerPid ? finishTurn(s, { ok: false, text: "", error: "worker never started" }) : s))
  }
  return state
}

export function summary(state: ThreadState): string {
  return `${state.id}  ${state.agent} on ${state.on} (${describe(state.computer)})  ${state.status}  ${state.turns.length} turn(s)`
}

/** An agent thread driven from this process. */
export class Thread {
  private current: RunningTurn | undefined

  private constructor(
    readonly id: string,
    private readonly onEvent?: (event: AgentEvent) => void,
  ) {}

  /** @internal */
  static async begin(id: string, onEvent?: (event: AgentEvent) => void): Promise<Thread> {
    const thread = new Thread(id, onEvent)
    thread.current = await executeTurn(id, onEvent)
    return thread
  }

  /** Attach to an existing thread (for example one started by the CLI). */
  static attach(id: string, onEvent?: (event: AgentEvent) => void): Thread {
    return new Thread(id, onEvent)
  }

  /** Wait for the turn in progress. Resolves immediately if none is running here. */
  async wait(): Promise<TurnResult | undefined> {
    return this.current?.result
  }

  /** Send the next message. Waits for the current turn, then runs this one to the end. */
  async send(prompt: string): Promise<TurnResult> {
    await this.current?.result
    await queueTurn(this.id, prompt)
    this.current = await executeTurn(this.id, this.onEvent)
    return this.current.result
  }

  status(): Promise<ThreadState> {
    return threadStatus(this.id)
  }

  interrupt(): Promise<void> {
    return interruptThread(this.id)
  }

  async close(): Promise<ThreadState> {
    this.current?.running.child.kill()
    await this.current?.result.catch(() => undefined)
    return closeThread(this.id)
  }
}

/** Start an agent on a computer. Returns once the first turn has started. */
export async function startThread(options: StartOptions): Promise<Thread> {
  const state = await createThread(options)
  return Thread.begin(state.id, options.onEvent)
}

export function openThread(id: string, onEvent?: (event: AgentEvent) => void): Thread {
  return Thread.attach(id, onEvent)
}
