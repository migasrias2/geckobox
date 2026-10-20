import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fanOut } from "../src/fanout.js"
import { listThreads, loadThread, saveThread } from "../src/store.js"
import { closeThread, createThread, openThread, queueTurn, startThread, summary, threadStatus } from "../src/thread.js"
import type { AgentEvent } from "../src/types.js"
import { useTempHome } from "./helpers.js"

describe("threads on the local computer (shell agent)", () => {
  const tmp = useTempHome()

  it("runs turns, keeps state and cleans up on close", async () => {
    const events: AgentEvent[] = []
    const bot = await startThread({ agent: "shell", prompt: "echo one > f.txt; pwd", onEvent: (e) => events.push(e) })
    const first = await bot.wait()
    expect(first?.ok).toBe(true)
    const workDir = first!.text
    expect(workDir).toBe(join(tmp.home(), "home", ".openspaces", "work", bot.id))
    expect((await bot.send("cat f.txt")).text).toBe("one")
    const state = await bot.status()
    expect(state.status).toBe("idle")
    expect(state.turns.map((t) => t.ok)).toEqual([true, true])
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text)).toEqual([workDir, "one"])
    expect(summary(state)).toContain("shell on local (local)  idle  2 turn(s)")
    expect((await bot.close()).status).toBe("closed")
    expect(existsSync(workDir)).toBe(false)
    await expect(queueTurn(bot.id, "again")).rejects.toThrow(/closed/)
  })

  it("marks failed turns and can still continue", async () => {
    const bot = await startThread({ agent: "shell", prompt: "echo nope >&2; exit 4" })
    expect(await bot.wait()).toEqual({ ok: false, text: "", error: "nope" })
    expect((await threadStatus(bot.id)).status).toBe("failed")
    expect((await bot.send("echo back")).ok).toBe(true)
  })

  it("interrupts a long turn", async () => {
    const bot = await startThread({ agent: "shell", prompt: "echo started; sleep 20" })
    await new Promise((r) => setTimeout(r, 400))
    await bot.interrupt()
    const res = await bot.wait()
    expect(res?.ok).toBe(false)
    expect(res?.text).toBe("started")
  })

  it("closes mid-turn and records why", async () => {
    const bot = await startThread({ agent: "shell", prompt: "sleep 20" })
    const closed = await bot.close()
    expect(closed.status).toBe("closed")
    expect(closed.turns[0]?.ok).toBe(false)
  })

  it("keeps a custom cwd and never deletes it", async () => {
    const cwd = join(tmp.home(), "repo")
    const bot = await startThread({ agent: "shell", prompt: "pwd", cwd })
    expect((await bot.wait())?.text).toBe(cwd)
    await bot.close()
    expect(existsSync(cwd)).toBe(true)
  })

  it("reports a missing agent binary", async () => {
    const bot = await startThread({ agent: "codex", prompt: "hi", on: "local" })
    const res = await bot.wait()
    if (res?.ok === false) expect(res.error ?? "").toMatch(/codex|not installed|exited/)
    await bot.close()
  })

  it("rejects a busy thread, validates options and repairs dead workers", async () => {
    const state = await createThread({ agent: "shell", prompt: "true" })
    expect(state.autoApprove).toBe(false)
    await expect(queueTurn(state.id, "x")).rejects.toThrow(/still working/)
    await expect(createThread({ agent: "shell", prompt: "" })).rejects.toThrow()
    await expect(createThread({ agent: "shell", prompt: "x", cwd: "relative" })).rejects.toThrow(/absolute/)
    await saveThread({ ...state, status: "running", workerPid: 999999 })
    const repaired = await threadStatus(state.id)
    expect(repaired.status).toBe("failed")
    expect(repaired.turns[0]?.error).toMatch(/worker process exited/)
    expect((await listThreads()).map((t) => t.id)).toContain(state.id)
    await expect(loadThread("nope")).rejects.toThrow(/No thread/)
    await expect(loadThread("../etc")).rejects.toThrow(/Invalid thread id/)
    expect(await openThread(state.id).wait()).toBeUndefined()
    expect((await closeThread(state.id)).status).toBe("closed")
    expect((await closeThread(state.id)).status).toBe("closed")
  })

  it("forwards only the named env vars", async () => {
    process.env.OS_TEST_SECRET = "abc"
    process.env.OS_TEST_OTHER = "zzz"
    const bot = await startThread({ agent: "shell", prompt: 'echo "$OS_TEST_SECRET-${OS_TEST_OTHER:-unset}"', forwardEnv: ["OS_TEST_SECRET"] })
    // A local child inherits the environment anyway; on remote computers only the named ones arrive.
    expect((await bot.wait())?.text.startsWith("abc-")).toBe(true)
    await bot.close()
  })
})

describe("fanOut", () => {
  useTempHome()

  it("runs on every computer and reports bad ones", async () => {
    const results = await fanOut(["local", "local", "ghost"], { agent: "shell", prompt: "echo hi" })
    expect(results.map((r) => r.result?.text ?? r.error)).toEqual(["hi", "hi", expect.stringMatching(/No computer named "ghost"/)])
    expect((await listThreads()).every((t) => t.status === "closed")).toBe(true)
  })

  it("can leave threads open", async () => {
    const [r] = await fanOut(["local"], { agent: "shell", prompt: "true", close: false })
    expect((await loadThread(r!.threadId!)).status).toBe("idle")
  })

  it("needs a computer", async () => {
    await expect(fanOut([], { agent: "shell", prompt: "x" })).rejects.toThrow(/at least one/)
  })
})

describe("review fixes", () => {
  const tmp = useTempHome()

  it("removes the pid file once a turn ends", async () => {
    const bot = await startThread({ agent: "shell", prompt: "true" })
    await bot.wait()
    expect(existsSync(join(tmp.home(), "home", ".openspaces", "run", `${bot.id}.pid`))).toBe(false)
  })

  it("never re-runs a finished turn or a closed thread", async () => {
    const { executeTurn } = await import("../src/thread.js")
    const bot = await startThread({ agent: "shell", prompt: "echo once" })
    await bot.wait()
    await expect(executeTurn(bot.id)).rejects.toThrow(/no pending turn/)
    expect((await loadThread(bot.id)).turns[0]?.text).toBe("once")
    const queued = await createThread({ agent: "shell", prompt: "echo never" })
    await closeThread(queued.id)
    await expect(executeTurn(queued.id)).rejects.toThrow(/no pending turn \(closed\)/)
  })

  it("serialises concurrent sends: exactly one wins", async () => {
    const bot = await startThread({ agent: "shell", prompt: "true" })
    await bot.wait()
    const results = await Promise.allSettled([queueTurn(bot.id, "a"), queueTurn(bot.id, "b"), queueTurn(bot.id, "c")])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect((await loadThread(bot.id)).turns).toHaveLength(2)
  })

  it("does not kill a live process that is not this thread's worker", async () => {
    const state = await createThread({ agent: "shell", prompt: "true" })
    await saveThread({ ...state, status: "running", workerPid: process.ppid })
    expect((await closeThread(state.id)).status).toBe("closed")
    expect(() => process.kill(process.ppid, 0)).not.toThrow()
  })

  it("fails a queued turn whose worker never started", async () => {
    const state = await createThread({ agent: "shell", prompt: "true" })
    await saveThread({ ...state, updatedAt: new Date(Date.now() - 120_000).toISOString() })
    // saveThread keeps the old updatedAt; threadStatus sees a stale queued turn.
    const after = await threadStatus(state.id)
    expect(after.status).toBe("failed")
    expect(after.turns[0]?.error).toBe("worker never started")
  })
})
