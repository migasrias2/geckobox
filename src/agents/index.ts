import type { AgentName } from "../types.js"
import { claudeCode } from "./claudeCode.js"
import { codex, gemini, opencode, shellAgent } from "./others.js"
import type { AgentAdapter } from "./types.js"

export type { AgentAdapter, TurnInput } from "./types.js"

export const AGENTS: Readonly<Record<AgentName, AgentAdapter>> = {
  "claude-code": claudeCode,
  codex,
  gemini,
  opencode,
  shell: shellAgent,
}

export const AGENT_NAMES = Object.keys(AGENTS) as readonly AgentName[]

export function isAgentName(name: string): name is AgentName {
  return name in AGENTS
}

export function getAgent(name: string): AgentAdapter {
  if (!isAgentName(name)) throw new Error(`Unknown agent "${name}". Use one of: ${AGENT_NAMES.join(", ")}`)
  return AGENTS[name]
}
