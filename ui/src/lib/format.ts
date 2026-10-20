import type { AgentName, ThreadStatus, Thread } from "./api"

export const AGENT_LABEL: Record<AgentName, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  shell: "Shell",
}

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  starting: "Starting",
  running: "Working",
  idle: "Ready",
  failed: "Needs a look",
  closed: "Closed",
}

export function isBusy(status: ThreadStatus): boolean {
  return status === "starting" || status === "running"
}

export function title(thread: Thread): string {
  const first = thread.turns[0]?.prompt ?? thread.id
  const line = first.split("\n")[0] ?? first
  return line.length > 64 ? `${line.slice(0, 62)}…` : line
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function duration(from: string, to?: string): string {
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function cost(thread: Thread): number {
  return thread.turns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0)
}
