import { spawn, type ChildProcess } from "node:child_process"
import { resolveComputer } from "../computers.js"
import { freePort, openUrl, viewPlan, waitForPort, type ViewPlan } from "../view.js"

export type ViewResponse =
  | { readonly kind: "embed"; readonly url: string }
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "self"; readonly message: string }

interface Background {
  readonly child: ChildProcess
  readonly url: string
}

const URL_WAIT_MS = 20_000
const TUNNEL_WAIT_MS = 15_000

function alive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

/** Start `argv` and resolve with the first http(s) URL it prints. The process keeps running. */
function startForUrl(argv: readonly string[]): Promise<Background> {
  const [command, ...args] = argv
  return new Promise((resolve, reject) => {
    const child = spawn(command!, args, { stdio: ["ignore", "pipe", "pipe"] })
    let seen = ""
    const timer = setTimeout(() => fail(`${command} printed no URL within ${URL_WAIT_MS / 1000}s`), URL_WAIT_MS)
    const fail = (message: string): void => {
      clearTimeout(timer)
      child.kill()
      reject(new Error(message))
    }
    const onData = (chunk: Buffer): void => {
      seen += chunk.toString("utf8")
      const url = /https?:\/\/[^\s"'<>]+/.exec(seen)?.[0]
      if (url) {
        clearTimeout(timer)
        resolve({ child, url })
      }
    }
    child.stdout!.on("data", onData)
    child.stderr!.on("data", onData)
    child.once("error", (error) => fail(`Could not start ${command}: ${error.message}`))
    child.once("close", (code) => fail(`${command} exited with code ${code}: ${seen.trim().slice(-200)}`))
  })
}

async function startTunnel(plan: Extract<ViewPlan, { kind: "tunnel" }>): Promise<Background> {
  const [command, ...args] = plan.tunnel
  const child = spawn(command!, args, { stdio: "ignore" })
  const exited = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(new Error(`Could not start ${command}: ${error.message}`)))
    child.once("close", (code) => reject(new Error(`ssh exited with code ${code}`)))
  })
  try {
    await Promise.race([waitForPort(plan.localPort, TUNNEL_WAIT_MS), exited])
  } catch (error) {
    child.kill()
    throw error
  }
  return { child, url: plan.url }
}

/** Live desktop views for computers. Long-lived tunnels and viewers are reused and killed on close. */
export class ViewManager {
  private readonly running = new Map<string, Background>()

  async open(on: string): Promise<ViewResponse> {
    const computer = await resolveComputer(on)
    const plan = viewPlan(computer, await freePort())
    switch (plan.kind) {
      case "self":
        return { kind: "self", message: plan.message }
      case "open":
        openUrl(plan.url)
        return { kind: "external", url: plan.url }
      case "command": {
        const sandbox = plan.argv.at(-1)!
        const bg = await this.reuseOr(`cua:${sandbox}`, () => startForUrl(["cua", "sandbox", "view", "--no-open", sandbox]))
        return { kind: "embed", url: bg.url }
      }
      case "tunnel": {
        const bg = await this.reuseOr(`ssh:${on}`, () => startTunnel(plan))
        openUrl(bg.url)
        return { kind: "external", url: bg.url }
      }
    }
  }

  private async reuseOr(key: string, start: () => Promise<Background>): Promise<Background> {
    const existing = this.running.get(key)
    if (existing && alive(existing.child)) return existing
    const bg = await start()
    this.running.set(key, bg)
    bg.child.once("close", () => {
      if (this.running.get(key) === bg) this.running.delete(key)
    })
    return bg
  }

  closeAll(): void {
    for (const { child } of this.running.values()) child.kill()
    this.running.clear()
  }
}
