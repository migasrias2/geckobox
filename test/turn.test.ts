import { describe, expect, it } from "vitest"
import { getAgent } from "../src/agents/index.js"
import { foldEvents, turnScript } from "../src/turn.js"

describe("turnScript", () => {
  it("uses a per-thread work dir and records its pid", () => {
    const script = turnScript({ id: "shell-1" }, getAgent("shell"), ["sh", "-c", "echo 'x'"])
    expect(script).toContain('W="$HOME/.openspaces/work/shell-1"')
    expect(script).toContain('P="$HOME/.openspaces/run/shell-1.pid"')
    expect(script).toContain(`trap 'rm -f "$P"' EXIT`)
    expect(script).toContain(`\nsh -c 'echo '\\''x'\\''' </dev/null`)
  })
  it("quotes a custom cwd", () => {
    expect(turnScript({ id: "a", cwd: "/tmp/my repo" }, getAgent("shell"), ["true"])).toContain("W='/tmp/my repo'")
  })
  it("rejects unsafe ids", () => {
    expect(() => turnScript({ id: "../x" }, getAgent("shell"), ["true"])).toThrow(/Invalid thread id/)
  })
})

describe("foldEvents", () => {
  it("uses the result event and keeps the last session id", () => {
    expect(
      foldEvents([{ type: "session", sessionId: "a" }, { type: "text", text: "hi" }, { type: "session", sessionId: "b" }, { type: "result", ok: true, text: "done", costUsd: 1 }], 0, ""),
    ).toEqual({ sessionId: "b", ok: true, text: "done", costUsd: 1 })
  })
  it("falls back to the last text when the result is empty", () => {
    expect(foldEvents([{ type: "text", text: "one" }, { type: "text", text: "two" }, { type: "result", ok: true, text: "" }], 0, "")).toEqual({ ok: true, text: "two" })
  })
  it("fails a successful result if the process failed", () => {
    expect(foldEvents([{ type: "result", ok: true, text: "x" }], 1, "crash")).toEqual({ ok: false, text: "x", error: "crash" })
  })
  it("reports a failed result's text as the error", () => {
    expect(foldEvents([{ type: "result", ok: false, text: "bad" }], 1, "")).toEqual({ ok: false, text: "bad", error: "bad" })
  })
  it("joins text and uses the exit code when there is no result", () => {
    expect(foldEvents([{ type: "text", text: "a" }, { type: "text", text: "b" }], 0, "")).toEqual({ ok: true, text: "a\nb" })
    expect(foldEvents([], 127, "not installed")).toEqual({ ok: false, text: "", error: "not installed" })
    expect(foldEvents([], 2, "")).toEqual({ ok: false, text: "", error: "exited with code 2" })
  })
})
