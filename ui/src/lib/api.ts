export type AgentName = "claude-code" | "codex" | "gemini" | "opencode" | "shell"
export type ThreadStatus = "starting" | "running" | "idle" | "failed" | "closed"

export type ComputerKind = "local" | "ssh" | "container" | "docker" | "podman" | "cua"
export interface Computer { readonly name: string; readonly address: string; readonly kind: ComputerKind }
export interface Sandbox { readonly name: string; readonly runtime: "container" | "docker" | "podman"; readonly container: string; readonly state: string }
export interface AgentInfo { readonly name: AgentName; readonly binary: string; readonly tested: boolean }
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
export interface Thread {
  readonly id: string
  readonly agent: AgentName
  readonly on: string
  readonly computer: { readonly kind: Computer["kind"] } & Record<string, unknown>
  readonly cwd?: string
  readonly deleteOnClose: boolean
  readonly autoApprove: boolean
  readonly model?: string
  readonly sessionId?: string
  readonly status: ThreadStatus
  readonly turns: readonly TurnRecord[]
  readonly createdAt: string
  readonly updatedAt: string
}
export type ThreadEvent =
  | { readonly at: string; readonly turn: number; readonly type: "text"; readonly text: string }
  | { readonly at: string; readonly turn: number; readonly type: "tool"; readonly name: string; readonly target?: string; readonly point?: { readonly x: number; readonly y: number } }
  | { readonly at: string; readonly turn: number; readonly type: "stderr"; readonly text: string }
  | { readonly at: string; readonly turn: number; readonly type: "session"; readonly sessionId: string }
  | { readonly at: string; readonly turn: number; readonly type: "result"; readonly ok: boolean; readonly text: string }
export interface ComputerTest { readonly ok: boolean; readonly host?: string; readonly agents: Record<string, boolean>; readonly error?: string }
export type ViewResult =
  | { readonly kind: "embed"; readonly url: string }
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "self"; readonly message: string }

export interface ScreenFrame {
  readonly seq: number
  readonly at?: number
  readonly width?: number
  readonly height?: number
  readonly cursor?: { readonly x: number; readonly y: number }
  readonly image?: string
  readonly error?: string
}
export type ScreenInput =
  | { readonly action: "click" | "double_click" | "right_click" | "move"; readonly x: number; readonly y: number }
  | { readonly action: "type"; readonly text: string }
  | { readonly action: "key"; readonly key: string }
  | { readonly action: "scroll"; readonly x: number; readonly y: number; readonly direction: "up" | "down"; readonly amount: number }

const TOKEN_KEY = "openspaces.token"

/** Take the token from `#token=…` once, keep it for this tab, and clean the URL. */
export function readToken(): string | undefined {
  const match = /token=([a-f0-9]+)/i.exec(window.location.hash)
  try {
    if (match?.[1]) {
      sessionStorage.setItem(TOKEN_KEY, match[1])
      history.replaceState(null, "", window.location.pathname)
      return match[1]
    }
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined
  } catch {
    return match?.[1]
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

let token: string | undefined

export function setToken(value: string | undefined): void {
  token = value
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "x-openspaces-token": token ?? "", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status)
  return data as T
}

const enc = encodeURIComponent

export const api = {
  health: () => call<{ ok: boolean; version: string }>("GET", "/health"),
  agents: () => call<AgentInfo[]>("GET", "/agents"),
  computers: () => call<Computer[]>("GET", "/computers"),
  addComputer: (name: string, address: string) => call<Computer[]>("POST", "/computers", { name, address }),
  removeComputer: (name: string) => call<Computer[]>("DELETE", `/computers/${enc(name)}`),
  testComputer: (name: string) => call<ComputerTest>("POST", `/computers/${enc(name)}/test`),
  threads: () => call<Thread[]>("GET", "/threads"),
  thread: (id: string, after = 0) => call<{ thread: Thread; events: ThreadEvent[]; total?: number }>("GET", `/threads/${enc(id)}?after=${after}`),
  start: (body: { agent: AgentName; on: string; prompt: string; cwd?: string; model?: string; autoApprove?: boolean; allowTools?: string[]; keep?: boolean }) =>
    call<Thread>("POST", "/threads", body),
  send: (id: string, prompt: string) => call<Thread>("POST", `/threads/${enc(id)}/send`, { prompt }),
  interrupt: (id: string) => call<{ ok: true }>("POST", `/threads/${enc(id)}/interrupt`),
  close: (id: string) => call<Thread>("POST", `/threads/${enc(id)}/close`),
  fanout: (body: { computers: string[]; agent: AgentName; prompt: string; autoApprove?: boolean }) =>
    call<{ threads: Array<{ on: string; id?: string; error?: string }> }>("POST", "/fanout", body),
  screen: (on: string, after: number) => call<ScreenFrame>("GET", `/screen?on=${enc(on)}&after=${after}`),
  input: (on: string, input: ScreenInput) => call<{ ok: true }>("POST", "/screen/input", { on, ...input }),
  transcribe: async (audio: Blob): Promise<{ text: string }> => {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "x-openspaces-token": token ?? "", "content-type": audio.type.split(";")[0] || "audio/webm" },
      body: audio,
    })
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
    if (!res.ok) throw new ApiError(data.error ?? `Transcription failed (${res.status})`, res.status)
    return { text: data.text ?? "" }
  },
  view: (on: string) => call<ViewResult>("POST", "/view", { on }),
  sandboxes: () => call<{ runtime: Sandbox["runtime"] | null; sandboxes: Sandbox[] }>("GET", "/sandboxes"),
  createSandbox: (name: string, agents: AgentName[]) => call<{ sandboxes: Sandbox[] }>("POST", "/sandboxes", { name, agents }),
  removeSandbox: (name: string) => call<{ sandboxes: Sandbox[] }>("DELETE", `/sandboxes/${enc(name)}`),
  setSandbox: (name: string, running: boolean) => call<Sandbox>("POST", `/sandboxes/${enc(name)}/${running ? "start" : "stop"}`),
}
