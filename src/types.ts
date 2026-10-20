/** Where a thread runs. A name from the registry, or an inline address. */
export type ComputerRef = string

/** Container runtimes that openspaces drives the same way (`<runtime> exec -i`). */
export type ContainerRuntime = "container" | "docker" | "podman"

interface Shared {
  /** Env var names always forwarded to this computer (values come from env or the Keychain). */
  readonly forwardEnv?: readonly string[]
}

/** How to reach a computer: every kind just runs a shell script there. */
export type Computer =
  | (Shared & { readonly kind: "local" })
  | (Shared & { readonly kind: "ssh"; readonly host: string; readonly options?: readonly string[] })
  | (Shared & { readonly kind: ContainerRuntime; readonly container: string; readonly user?: string })
  | (Shared & { readonly kind: "cua"; readonly sandbox: string })

export type AgentName = "claude-code" | "codex" | "gemini" | "opencode" | "shell"

export type ThreadStatus = "starting" | "running" | "idle" | "failed" | "closed"

export interface TurnRecord {
  readonly index: number
  readonly prompt: string
  readonly startedAt: string
  readonly endedAt?: string
  readonly ok?: boolean
  readonly text?: string
  readonly error?: string
  readonly costUsd?: number
}

export interface ThreadState {
  readonly id: string
  readonly agent: AgentName
  readonly on: ComputerRef
  readonly computer: Computer
  /** Absolute dir on the target, or undefined for the default work dir. */
  readonly cwd?: string
  readonly deleteOnClose: boolean
  readonly autoApprove: boolean
  /** Tools pre-approved even without autoApprove, e.g. "mcp__cua" (Claude Code --allowedTools). */
  readonly allowTools?: readonly string[]
  readonly model?: string
  readonly forwardEnv: readonly string[]
  /** The agent's own session id, used to resume on the next turn. */
  readonly sessionId?: string
  readonly status: ThreadStatus
  readonly turns: readonly TurnRecord[]
  /** Local pid of the process driving the current turn, if any. */
  readonly workerPid?: number
  readonly createdAt: string
  readonly updatedAt: string
}

/** A normalised event from any agent's output stream. */
export type AgentEvent =
  | { readonly type: "session"; readonly sessionId: string }
  | { readonly type: "text"; readonly text: string }
  /**
   * `target`: the computer a tool acted on, when the tool names one (e.g. a Cua Space).
   * `point`: screen coordinates the tool acted on (non-negative integers), when it has x and y.
   */
  | { readonly type: "tool"; readonly name: string; readonly target?: string; readonly point?: { readonly x: number; readonly y: number } }
  | { readonly type: "result"; readonly ok: boolean; readonly text: string; readonly costUsd?: number }
  | { readonly type: "stderr"; readonly text: string }

export interface TurnResult {
  readonly ok: boolean
  readonly text: string
  readonly sessionId?: string
  readonly costUsd?: number
  readonly error?: string
}
