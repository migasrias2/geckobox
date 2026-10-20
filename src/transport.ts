import { spawn, type ChildProcess } from "node:child_process"
import { createInterface } from "node:readline"
import { exportLines, quote } from "./shell.js"
import type { Computer } from "./types.js"

export interface Invocation {
  readonly command: string
  readonly args: readonly string[]
  /** Script fed on stdin (keeps secrets out of argv), or undefined. */
  readonly stdin?: string
}

/**
 * Build the local process that runs `script` on the computer.
 * `env` is exported inside the script. Where the transport can carry stdin,
 * the script goes over stdin so secret values never appear in argv.
 */
export function invocationFor(computer: Computer, script: string, env: Readonly<Record<string, string | undefined>> = {}): Invocation {
  const exports = exportLines(env)
  const full = exports ? `${exports}\n${script}` : script
  switch (computer.kind) {
    case "local":
      return { command: "/bin/sh", args: ["-s"], stdin: full }
    case "ssh":
      return {
        command: "ssh",
        args: ["-T", "-o", "BatchMode=yes", ...(computer.options ?? []), "--", computer.host, "sh -l -s"],
        stdin: full,
      }
    case "container":
    case "docker":
    case "podman":
      return {
        command: computer.kind,
        args: ["exec", "-i", ...(computer.user ? ["-u", computer.user] : []), computer.container, "sh", "-l", "-s"],
        stdin: full,
      }
    case "cua":
      // `cua sandbox exec` does not forward stdin; it joins args into one `sh -c` line.
      // So here the script, including forwarded env values, is visible in argv (see README, Safety).
      return { command: "cua", args: ["sandbox", "exec", computer.sandbox, `sh -l -c ${quote(full)}`] }
  }
}

export interface RunHandlers {
  readonly onStdoutLine?: (line: string) => void
  readonly onStderrLine?: (line: string) => void
}

export interface Running {
  readonly child: ChildProcess
  readonly done: Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>
}

export function start(invocation: Invocation, handlers: RunHandlers = {}): Running {
  const child = spawn(invocation.command, [...invocation.args], { stdio: ["pipe", "pipe", "pipe"] })
  if (handlers.onStdoutLine) createInterface({ input: child.stdout! }).on("line", handlers.onStdoutLine)
  else child.stdout!.resume()
  if (handlers.onStderrLine) createInterface({ input: child.stderr! }).on("line", handlers.onStderrLine)
  else child.stderr!.resume()
  child.stdin!.on("error", () => undefined) // the target may exit before reading everything
  child.stdin!.end(invocation.stdin ?? "")
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`Could not start ${invocation.command}: ${error.message}`)))
    child.once("close", (code, signal) => resolve({ code, signal }))
  })
  return { child, done }
}

/** Run a short script and collect its output. */
export async function capture(
  computer: Computer,
  script: string,
  env: Readonly<Record<string, string | undefined>> = {},
): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  const out: string[] = []
  const err: string[] = []
  const running = start(invocationFor(computer, script, env), {
    onStdoutLine: (line) => out.push(line),
    onStderrLine: (line) => err.push(line),
  })
  const { code } = await running.done
  return { code, stdout: out.join("\n"), stderr: err.join("\n") }
}
