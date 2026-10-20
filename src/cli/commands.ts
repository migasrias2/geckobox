import { readFile } from "node:fs/promises"
import { addComputer, describe, loadRegistry, removeComputer, resolveComputer } from "../computers.js"
import { fanOut } from "../fanout.js"
import { probeComputer } from "../probe.js"
import { eventsFile, listThreads } from "../store.js"
import { closeThread, createThread, executeTurn, interruptThread, queueTurn, threadStatus } from "../thread.js"
import type { AgentName, ThreadState } from "../types.js"
import { spawnWorker } from "../worker.js"

export { spawnWorker }
import { err, eventLine, out, threadDetail, threadRow } from "./format.js"

const POLL_MS = 500

export async function waitIdle(id: string): Promise<ThreadState> {
  for (;;) {
    const state = await threadStatus(id)
    if (state.status !== "running" && state.status !== "starting") return state
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

export async function cmdComputers(sub: string | undefined, args: readonly string[]): Promise<number> {
  if (sub === "add") {
    const [name, address] = args
    if (!name || !address) throw new Error("usage: openspaces computers add <name> <local|ssh:user@host|container:name|docker:name|podman:name|cua:name>")
    await addComputer(name, address)
    out(`added ${name} → ${address}`)
    return 0
  }
  if (sub === "rm") {
    if (!args[0]) throw new Error("usage: openspaces computers rm <name>")
    await removeComputer(args[0])
    out(`removed ${args[0]}`)
    return 0
  }
  if (sub === "test") {
    const name = args[0] ?? "local"
    const computer = await resolveComputer(name)
    const res = await probeComputer(computer)
    out(`${name} (${describe(computer)})`)
    out(res.stdout)
    if (!res.ok) err(res.error ?? "check failed")
    return res.ok ? 0 : 1
  }
  if (sub === undefined || sub === "ls") {
    const registry = await loadRegistry()
    out("local".padEnd(16) + "local (built in)")
    Object.entries(registry).forEach(([name, c]) => out(`${name.padEnd(16)}${describe(c)}`))
    return 0
  }
  throw new Error(`unknown subcommand: computers ${sub}`)
}

export interface StartFlags {
  readonly on: string
  readonly agent: AgentName
  readonly prompt: string
  readonly cwd?: string
  readonly keep: boolean
  readonly autoApprove?: boolean
  readonly model?: string
  readonly env: readonly string[]
  readonly wait: boolean
}

function startOptions(flags: StartFlags) {
  return {
    agent: flags.agent,
    prompt: flags.prompt,
    on: flags.on,
    deleteOnClose: !flags.keep,
    forwardEnv: [...flags.env],
    ...(flags.cwd ? { cwd: flags.cwd } : {}),
    ...(flags.autoApprove !== undefined ? { autoApprove: flags.autoApprove } : {}),
    ...(flags.model ? { model: flags.model } : {}),
  }
}

export async function cmdStart(flags: StartFlags): Promise<number> {
  const state = await createThread(startOptions(flags))
  spawnWorker(state.id)
  out(state.id)
  if (!flags.wait) return 0
  return printResult(await waitIdle(state.id))
}

export async function cmdSend(id: string, prompt: string, wait: boolean): Promise<number> {
  await queueTurn(id, prompt)
  spawnWorker(id)
  if (!wait) return 0
  return printResult(await waitIdle(id))
}

function printResult(state: ThreadState): number {
  const last = state.turns.at(-1)
  if (last?.ok) {
    out(last.text ?? "")
    return 0
  }
  err(last?.error ?? `thread is ${state.status}`)
  return 1
}

export async function cmdWait(id: string): Promise<number> {
  return printResult(await waitIdle(id))
}

export async function cmdStatus(id: string | undefined): Promise<number> {
  if (id) {
    out(threadDetail(await threadStatus(id)))
    return 0
  }
  const threads = await listThreads()
  if (threads.length === 0) out("no threads yet. Start one: openspaces start --agent claude-code \"…\"")
  for (const t of threads) out(threadRow(await threadStatus(t.id)))
  return 0
}

export async function cmdLogs(id: string, follow: boolean): Promise<number> {
  let printed = 0
  for (;;) {
    const text = await readFile(eventsFile(id), "utf8").catch(() => "")
    const lines = text.split("\n").filter(Boolean)
    for (const raw of lines.slice(printed)) {
      const line = eventLine(JSON.parse(raw))
      if (line !== undefined) out(line)
    }
    printed = lines.length
    if (!follow) return 0
    const state = await threadStatus(id)
    if (state.status !== "running" && state.status !== "starting") return 0
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

export async function cmdInterrupt(id: string): Promise<number> {
  await interruptThread(id)
  out(`interrupted ${id}`)
  return 0
}

export async function cmdClose(id: string): Promise<number> {
  const state = await closeThread(id)
  out(`closed ${state.id}${state.deleteOnClose && !state.cwd ? " (work dir deleted)" : ""}`)
  return 0
}

export async function cmdRun(flags: StartFlags & { readonly computers: readonly string[] }): Promise<number> {
  const width = Math.max(...flags.computers.map((c) => c.length))
  const results = await fanOut(flags.computers, {
    ...startOptions(flags),
    close: !flags.keep,
    onEvent: (on, event) => {
      const line = eventLine(event, `[${on.padEnd(width)}] `)
      if (line !== undefined && event.type !== "stderr") out(line)
    },
  })
  out()
  for (const r of results) {
    const ok = r.result?.ok === true
    out(`${ok ? "✓" : "✗"} ${r.on.padEnd(width)}  ${ok ? r.result?.text.split("\n").at(-1) : (r.error ?? r.result?.error)}`)
  }
  return results.every((r) => r.result?.ok) ? 0 : 1
}

/** Hidden: the detached worker that runs one pending turn. */
export async function cmdWorker(id: string): Promise<number> {
  const { result } = await executeTurn(id)
  return (await result).ok ? 0 : 1
}
