import { spawn } from "node:child_process"
import { createServer } from "node:net"
import type { Computer } from "./types.js"

/**
 * How to watch (and take over) a computer's desktop, without any relay:
 * an SSH tunnel to its VNC port, or Cua's own local viewer. No session or hour limits.
 */
export type ViewPlan =
  | { readonly kind: "self"; readonly message: string }
  | { readonly kind: "command"; readonly argv: readonly string[] }
  | { readonly kind: "tunnel"; readonly tunnel: readonly string[]; readonly localPort: number; readonly url: string }
  | { readonly kind: "open"; readonly url: string }

export interface ViewOptions {
  /** VNC port on the computer (macOS Screen Sharing and most VNC servers: 5900). */
  readonly port?: number
  readonly viewOnly?: boolean
}

export const DEFAULT_VNC_PORT = 5900

function checkPort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`)
  return port
}

/** Pure: decide how to show a computer's desktop. `localPort` is a free port on this machine. */
export function viewPlan(computer: Computer, localPort: number, options: ViewOptions = {}): ViewPlan {
  const remotePort = checkPort(options.port ?? DEFAULT_VNC_PORT)
  switch (computer.kind) {
    case "local":
      return { kind: "self", message: "local is this machine: its desktop is the one in front of you." }
    case "cua":
      return { kind: "command", argv: ["cua", "sandbox", "view", ...(options.viewOnly ? ["--view-only"] : []), computer.sandbox] }
    case "ssh":
      return {
        kind: "tunnel",
        tunnel: ["ssh", "-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", ...(computer.options ?? []),
          "-L", `127.0.0.1:${checkPort(localPort)}:127.0.0.1:${remotePort}`, "--", computer.host],
        localPort,
        url: `vnc://127.0.0.1:${localPort}`,
      }
    case "docker":
      // A container's VNC port must be published; connect to it straight away.
      return { kind: "open", url: `vnc://127.0.0.1:${remotePort}` }
  }
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

/** Open a URL with the OS handler (vnc:// opens Screen Sharing on macOS). */
export function openUrl(url: string): void {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref()
}

export async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const { connect } = await import("node:net")
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = connect(port, "127.0.0.1")
      socket.once("connect", () => {
        socket.destroy()
        resolve(true)
      })
      socket.once("error", () => resolve(false))
    })
    if (ok) return
    if (Date.now() > deadline) throw new Error(`Tunnel did not open on port ${port}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/** Carry out a plan. Resolves when the viewer or tunnel exits (Ctrl-C to stop a tunnel). */
export async function runView(plan: ViewPlan, log: (line: string) => void): Promise<number> {
  if (plan.kind === "self") {
    log(plan.message)
    return 0
  }
  if (plan.kind === "open") {
    openUrl(plan.url)
    log(`opened ${plan.url}`)
    return 0
  }
  const [command, ...args] = plan.kind === "command" ? plan.argv : plan.tunnel
  const child = spawn(command!, args, { stdio: "inherit" })
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`Could not start ${command}: ${error.message}`)))
    child.once("close", (code) => resolve(code ?? 1))
  })
  if (plan.kind === "tunnel") {
    await Promise.race([waitForPort(plan.localPort, 15_000), exited.then((code) => Promise.reject(new Error(`ssh exited with code ${code}`)))])
    openUrl(plan.url)
    log(`live view: ${plan.url} (tunnel open; Ctrl-C to close)`)
  }
  return exited
}
