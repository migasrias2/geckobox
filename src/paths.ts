import { homedir } from "node:os"
import { join } from "node:path"

/** Root of all local state. Override with OPENSPACES_HOME. */
export function stateHome(): string {
  return process.env.OPENSPACES_HOME ?? join(homedir(), ".openspaces")
}

export function computersFile(): string {
  return join(stateHome(), "computers.json")
}

export function threadsDir(): string {
  return join(stateHome(), "threads")
}

export function threadDir(id: string): string {
  return join(threadsDir(), id)
}

/** Work and pid dirs on the target computer, relative to its $HOME. */
export const REMOTE_ROOT = ".openspaces"
