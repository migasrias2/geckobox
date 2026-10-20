import type { AgentEvent } from "../types.js"
import { parseJson, str, type AgentAdapter } from "./types.js"

/** OpenAI Codex CLI: `codex exec --json`, resumed with `codex exec resume <id>`. */
export const codex: AgentAdapter = {
  name: "codex",
  binary: "codex",
  tested: false,
  argv({ prompt, sessionId, autoApprove, model }) {
    const flags = [
      "--json",
      "--skip-git-repo-check",
      ...(autoApprove ? ["--dangerously-bypass-approvals-and-sandbox"] : ["--full-auto"]),
      ...(model ? ["--model", model] : []),
    ]
    return sessionId ? ["codex", "exec", ...flags, "resume", sessionId, prompt] : ["codex", "exec", ...flags, prompt]
  },
  parse(line) {
    const msg = parseJson(line)
    if (!msg) return []
    const item = msg.item as Record<string, unknown> | undefined
    switch (msg.type) {
      case "thread.started": {
        const sessionId = str(msg.thread_id)
        return sessionId ? [{ type: "session", sessionId }] : []
      }
      case "item.completed":
        if (item?.type === "agent_message" && typeof item.text === "string") return [{ type: "text", text: item.text }]
        if (item?.type === "command_execution") return [{ type: "tool", name: "shell" }]
        return []
      case "turn.completed":
        return [{ type: "result", ok: true, text: "" }]
      case "turn.failed":
      case "error": {
        const error = (msg.error as { message?: unknown } | undefined)?.message ?? msg.message
        return [{ type: "result", ok: false, text: str(error) ?? "codex turn failed" }]
      }
      default:
        return []
    }
  },
}

/** Google Gemini CLI headless mode with stream-json output. */
export const gemini: AgentAdapter = {
  name: "gemini",
  binary: "gemini",
  tested: false,
  argv({ prompt, sessionId, autoApprove, model }) {
    return [
      "gemini",
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      ...(autoApprove ? ["--yolo"] : ["--approval-mode", "auto_edit"]),
      ...(model ? ["--model", model] : []),
      ...(sessionId ? ["--resume", sessionId] : []),
    ]
  },
  parse(line) {
    const msg = parseJson(line)
    if (!msg) return []
    if (msg.type === "init") {
      const sessionId = str(msg.session_id)
      return sessionId ? [{ type: "session", sessionId }] : []
    }
    if (msg.type === "message" && msg.role === "assistant" && typeof msg.content === "string") {
      return [{ type: "text", text: msg.content }]
    }
    if (msg.type === "tool_use") return [{ type: "tool", name: str(msg.tool_name) ?? "tool" }]
    if (msg.type === "result") return [{ type: "result", ok: msg.status === "success", text: "" }]
    return []
  },
}

/** OpenCode: `opencode run --format json`, resumed with `--session`. */
export const opencode: AgentAdapter = {
  name: "opencode",
  binary: "opencode",
  tested: false,
  argv({ prompt, sessionId, model }) {
    return [
      "opencode",
      "run",
      "--format",
      "json",
      ...(model ? ["--model", model] : []),
      ...(sessionId ? ["--session", sessionId] : []),
      prompt,
    ]
  },
  parse(line) {
    const msg = parseJson(line)
    if (!msg) return []
    const events: AgentEvent[] = []
    const sessionId = str(msg.sessionID)
    if (sessionId) events.push({ type: "session", sessionId })
    const part = msg.part as Record<string, unknown> | undefined
    if (msg.type === "text" && typeof part?.text === "string") events.push({ type: "text", text: part.text })
    if (msg.type === "tool_use") events.push({ type: "tool", name: str(part?.tool) ?? "tool" })
    if (msg.type === "error") events.push({ type: "result", ok: false, text: str(msg.message) ?? "opencode error" })
    return events
  },
}

/** Any shell command: the prompt is the script. No session; every turn is fresh. */
export const shellAgent: AgentAdapter = {
  name: "shell",
  binary: "sh",
  tested: true,
  argv({ prompt }) {
    return ["sh", "-c", prompt]
  },
  parse(line) {
    return [{ type: "text", text: line }]
  },
}
