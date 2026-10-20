import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cmdClose, cmdComputers, cmdInterrupt, cmdLogs, cmdRun, cmdStatus, cmdWait, cmdWorker } from "../src/cli/commands.js"
import { eventLine, threadDetail, threadRow } from "../src/cli/format.js"
import { createThread } from "../src/thread.js"
import { useTempHome } from "./helpers.js"

const run = promisify(execFile)

function captureOut(): { readonly text: () => string } {
  const chunks: string[] = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return { text: () => chunks.join("") }
}

describe("cli commands (in process)", () => {
  useTempHome()
  afterEach(() => vi.restoreAllMocks())

  it("manages computers", async () => {
    const o = captureOut()
    expect(await cmdComputers("add", ["mini", "ssh:me@mini"])).toBe(0)
    expect(await cmdComputers("ls", [])).toBe(0)
    expect(await cmdComputers("test", ["local"])).toBe(0)
    expect(await cmdComputers("rm", ["mini"])).toBe(0)
    expect(o.text()).toMatch(/added mini → ssh:me@mini[\s\S]*mini\s+ssh:me@mini[\s\S]*✓ sh[\s\S]*removed mini/)
    await expect(cmdComputers("add", [])).rejects.toThrow(/usage/)
    await expect(cmdComputers("rm", [])).rejects.toThrow(/usage/)
    await expect(cmdComputers("nope", [])).rejects.toThrow(/unknown subcommand/)
  })

  it("runs a job on several computers", async () => {
    const o = captureOut()
    const flags = { agent: "shell" as const, prompt: "echo hi", keep: false, env: [], wait: false }
    expect(await cmdRun({ ...flags, on: "local", computers: ["local", "local"] })).toBe(0)
    expect(o.text()).toMatch(/\[local\] hi[\s\S]*✓ local {2}hi/)
    expect(await cmdRun({ ...flags, prompt: "exit 1", on: "local", computers: ["local"] })).toBe(1)
  })

  it("works a thread through the worker, status, logs, wait and close", async () => {
    const o = captureOut()
    const state = await createThread({ agent: "shell", prompt: "echo from-worker" })
    expect(await cmdWorker(state.id)).toBe(0)
    expect(await cmdWait(state.id)).toBe(0)
    expect(await cmdStatus(state.id)).toBe(0)
    expect(await cmdStatus(undefined)).toBe(0)
    expect(await cmdLogs(state.id, true)).toBe(0)
    expect(await cmdInterrupt(state.id)).toBe(0)
    expect(await cmdClose(state.id)).toBe(0)
    const text = o.text()
    expect(text).toContain("from-worker")
    expect(text).toContain(`thread    ${state.id}`)
    expect(text).toContain(`closed ${state.id} (work dir deleted)`)
  })

  it("reports a failed turn and an empty list", async () => {
    const o = captureOut()
    expect(await cmdStatus(undefined)).toBe(0)
    const state = await createThread({ agent: "shell", prompt: "echo bad >&2; exit 2" })
    expect(await cmdWorker(state.id)).toBe(1)
    expect(await cmdWait(state.id)).toBe(1)
    expect(o.text()).toMatch(/no threads yet[\s\S]*bad/)
  })
})

describe("format", () => {
  it("renders events, rows and details", () => {
    expect(eventLine({ type: "text", text: "a" }, "> ")).toBe("> a")
    expect(eventLine({ type: "tool", name: "Bash" })).toBe("· Bash")
    expect(eventLine({ type: "stderr", text: "x" })).toBe("! x")
    expect(eventLine({ type: "session", sessionId: "s" })).toBeUndefined()
    const state = {
      id: "t-1", agent: "claude-code", on: "mini", computer: { kind: "ssh", host: "me@mini" }, deleteOnClose: true,
      autoApprove: true, model: "haiku", forwardEnv: [], status: "idle", createdAt: "", updatedAt: "",
      turns: [{ index: 0, prompt: "p", startedAt: "", endedAt: "2026-10-20T00:00:00Z", ok: true, text: "answer", costUsd: 0.5 }, { index: 1, prompt: "q", startedAt: "" }],
    } as const
    expect(threadRow(state)).toContain("t-1")
    const detail = threadDetail(state)
    expect(detail).toContain("mini → ssh:me@mini")
    expect(detail).toContain("cost      $0.5000")
    expect(detail).toContain("✓ answer")
    expect(detail).toContain("… working")
  })
})

describe("built cli (end to end)", () => {
  const tmp = useTempHome()
  beforeAll(async () => {
    await run("npm", ["run", "build"], { cwd: process.cwd() })
  }, 60000)

  const cli = (...args: string[]) =>
    run(process.execPath, ["dist/cli.js", ...args], { env: { ...process.env } }).then(
      (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
    )

  it("starts a background thread, sends, waits and closes", async () => {
    expect(tmp.home()).toBeTruthy()
    const started = await cli("start", "--agent", "shell", "--wait", "echo first > f; echo ok")
    expect(started.code).toBe(0)
    const [id, answer] = started.out.trim().split("\n")
    expect(answer).toBe("ok")
    const sent = await cli("send", id!, "--wait", "cat", "f")
    expect(sent.out.trim()).toBe("first")
    expect((await cli("ls")).out).toContain(id)
    expect((await cli("close", id!)).out).toContain("closed")
  })

  it("prints help and errors", async () => {
    expect((await cli()).code).toBe(1)
    expect((await cli("--help")).out).toContain("openspaces run --on a,b,c")
    const bad = await cli("frobnicate")
    expect(bad.code).toBe(1)
    expect(bad.err).toContain('unknown command "frobnicate"')
    expect((await cli("start", "--agent", "hal", "x")).err).toContain("Unknown agent")
    expect((await cli("run", "x")).err).toContain("usage: openspaces run")
  })
})
