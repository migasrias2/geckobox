import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startServer, type RunningServer } from "../src/server/server.js"
import { useTempHome } from "./helpers.js"

useTempHome()

interface Reply {
  readonly status: number
  readonly body: string
  json(): any
}

function call(
  server: RunningServer,
  method: string,
  path: string,
  options: { body?: unknown; raw?: string; token?: string | null; host?: string; type?: string | null } = {},
): Promise<Reply> {
  const url = new URL(server.url)
  const payload = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  const headers: Record<string, string> = { host: options.host ?? url.host }
  if (options.token !== null) headers["x-openspaces-token"] = options.token ?? server.token
  if (payload !== undefined) {
    headers["content-length"] = String(Buffer.byteLength(payload))
    if (options.type !== null) headers["content-type"] = options.type ?? "application/json"
  }
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, method, path, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (c: Buffer) => chunks.push(c))
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8")
        resolve({ status: res.statusCode ?? 0, body, json: () => JSON.parse(body) })
      })
    })
    req.on("error", reject)
    req.end(payload)
  })
}

async function pollIdle(server: RunningServer, id: string, turns: number) {
  for (let i = 0; i < 120; i++) {
    const { thread } = (await call(server, "GET", `/api/threads/${id}`)).json()
    if (thread.status === "idle" && thread.turns.length === turns) return thread
    if (thread.status === "failed") throw new Error(`thread failed: ${thread.turns.at(-1)?.error}`)
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("thread never went idle")
}

describe("http server", () => {
  let server: RunningServer
  let dir = ""

  beforeAll(async () => {
    // Workers run `node dist/cli.js __worker`, so the CLI must be built.
    if (!existsSync("dist/cli.js")) execFileSync("npx", ["tsc", "-p", "tsconfig.build.json"], { stdio: "ignore" })
    dir = await mkdtemp(join(tmpdir(), "openspaces-ui-"))
    await mkdir(join(dir, "ui", "assets"), { recursive: true })
    await writeFile(join(dir, "ui", "index.html"), "<!doctype html><title>spa</title>")
    await writeFile(join(dir, "ui", "assets", "app.js"), "console.log(1)")
    await writeFile(join(dir, "secret.txt"), "TOP-SECRET")
    server = await startServer({ port: 0, staticDir: join(dir, "ui") })
  }, 120_000)

  afterAll(async () => {
    await server.close()
    await rm(dir, { recursive: true, force: true })
  })

  it("rejects missing or wrong tokens", async () => {
    expect((await call(server, "GET", "/api/health", { token: null })).status).toBe(401)
    expect((await call(server, "GET", "/api/health", { token: "nope" })).status).toBe(401)
    expect((await call(server, "GET", "/api/health", { token: null })).json().error).toBeTruthy()
  })

  it("rejects foreign Host headers", async () => {
    expect((await call(server, "GET", "/api/health", { host: "evil.example:80" })).status).toBe(403)
    expect((await call(server, "GET", "/", { host: "evil.example" })).status).toBe(403)
    const port = new URL(server.url).port
    expect((await call(server, "GET", "/api/health", { host: `localhost:${port}` })).status).toBe(200)
  })

  it("serves health and agents", async () => {
    expect((await call(server, "GET", "/api/health")).json()).toEqual({ ok: true, version: "0.1.0" })
    const agents = (await call(server, "GET", "/api/agents")).json()
    expect(agents).toContainEqual({ name: "shell", binary: "sh", tested: true })
  })

  it("adds, lists, tests and deletes computers", async () => {
    expect((await call(server, "GET", "/api/computers")).json()).toEqual([{ name: "local", address: "local", kind: "local" }])
    const added = await call(server, "POST", "/api/computers", { body: { name: "mini", address: "ssh:me@mini" } })
    expect(added.json()).toContainEqual({ name: "mini", address: "ssh:me@mini", kind: "ssh" })
    expect((await call(server, "POST", "/api/computers", { body: { name: "x" } })).status).toBe(400)
    const probe = (await call(server, "POST", "/api/computers/local/test")).json()
    expect(probe.ok).toBe(true)
    expect(probe.host).toBeTruthy()
    expect(probe.agents.sh).toBe(true)
    expect((await call(server, "POST", "/api/computers/ghost/test")).status).toBe(404)
    const inline = await call(server, "POST", `/api/computers/${encodeURIComponent("local")}/test`)
    expect(inline.status).toBe(200)
    const removed = await call(server, "DELETE", "/api/computers/mini")
    expect(removed.json()).toEqual([{ name: "local", address: "local", kind: "local" }])
    expect((await call(server, "DELETE", "/api/computers/mini")).status).toBe(404)
  })

  it("runs a shell thread through create, send, events and close", async () => {
    const created = await call(server, "POST", "/api/threads", { body: { agent: "shell", on: "local", prompt: "echo first" } })
    expect(created.status).toBe(200)
    const id = created.json().id as string
    await pollIdle(server, id, 1)

    const sent = await call(server, "POST", `/api/threads/${id}/send`, { body: { prompt: "echo second" } })
    expect(sent.status).toBe(200)
    expect((await call(server, "POST", `/api/threads/${id}/send`, { body: { prompt: "echo again" } })).status).toBe(409)
    await pollIdle(server, id, 2)

    const detail = (await call(server, "GET", `/api/threads/${id}`)).json()
    expect(detail.events.length).toBeGreaterThan(0)
    expect(detail.events[0]).toMatchObject({ turn: 0 })
    const tail = (await call(server, "GET", `/api/threads/${id}?after=${detail.total}`)).json()
    expect(tail.events).toEqual([])
    expect((await call(server, "GET", "/api/threads")).json().map((t: { id: string }) => t.id)).toContain(id)

    expect((await call(server, "POST", `/api/threads/${id}/close`)).json().status).toBe("closed")
    expect((await call(server, "POST", `/api/threads/${id}/send`, { body: { prompt: "x" } })).status).toBe(409)
    expect((await call(server, "GET", "/api/threads/nope-123")).status).toBe(404)
    expect((await call(server, "POST", "/api/threads", { body: { agent: "shell", on: "local" } })).status).toBe(400)
  })

  it("fans out and reports per-computer errors", async () => {
    const res = await call(server, "POST", "/api/fanout", { body: { computers: ["local", "ghost"], agent: "shell", prompt: "echo hi" } })
    expect(res.status).toBe(200)
    const [ok, bad] = res.json().threads
    expect(ok).toMatchObject({ on: "local" })
    expect(ok.id).toBeTruthy()
    expect(bad.on).toBe("ghost")
    expect(bad.error).toMatch(/No computer/)
    await pollIdle(server, ok.id, 1)
    await call(server, "POST", `/api/threads/${ok.id}/close`)
  })

  it("views local as self", async () => {
    const res = await call(server, "POST", "/api/view", { body: { on: "local" } })
    expect(res.json().kind).toBe("self")
  })

  it("serves static files with an SPA fallback", async () => {
    const js = await call(server, "GET", "/assets/app.js", { token: null })
    expect(js.status).toBe(200)
    expect(js.body).toBe("console.log(1)")
    const spa = await call(server, "GET", "/some/route", { token: null })
    expect(spa.status).toBe(200)
    expect(spa.body).toContain("<title>spa</title>")
  })

  it("blocks path traversal", async () => {
    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/%2E%2E%2Fsecret.txt", "/..%2fsecret.txt", "/assets/../../secret.txt", "/%5c..%5csecret.txt"]) {
      const res = await call(server, "GET", path, { token: null })
      expect(res.body, path).not.toContain("TOP-SECRET")
    }
  })

  it("enforces JSON bodies and the size limit", async () => {
    const big = JSON.stringify({ name: "a", address: "x".repeat(70 * 1024) })
    expect((await call(server, "POST", "/api/computers", { raw: big })).status).toBe(413)
    expect((await call(server, "POST", "/api/computers", { raw: "name=a", type: "text/plain" })).status).toBe(415)
    expect((await call(server, "POST", "/api/computers", { raw: "{nope" })).status).toBe(400)
  })

  it("says so when the UI is not built", async () => {
    const bare = await startServer({ port: 0, staticDir: join(dir, "missing") })
    try {
      expect((await call(bare, "GET", "/", { token: null })).body).toContain("UI not built")
    } finally {
      await bare.close()
    }
  })
})
