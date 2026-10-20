import type { AgentEvent } from "../types.js"
import { parseJson, str, type AgentAdapter } from "./types.js"

const TARGET = /^[A-Za-z0-9_][A-Za-z0-9_.:@-]{0,127}$/

/** The Cua Space or sandbox a `mcp__cua__*` tool call acts on, if it names one. */
export function cuaTarget(tool: string, input: unknown): string | undefined {
  if (!tool.startsWith("mcp__cua__") || !input || typeof input !== "object") return undefined
  const fields = input as Record<string, unknown>
  const value = [fields.space, fields.name, fields.sandbox].find((v): v is string => typeof v === "string" && TARGET.test(v))
  return value
}

/** Claude Code in print mode with the stream-json output format. */
export const claudeCode: AgentAdapter = {
  name: "claude-code",
  binary: "claude",
  tested: true,
  argv({ prompt, sessionId, autoApprove, model }) {
    return [
      "claude",
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      ...(autoApprove ? ["--dangerously-skip-permissions"] : ["--permission-mode", "acceptEdits"]),
      ...(model ? ["--model", model] : []),
      ...(sessionId ? ["--resume", sessionId] : []),
    ]
  },
  parse(line) {
    const msg = parseJson(line)
    if (!msg) return []
    const type = str(msg.type)
    if (type === "system" && msg.subtype === "init") {
      const sessionId = str(msg.session_id)
      return sessionId ? [{ type: "session", sessionId }] : []
    }
    if (type === "assistant") {
      const content = (msg.message as { content?: unknown } | undefined)?.content
      if (!Array.isArray(content)) return []
      return content.flatMap((block): AgentEvent[] => {
        const b = block as Record<string, unknown>
        if (b.type === "text" && typeof b.text === "string") return [{ type: "text", text: b.text }]
        if (b.type === "tool_use" && typeof b.name === "string") {
          const target = cuaTarget(b.name, b.input)
          return [{ type: "tool", name: b.name, ...(target ? { target } : {}) }]
        }
        return []
      })
    }
    if (type === "result") {
      const sessionId = str(msg.session_id)
      const cost = typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : undefined
      const ok = msg.is_error !== true && msg.subtype === "success"
      const text = str(msg.result) ?? (Array.isArray(msg.errors) ? msg.errors.join("; ") : str(msg.subtype) ?? "")
      return [
        ...(sessionId ? [{ type: "session", sessionId } as const] : []),
        { type: "result", ok, text, ...(cost !== undefined ? { costUsd: cost } : {}) },
      ]
    }
    return []
  },
}
