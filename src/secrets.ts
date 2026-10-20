import { execFileSync } from "node:child_process"
import { isEnvName } from "./shell.js"

/** Keychain account that holds openspaces secrets (service = the env var name). */
export const KEYCHAIN_ACCOUNT = "openspaces"

/** A forwarded variable's value: this process's env first, then the macOS Keychain. */
export function resolveSecret(name: string, env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  if (!isEnvName(name)) throw new Error(`Invalid environment variable name: ${name}`)
  const fromEnv = env[name]
  if (fromEnv !== undefined) return fromEnv
  if (process.platform !== "darwin") return undefined
  try {
    const value = execFileSync("security", ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", name, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return value.replace(/\n$/, "") || undefined
  } catch {
    return undefined
  }
}

/** Store a secret in the macOS Keychain (replacing any old value). */
export function storeSecret(name: string, value: string): void {
  if (!isEnvName(name)) throw new Error(`Invalid environment variable name: ${name}`)
  if (process.platform !== "darwin") throw new Error("Keychain storage is macOS only; export the variable in your shell instead")
  if (!value) throw new Error("empty secret")
  // `security` only takes the password as an argument; it is visible to `ps` for a moment on this machine.
  execFileSync("security", ["add-generic-password", "-U", "-a", KEYCHAIN_ACCOUNT, "-s", name, "-w", value], { stdio: "ignore" })
}

export function hasSecret(name: string): boolean {
  return resolveSecret(name) !== undefined
}
