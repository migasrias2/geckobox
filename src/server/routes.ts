import { readFile } from "node:fs/promises"
import { z, ZodError } from "zod"
import { AGENT_NAMES, AGENTS } from "../agents/index.js"
import { addComputer, describe, loadRegistry, removeComputer, resolveComputer } from "../computers.js"
import { probeComputer } from "../probe.js"
import { inputSchema, sendInputOn } from "../screen.js"
import type { ScreenHub } from "../screenHub.js"
import { createSandbox, detectRuntime, listSandboxes, removeSandbox, setSandboxRunning } from "../sandbox.js"
import { eventsFile, listThreads } from "../store.js"
import { closeThread, createThread, interruptThread, queueTurn, threadStatus } from "../thread.js"
import type { AgentName, ThreadState } from "../types.js"
import { spawnWorker } from "../worker.js"
import { HttpError } from "./http.js"
import type { ViewManager } from "./views.js"

export const VERSION = "0.1.0"

export interface RouteContext {
  readonly params: readonly string[]
  readonly query: URLSearchParams
  readonly body: unknown
  readonly views: ViewManager
  readonly screens: ScreenHub
}

export interface Route {
  readonly method: "GET" | "POST" | "DELETE"
  readonly pattern: RegExp
  readonly needsBody: boolean
  readonly run: (ctx: RouteContext) => Promise<unknown>
}

const agentName = z.enum(AGENT_NAMES as [AgentName, ...AgentName[]])
const text = z.string().min(1)

const computerBody = z.object({ name: text, address: text })
const startBody = z.object({
  agent: agentName,
  on: text,
  prompt: text,
  cwd: z.string().optional(),
  model: z.string().optional(),
  autoApprove: z.boolean().optional(),
  allowTools: z.array(z.string()).optional(),
  keep: z.boolean().optional(),
})
const sendBody = z.object({ prompt: text })
const fanoutBody = z.object({
  computers: z.array(text).min(1),
  agent: agentName,
  prompt: text,
  cwd: z.string().optional(),
  model: z.string().optional(),
  autoApprove: z.boolean().optional(),
  allowTools: z.array(z.string()).optional(),
})
const viewBody = z.object({ on: text })
const screenInputBody = z.object({ on: text })
const sandboxBody = z.object({ name: text, agents: z.array(agentName).optional(), image: z.string().optional() })

type StartInput = Omit<z.infer<typeof startBody>, "keep"> & { readonly keep?: boolean }

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : ""
  throw new HttpError(400, `${where}${issue?.message ?? "invalid body"}`)
}

/** Map thrown errors to HTTP statuses by what they say. */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  if (error instanceof ZodError) return new HttpError(400, error.issues[0]?.message ?? "invalid input")
  const message = error instanceof Error ? error.message : String(error)
  if (/^No (thread|computer|sandbox|screen)|^Invalid thread id/.test(message)) return new HttpError(404, message)
  if (/still working|is closed|already exists/.test(message)) return new HttpError(409, message)
  if (/^No container runtime|is not installed/.test(message)) return new HttpError(412, message)
  if (/^(Invalid|Unknown|"local")|is empty/.test(message)) return new HttpError(400, message)
  return new HttpError(500, message)
}

async function computerList() {
  const registry = await loadRegistry()
  return [
    { name: "local", address: "local", kind: "local" },
    ...Object.entries(registry).map(([name, c]) => ({ name, address: describe(c), kind: c.kind })),
  ]
}

async function freshThreads(): Promise<readonly ThreadState[]> {
  const threads = await listThreads()
  return Promise.all(threads.map((t) => threadStatus(t.id).catch(() => t)))
}

async function readEvents(id: string): Promise<readonly Record<string, unknown>[]> {
  const raw = await readFile(eventsFile(id), "utf8").catch(() => "")
  return raw.split("\n").flatMap((line) => {
    if (!line) return []
    try {
      const value: unknown = JSON.parse(line)
      return value && typeof value === "object" && !Array.isArray(value) ? [value as Record<string, unknown>] : []
    } catch {
      return []
    }
  })
}

async function threadDetail(id: string, query: URLSearchParams) {
  const thread = await threadStatus(id)
  const afterRaw = query.get("after")
  const after = afterRaw === null ? 0 : Number(afterRaw)
  if (!Number.isInteger(after) || after < 0) throw new HttpError(400, "after must be a non-negative integer")
  const all = await readEvents(id)
  return { thread, events: all.slice(after), total: all.length }
}

async function startOne(input: StartInput & { readonly on: string }): Promise<ThreadState> {
  const state = await createThread({
    agent: input.agent,
    on: input.on,
    prompt: input.prompt,
    deleteOnClose: !input.keep,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.autoApprove !== undefined ? { autoApprove: input.autoApprove } : {}),
    ...(input.allowTools?.length ? { allowTools: input.allowTools } : {}),
  })
  spawnWorker(state.id)
  return state
}

