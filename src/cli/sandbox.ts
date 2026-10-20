import { createInterface } from "node:readline"
import { createSandbox, listSandboxes, removeSandbox, setSandboxRunning, type SandboxOptions } from "../sandbox.js"
import { hasSecret, storeSecret } from "../secrets.js"
import { err, out } from "./format.js"

export async function cmdSandbox(sub: string | undefined, args: readonly string[], options: Omit<SandboxOptions, "name">): Promise<number> {
  if (sub === "create") {
    const name = args[0]
    if (!name) throw new Error("usage: openspaces sandbox create <name> [--agents claude-code,codex] [--image …] [--cpus 4] [--memory 4]")
    const computer = await createSandbox({ ...options, name }, (line) => out(`· ${line}`))
    const missing = (computer.forwardEnv ?? []).filter((key) => !hasSecret(key))
    if (missing.length === (computer.forwardEnv ?? []).length && missing.length > 0) {
      out(`\nTo log the agent in, store one of: ${missing.join(", ")}`)
      out(`  e.g. claude setup-token, then: openspaces secrets set CLAUDE_CODE_OAUTH_TOKEN`)
    }
    return 0
  }
  if (sub === undefined || sub === "ls") {
    const sandboxes = await listSandboxes()
    if (sandboxes.length === 0) out('no sandboxes yet. Create one: openspaces sandbox create dev')
    sandboxes.forEach((s) => out(`${s.name.padEnd(16)}${s.state.padEnd(10)}${s.runtime}:${s.container}`))
    return 0
  }
  const name = args[0]
  if (!name) throw new Error(`usage: openspaces sandbox ${sub} <name>`)
  if (sub === "rm") {
    await removeSandbox(name)
    out(`removed ${name}`)
    return 0
  }
  if (sub === "stop" || sub === "start") {
    const s = await setSandboxRunning(name, sub === "start")
    out(`${s.name} ${s.state}`)
    return 0
  }
  throw new Error(`unknown subcommand: sandbox ${sub}`)
}

/** Read a secret from stdin (hidden when typed) and store it in the Keychain. */
export async function cmdSecrets(sub: string | undefined, args: readonly string[]): Promise<number> {
  const name = args[0]
  if (sub === "check" && name) {
    out(`${name}: ${hasSecret(name) ? "set" : "not set"}`)
    return hasSecret(name) ? 0 : 1
  }
  if (sub !== "set" || !name) throw new Error("usage: openspaces secrets set <NAME>   (value read from stdin)  |  openspaces secrets check <NAME>")
  const value = await readSecret(`${name}: `)
  storeSecret(name, value.trim())
  out(`stored ${name} in the Keychain (account "openspaces")`)
  return 0
}

async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString("utf8")
  }
  err(prompt)
  const rl = createInterface({ input: process.stdin, terminal: true })
  process.stdin.setRawMode?.(true)
  return new Promise((resolve) => {
    let value = ""
    process.stdin.on("data", (data: Buffer) => {
      const text = data.toString("utf8")
      if (text === "\r" || text === "\n" || text === "\u0004") {
        process.stdin.setRawMode?.(false)
        rl.close()
        resolve(value)
      } else if (text === "\u0003") process.exit(130)
      else value += text
    })
  })
}
