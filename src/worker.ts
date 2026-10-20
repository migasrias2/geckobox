import { spawn } from "node:child_process"
import { existsSync, openSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { threadDir } from "./paths.js"

/** The CLI entry. Built code sits next to cli.js; under vitest (src/) fall back to dist/cli.js. */
function cliPath(): string {
  const beside = fileURLToPath(new URL("./cli.js", import.meta.url))
  return existsSync(beside) ? beside : fileURLToPath(new URL("../dist/cli.js", import.meta.url))
}

/** Run the thread's pending turn in a detached worker that outlives the caller. */
export function spawnWorker(id: string): void {
  const log = openSync(join(threadDir(id), "worker.log"), "a", 0o600)
  const child = spawn(process.execPath, [cliPath(), "__worker", id], { detached: true, stdio: ["ignore", log, log] })
  child.once("error", (error) => process.stderr.write(`openspaces: could not start the worker: ${error.message}\n`))
  child.unref()
}