async function fanout(body: z.infer<typeof fanoutBody>) {
  const { computers, ...rest } = body
  const threads = await Promise.all(
    computers.map(async (on) => {
      try {
        return { on, id: (await startOne({ ...rest, on })).id }
      } catch (error) {
        return { on, error: toHttpError(error).message }
      }
    }),
  )
  return { threads }
}

async function screenFrame(screens: ScreenHub, query: URLSearchParams) {
  const on = query.get("on")
  if (!on) throw new HttpError(400, "on is required")
  const afterRaw = query.get("after")
  const after = afterRaw === null ? 0 : Number(afterRaw)
  if (!Number.isInteger(after) || after < 0) throw new HttpError(400, "after must be a non-negative integer")
  const { seq, at, frame, error } = await screens.next(on, after)
  if (frame) return { seq, at, width: frame.width, height: frame.height, cursor: frame.cursor, image: frame.jpegBase64 }
  if (error && /^No (screen|computer)/.test(error)) throw new Error(error)
  return { seq, ...(error ? { error } : {}) }
}

async function testComputer(rawName: string) {
  const { ok, host, agents, error } = await probeComputer(await resolveComputer(rawName))
  return { ok, ...(host ? { host } : {}), agents, ...(error ? { error } : {}) }
}

const ID = "([^/]+)"
const route = (method: Route["method"], path: string, needsBody: boolean, run: Route["run"]): Route => ({
  method,
  pattern: new RegExp(`^${path}$`),
  needsBody,
  run,
})
const get = (path: string, run: Route["run"]) => route("GET", path, false, run)
const post = (path: string, run: Route["run"]) => route("POST", path, true, run)

export const ROUTES: readonly Route[] = [
  get("/api/health", async () => ({ ok: true, version: VERSION })),
  get("/api/agents", async () => Object.values(AGENTS).map(({ name, binary, tested }) => ({ name, binary, tested }))),
  get("/api/computers", async () => computerList()),
  post("/api/computers", async ({ body }) => {
    const { name, address } = parse(computerBody, body)
    await addComputer(name, address)
    return computerList()
  }),
  route("DELETE", `/api/computers/${ID}`, false, async ({ params }) => {
    await removeComputer(params[0]!)
    return computerList()
  }),
  post(`/api/computers/${ID}/test`, async ({ params }) => testComputer(params[0]!)),
  get("/api/threads", async () => freshThreads()),
  get(`/api/threads/${ID}`, async ({ params, query }) => threadDetail(params[0]!, query)),
  post("/api/threads", async ({ body }) => startOne(parse(startBody, body))),
  post(`/api/threads/${ID}/send`, async ({ params, body }) => {
    const { prompt } = parse(sendBody, body)
    const state = await queueTurn(params[0]!, prompt)
    spawnWorker(state.id)
    return state
  }),
  post(`/api/threads/${ID}/interrupt`, async ({ params }) => {
    await interruptThread(params[0]!)
    return { ok: true }
  }),
  post(`/api/threads/${ID}/close`, async ({ params }) => closeThread(params[0]!)),
  post("/api/fanout", async ({ body }) => fanout(parse(fanoutBody, body))),
  post("/api/view", async ({ body, views }) => views.open(parse(viewBody, body).on)),
  get("/api/screen", async ({ screens, query }) => screenFrame(screens, query)),
  post("/api/screen/input", async ({ body }) => {
    const { on } = parse(screenInputBody, body)
    await sendInputOn(on, parse(inputSchema, body))
    return { ok: true }
  }),
  get("/api/sandboxes", async () => ({
    runtime: await detectRuntime().catch(() => null),
    sandboxes: await listSandboxes(),
  })),
  post("/api/sandboxes", async ({ body }) => {
    const { name, agents, image } = parse(sandboxBody, body)
    await createSandbox({ name, ...(agents ? { agents } : {}), ...(image ? { image } : {}) })
    return { sandboxes: await listSandboxes() }
  }),
  route("DELETE", `/api/sandboxes/${ID}`, false, async ({ params }) => {
    await removeSandbox(params[0]!)
    return { sandboxes: await listSandboxes() }
  }),
  post(`/api/sandboxes/${ID}/(start|stop)`, async ({ params }) => setSandboxRunning(params[0]!, params[1] === "start")),
]

export interface Match {
  readonly route: Route
  readonly params: readonly string[]
}

/** Find the route for a (still percent-encoded) path; params come back decoded. */
export function matchRoute(method: string, path: string): Match | undefined {
  for (const route of ROUTES) {
    const m = route.method === method ? route.pattern.exec(path) : null
    if (!m) continue
    try {
      return { route, params: m.slice(1).map(decodeURIComponent) }
    } catch {
      throw new HttpError(400, "bad path encoding")
    }
  }
  return undefined
}
