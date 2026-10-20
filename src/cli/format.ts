import { describe } from "../computers.js"
import type { AgentEvent, ThreadState } from "../types.js"

// `openspaces ls | head` closes the pipe early: exit quietly instead of crashing.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0)
  throw error
})

export function out(line = ""): void {
  process.stdout.write(`${line}\n`)
}

export function err(line: string): void {
  process.stderr.write(`${line}\n`)
}

export function eventLine(event: AgentEvent, prefix = ""): string | undefined {
  switch (event.type) {
    case "text":
      return `${prefix}${event.text}`
    case "tool":
      return `${prefix}· ${event.name}`
    case "stderr":
      return `${prefix}! ${event.text}`
    default:
      return undefined
  }
}

export function threadRow(state: ThreadState): string {
  const last = state.turns.at(-1)
  const preview = (last?.text ?? last?.error ?? last?.prompt ?? "").replace(/\s+/g, " ").slice(0, 60)
  return `${state.id.padEnd(22)} ${state.status.padEnd(8)} ${state.agent.padEnd(12)} ${state.on.padEnd(14)} ${preview}`
}

export function threadDetail(state: ThreadState): string {
  const cost = state.turns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0)
  const lines = [
    `thread    ${state.id}`,
    `agent     ${state.agent}${state.model ? ` (${state.model})` : ""}`,
    `computer  ${state.on} → ${describe(state.computer)}`,
    `status    ${state.status}`,
    `session   ${state.sessionId ?? "-"}`,
    `approve   ${state.autoApprove ? "auto (permission prompts skipped)" : "edits only"}`,
    ...(cost > 0 ? [`cost      $${cost.toFixed(4)}`] : []),
    "",
    ...state.turns.flatMap((t) => [
      `[${t.index}] > ${t.prompt}`,
      t.endedAt ? `    ${t.ok ? "✓" : "✗"} ${(t.ok ? t.text : t.error) ?? ""}` : "    … working",
    ]),
  ]
  return lines.join("\n")
}
