import { appendFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { threadDir, threadsDir } from "./paths.js"
import type { AgentEvent, ThreadState } from "./types.js"

const SAFE_ID = /^[a-z0-9-]+$/

function dirFor(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid thread id: ${id}`)
  return threadDir(id)
}

/** Thread dirs hold prompts and agent output, so only the owner can read them. */
export async function ensureDir(id: string): Promise<string> {
  const dir = dirFor(id)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  return dir
}

const LOCK_STALE_MS = 10_000
const LOCK_WAIT_MS = 15_000

/** Serialise state changes between the CLI, workers and SDK hosts. */
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const lock = join(await ensureDir(id), "lock")
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      await (await open(lock, "wx")).close()
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const age = Date.now() - ((await stat(lock).catch(() => undefined))?.mtimeMs ?? Date.now())
      if (age > LOCK_STALE_MS) await rm(lock, { force: true })
      else if (Date.now() > deadline) throw new Error(`Thread ${id} is locked by another process`)
      else await new Promise((resolve) => setTimeout(resolve, 15))
    }
  }
  try {
    return await fn()
  } finally {
    await rm(lock, { force: true })
  }
}

export async function saveThread(state: ThreadState): Promise<ThreadState> {
  const dir = await ensureDir(state.id)
  const file = join(dir, "state.json")
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(tmp, file)
  return state
}

export async function loadThread(id: string): Promise<ThreadState> {
  try {
    return JSON.parse(await readFile(join(dirFor(id), "state.json"), "utf8")) as ThreadState
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`No thread "${id}"`)
    throw error
  }
}

/** Read, transform, write. The transform must return a new object. */
export async function updateThread(id: string, change: (state: ThreadState) => ThreadState): Promise<ThreadState> {
  return withLock(id, async () => {
    const current = await loadThread(id)
    return saveThread({ ...change(current), updatedAt: new Date().toISOString() })
  })
}

export async function listThreads(): Promise<readonly ThreadState[]> {
  let ids: string[]
  try {
    ids = await readdir(threadsDir())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  const states = await Promise.all(ids.filter((id) => SAFE_ID.test(id)).map((id) => loadThread(id).catch(() => undefined)))
  return states
    .filter((s): s is ThreadState => s !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function eventsFile(id: string): string {
  return join(dirFor(id), "events.jsonl")
}

export async function appendEvent(id: string, turn: number, event: AgentEvent): Promise<void> {
  await appendFile(eventsFile(id), `${JSON.stringify({ at: new Date().toISOString(), turn, ...event })}\n`, { mode: 0o600 })
}

export async function deleteThread(id: string): Promise<void> {
  await rm(dirFor(id), { recursive: true, force: true })
}
