import { describe, expect, it } from "vitest"
import { AGENT_NAMES, getAgent } from "../src/agents/index.js"
import { parseJson } from "../src/agents/types.js"

const base = { prompt: "do it", autoApprove: false }

describe("getAgent", () => {
  it("knows every agent and rejects others", () => {
    expect(AGENT_NAMES).toEqual(["claude-code", "codex", "gemini", "opencode", "shell"])
    expect(() => getAgent("hal")).toThrow(/Unknown agent/)
  })
})

describe("parseJson", () => {
  it("ignores non-object lines", () => {
    expect(parseJson("hello")).toBeUndefined()
    expect(parseJson("{broken")).toBeUndefined()
    expect(parseJson("[1]")).toBeUndefined()
  })
})

describe("claude-code", () => {
  const a = getAgent("claude-code")
  it("builds first and resumed turns", () => {
    expect(a.argv(base)).toEqual(["claude", "-p", "do it", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"])
    expect(a.argv({ ...base, autoApprove: true, model: "haiku", sessionId: "s1" })).toEqual([
      "claude", "-p", "do it", "--output-format", "stream-json", "--verbose",
      "--dangerously-skip-permissions", "--model", "haiku", "--resume", "s1",
    ])
  })
  it("parses the stream", () => {
    expect(a.parse(JSON.stringify({ type: "system", subtype: "init", session_id: "s1" }))).toEqual([{ type: "session", sessionId: "s1" }])
    expect(
      a.parse(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }, { type: "tool_use", name: "Bash" }, { type: "thinking" }] } })),
    ).toEqual([{ type: "text", text: "hi" }, { type: "tool", name: "Bash" }])
    expect(a.parse(JSON.stringify({ type: "assistant", message: {} }))).toEqual([])
    expect(a.parse(JSON.stringify({ type: "result", subtype: "success", result: "ok", session_id: "s1", total_cost_usd: 0.01 }))).toEqual([
      { type: "session", sessionId: "s1" },
      { type: "result", ok: true, text: "ok", costUsd: 0.01 },
    ])
    expect(a.parse(JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true }))).toEqual([
      { type: "result", ok: false, text: "error_max_turns" },
    ])
    expect(a.parse("not json")).toEqual([])
  })
})

describe("codex", () => {
  const a = getAgent("codex")
  it("builds first and resumed turns", () => {
    expect(a.argv(base)).toEqual(["codex", "exec", "--json", "--skip-git-repo-check", "--full-auto", "do it"])
    expect(a.argv({ ...base, autoApprove: true, sessionId: "t1", model: "gpt-5" })).toEqual([
      "codex", "exec", "--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "--model", "gpt-5", "resume", "t1", "do it",
    ])
  })
  it("parses the stream", () => {
    expect(a.parse('{"type":"thread.started","thread_id":"t1"}')).toEqual([{ type: "session", sessionId: "t1" }])
    expect(a.parse('{"type":"item.completed","item":{"type":"agent_message","text":"hi"}}')).toEqual([{ type: "text", text: "hi" }])
    expect(a.parse('{"type":"item.completed","item":{"type":"command_execution"}}')).toEqual([{ type: "tool", name: "shell" }])
    expect(a.parse('{"type":"item.completed","item":{"type":"reasoning"}}')).toEqual([])
    expect(a.parse('{"type":"turn.completed"}')).toEqual([{ type: "result", ok: true, text: "" }])
    expect(a.parse('{"type":"turn.failed","error":{"message":"boom"}}')).toEqual([{ type: "result", ok: false, text: "boom" }])
    expect(a.parse('{"type":"other"}')).toEqual([])
  })
})

describe("gemini", () => {
  const a = getAgent("gemini")
  it("builds turns", () => {
    expect(a.argv({ ...base, sessionId: "g1" })).toContain("--resume")
    expect(a.argv({ ...base, autoApprove: true, model: "m" })).toEqual(["gemini", "-p", "do it", "--output-format", "stream-json", "--yolo", "--model", "m"])
  })
  it("parses the stream", () => {
    expect(a.parse('{"type":"init","session_id":"g1"}')).toEqual([{ type: "session", sessionId: "g1" }])
    expect(a.parse('{"type":"message","role":"assistant","content":"hi"}')).toEqual([{ type: "text", text: "hi" }])
    expect(a.parse('{"type":"tool_use","tool_name":"ls"}')).toEqual([{ type: "tool", name: "ls" }])
    expect(a.parse('{"type":"result","status":"success"}')).toEqual([{ type: "result", ok: true, text: "" }])
    expect(a.parse('{"type":"message","role":"user","content":"x"}')).toEqual([])
  })
})

describe("opencode", () => {
  const a = getAgent("opencode")
  it("builds turns", () => {
    expect(a.argv({ ...base, sessionId: "o1", model: "m" })).toEqual(["opencode", "run", "--format", "json", "--model", "m", "--session", "o1", "do it"])
  })
  it("parses the stream", () => {
    expect(a.parse('{"type":"text","sessionID":"o1","part":{"text":"hi"}}')).toEqual([
      { type: "session", sessionId: "o1" },
      { type: "text", text: "hi" },
    ])
    expect(a.parse('{"type":"tool_use","part":{"tool":"bash"}}')).toEqual([{ type: "tool", name: "bash" }])
    expect(a.parse('{"type":"error","message":"no"}')).toEqual([{ type: "result", ok: false, text: "no" }])
  })
})

describe("shell", () => {
  it("runs the prompt as a script and echoes lines", () => {
    const a = getAgent("shell")
    expect(a.argv(base)).toEqual(["sh", "-c", "do it"])
    expect(a.parse("line")).toEqual([{ type: "text", text: "line" }])
  })
})

describe("cua tool targets", () => {
  it("records which Cua computer a tool acted on", async () => {
    const { cuaTarget } = await import("../src/agents/claudeCode.js")
    const a = getAgent("claude-code")
    const line = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__cua__space_bash", input: { space: "claude-desk", command: "ls" } }] } })
    expect(a.parse(line)).toEqual([{ type: "tool", name: "mcp__cua__space_bash", target: "claude-desk" }])
    expect(cuaTarget("mcp__cua__sandbox_open_browser", { name: "local:claude-desk" })).toBe("local:claude-desk")
    expect(cuaTarget("Bash", { space: "x" })).toBeUndefined()
    expect(cuaTarget("mcp__cua__space_bash", { space: "x; rm -rf /" })).toBeUndefined()
  })
})

describe("allowTools", () => {
  it("pre-approves named tools only when not auto-approving", () => {
    const a = getAgent("claude-code")
    expect(a.argv({ prompt: "p", autoApprove: false, allowTools: ["mcp__cua"] })).toContain("--allowedTools")
    expect(a.argv({ prompt: "p", autoApprove: false, allowTools: ["mcp__cua", "Bash(git:*)"] })).toContain("mcp__cua,Bash(git:*)")
    expect(a.argv({ prompt: "p", autoApprove: true, allowTools: ["mcp__cua"] })).not.toContain("--allowedTools")
  })
})
