import type { AgentAdapter } from "./agents/index.js"
import { REMOTE_ROOT } from "./paths.js"
import { join, quote } from "./shell.js"
import { capture, invocationFor, start, type Running } from "./transport.js"
import type { AgentEvent, Computer, ThreadState, TurnResult } from "./types.js"

const SAFE_ID = /^[a-z0-9-]+$/

function assertId(id: string): void {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid thread id: ${id}`)
}

function workDirExpr(state: Pick<ThreadState, "id" | "cwd">): string {
  return state.cwd ? quote(state.cwd) : `"$HOME/${REMOTE_ROOT}/work/${state.id}"`
}

function pidFileExpr(id: string): string {
  return `"$HOME/${REMOTE_ROOT}/run/${id}.pid"`
}

/** The script a turn runs on the target computer. */
export function turnScript(state: Pick<ThreadState, "id" | "cwd">, adapter: AgentAdapter, argv: readonly string[]): string {
  assertId(state.id)
  const missing = `openspaces: '${adapter.binary}' is not installed on this computer`
  return [
    `mkdir -p "$HOME/${REMOTE_ROOT}/run"`,
    `W=${workDirExpr(state)}`,
    `mkdir -p "$W" && cd "$W" || exit 1`,
    `command -v ${quote(adapter.binary)} >/dev/null 2>&1 || { echo ${quote(missing)} >&2; exit 127; }`,
    `P=${pidFileExpr(state.id)}`,
    // The pid file lives only while the turn runs, so a reused pid is never killed later.
    `echo $$ > "$P"`,
    `trap 'rm -f "$P"' EXIT`,
    `trap 'rm -f "$P"; exit 143' HUP INT TERM`,
    `${join(argv)} </dev/null`,
  ].join("\n")
}

/** Fold a turn's events into its result. Pure. */
export function foldEvents(events: readonly AgentEvent[], exitCode: number | null, stderrTail: string): TurnResult {
  const sessionId = events.reduce<string | undefined>((id, e) => (e.type === "session" ? e.sessionId : id), undefined)
  const texts = events.flatMap((e) => (e.type === "text" ? [e.text] : []))
  const result = [...events].reverse().find((e) => e.type === "result")
  const lastText = texts.at(-1) ?? ""
  const base = { ...(sessionId ? { sessionId } : {}) }
  if (result && result.type === "result") {
    const text = result.text || lastText
    const ok = result.ok && (exitCode === 0 || exitCode === null)
    return {
      ...base,
      ok,
      text,
      ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
      ...(ok ? {} : { error: result.ok ? stderrTail || `exited with code ${exitCode}` : text || stderrTail }),
    }
  }
  const ok = exitCode === 0
  return {
    ...base,
    ok,
    text: texts.join("\n"),
    ...(ok ? {} : { error: stderrTail || `exited with code ${exitCode}` }),
  }
}

export interface TurnOptions {
  readonly onEvent?: (event: AgentEvent) => void
  readonly env?: Readonly<Record<string, string | undefined>>
}

export interface RunningTurn {
  readonly running: Running
  readonly result: Promise<TurnResult>
}

const STDERR_TAIL_LINES = 20

export function runTurn(state: ThreadState, adapter: AgentAdapter, prompt: string, options: TurnOptions = {}): RunningTurn {
  const argv = adapter.argv({
    prompt,
    autoApprove: state.autoApprove,
    ...(state.sessionId ? { sessionId: state.sessionId } : {}),
    ...(state.model ? { model: state.model } : {}),
  })
  const env = Object.fromEntries(state.forwardEnv.map((key) => [key, options.env?.[key] ?? process.env[key]]))
  const events: AgentEvent[] = []
  const stderr: string[] = []
  const emit = (event: AgentEvent): void => {
    events.push(event)
    options.onEvent?.(event)
  }
  const running = start(invocationFor(state.computer, turnScript(state, adapter, argv), env), {
    onStdoutLine: (line) => adapter.parse(line).forEach(emit),
    onStderrLine: (line) => {
      stderr.push(line)
      if (stderr.length > STDERR_TAIL_LINES) stderr.shift()
      options.onEvent?.({ type: "stderr", text: line })
    },
  })
  const result = running.done.then(
    ({ code, signal }) => foldEvents(events, signal ? -1 : code, stderr.join("\n")),
    (error: Error) => ({ ok: false, text: "", error: error.message }),
  )
  return { running, result }
}

/** Stop whatever the thread is running on its computer. Best effort. */
export async function interruptRemote(computer: Computer, id: string): Promise<void> {
  assertId(id)
  const pid = pidFileExpr(id)
  // Agents spawn children (shells, tests, servers), so stop the whole tree, leaves first.
  const script = [
    `kill_tree() {`,
    `  for c in $(ps -A -o pid= -o ppid= 2>/dev/null | awk -v p="$1" '$2 == p { print $1 }'); do kill_tree "$c"; done`,
    `  kill "$1" 2>/dev/null`,
    `}`,
    `[ -f ${pid} ] && kill_tree "$(cat ${pid})"`,
    `rm -f ${pid}`,
    `true`,
  ].join("\n")
  await capture(computer, script)
}

/** Remove the thread's default work dir on its computer. Never touches a custom cwd. */
export async function cleanupRemote(state: Pick<ThreadState, "id" | "cwd" | "computer">): Promise<void> {
  assertId(state.id)
  if (state.cwd) return
  await capture(state.computer, `rm -rf "$HOME/${REMOTE_ROOT}/work/${state.id}" ${pidFileExpr(state.id)}`)
}
