import type { AgentEvent, AgentName } from "../types.js"

export interface TurnInput {
  readonly prompt: string
  /** The agent's session to resume; undefined on the first turn. */
  readonly sessionId?: string
  /** Skip the agent's permission prompts (only sensible on an isolated computer). */
  readonly autoApprove: boolean
  readonly allowTools?: readonly string[]
  readonly model?: string
}

export interface AgentAdapter {
  readonly name: AgentName
  /** Binary that must exist on the target. */
  readonly binary: string
  /** Live-tested end to end, or written from the CLI's docs only. */
  readonly tested: boolean
  argv(input: TurnInput): readonly string[]
  /** Map one stdout line to zero or more normalised events. Must not throw. */
  parse(line: string): readonly AgentEvent[]
}

export function parseJson(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith("{")) return undefined
  try {
    const value: unknown = JSON.parse(trimmed)
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
