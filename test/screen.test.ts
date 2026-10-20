import { request } from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { claudeCode, toolPoint } from "../src/agents/claudeCode.js"
import { captureScreen, inputScript, inputSchema, parseCapture, screenScript, type ScreenFrame } from "../src/screen.js"
import { ScreenHub } from "../src/screenHub.js"
import { startServer, type RunningServer } from "../src/server/server.js"
import { useTempHome } from "./helpers.js"

useTempHome()

const frame = (n: number): ScreenFrame => ({ width: 1280, height: 800, cursor: { x: n, y: 1 }, jpegBase64: "AAAA" })

describe("screenScript", () => {
  it("respects DISPLAY and reports missing pieces as noscreen", () => {
    const script = screenScript()
    expect(script).toContain('[ -z "$DISPLAY" ]')
    expect(script).toContain("noscreen")
    expect(script).toContain("exit 3")
    expect(script).toContain("getdisplaygeometry")
    expect(script).toContain("-quality 60")
  })
})

describe("parseCapture", () => {
  it("parses cursor, size and image", () => {
    expect(parseCapture("cursor 526 1\nsize 1280 800\n/9j/4AAQ==\n")).toEqual({
      width: 1280,
      height: 800,
      cursor: { x: 526, y: 1 },
      jpegBase64: "/9j/4AAQ==",
    })
  })
  it("turns noscreen into a No screen error", () => {
    expect(() => parseCapture("noscreen xdotool is not installed")).toThrow("No screen: xdotool is not installed")
  })
  it("rejects garbage", () => {
    expect(() => parseCapture("hello")).toThrow(/^No screen/)
    expect(() => parseCapture("")).toThrow(/^No screen/)
    expect(() => parseCapture("cursor 1 2\nsize 3 4\n")).toThrow(/^No screen: no image/)
    expect(() => parseCapture("cursor 1 2\nsize 3 4\nnot base64!")).toThrow(/^No screen/)
  })
  it("refuses the local computer", async () => {
    await expect(captureScreen({ kind: "local" })).rejects.toThrow("No screen: local is this machine")
  })
})

describe("inputScript", () => {
  const body = (script: string) => script.split("\n").at(-1)
  it("builds each action", () => {
    expect(body(inputScript({ action: "move", x: 640, y: 400 }))).toBe("xdotool mousemove 640 400")
    expect(body(inputScript({ action: "click", x: 1, y: 2 }))).toBe("xdotool mousemove 1 2 click 1")
    expect(body(inputScript({ action: "double_click", x: 1, y: 2 }))).toBe("xdotool mousemove 1 2 click --repeat 2 --delay 80 1")
    expect(body(inputScript({ action: "right_click", x: 1, y: 2 }))).toBe("xdotool mousemove 1 2 click 3")
    expect(body(inputScript({ action: "key", key: "ctrl+l" }))).toBe("xdotool key -- ctrl+l")
    expect(body(inputScript({ action: "type", text: "hello world" }))).toBe("xdotool type --delay 8 -- 'hello world'")
    expect(body(inputScript({ action: "scroll", x: 5, y: 6, direction: "up", amount: 3 }))).toBe("xdotool mousemove 5 6 click --repeat 3 --delay 25 4")
    expect(body(inputScript({ action: "scroll", x: 5, y: 6, direction: "down", amount: 2 }))).toBe("xdotool mousemove 5 6 click --repeat 2 --delay 25 5")
  })
  it("detects the display like the capture script", () => {
    expect(inputScript({ action: "move", x: 0, y: 0 })).toContain('[ -z "$DISPLAY" ]')
  })
  it("quotes hostile text", () => {
    const line = body(inputScript({ action: "type", text: "'; rm -rf / #" }))
    expect(line).toBe(`xdotool type --delay 8 -- ''\\''; rm -rf / #'`)
  })
  it("rejects bad input", () => {
    for (const bad of [
      { action: "key", key: "ctrl+l; reboot" },
      { action: "key", key: "" },
      { action: "key", key: "a".repeat(41) },
      { action: "click", x: -1, y: 0 },
      { action: "click", x: 20001, y: 0 },
      { action: "click", x: 1.5, y: 0 },
      { action: "type", text: "" },
      { action: "type", text: "a".repeat(2001) },
      { action: "scroll", x: 1, y: 1, direction: "left", amount: 1 },
      { action: "scroll", x: 1, y: 1, direction: "up", amount: 21 },
      { action: "explode" },
    ]) {
      expect(inputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
    expect(() => inputScript({ action: "key", key: "x y" })).toThrow()
  })
})

describe("ScreenHub", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("long-polls for a newer seq and stops after idle", async () => {
    const capture = vi.fn(async () => frame(capture.mock.calls.length))
    const hub = new ScreenHub({ capture })
    const first = await hub.next("pc", 0)
    expect(first.seq).toBe(1)
    const pending = hub.next("pc", 1)
    await vi.advanceTimersByTimeAsync(250)
    expect((await pending).seq).toBe(2)
    expect((await hub.next("pc", 0)).seq).toBeGreaterThanOrEqual(2)

    await vi.advanceTimersByTimeAsync(9000)
    const calls = capture.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(capture.mock.calls.length).toBe(calls)

    const again = hub.next("pc", 0)
    expect((await again).seq).toBeGreaterThan(2)
    hub.close()
  })

  it("returns the current state on timeout", async () => {
    const hub = new ScreenHub({ capture: async () => frame(1) })
    const first = await hub.next("pc", 0)
    const pending = hub.next("pc", first.seq, 100)
    await vi.advanceTimersByTimeAsync(100)
    expect((await pending).seq).toBe(first.seq)
    hub.close()
  })

  it("stores errors, retries with backoff and recovers", async () => {
    let fail = 2
    const times: number[] = []
    const capture = vi.fn(async () => {
      times.push(Date.now())
      if (fail-- > 0) throw new Error("No screen: boom")
      return frame(9)
    })
    const hub = new ScreenHub({ capture, workers: 1 })
    const failed = await hub.next("pc", 0)
    expect(failed).toMatchObject({ seq: 0, error: "No screen: boom" })
    const second = hub.next("pc", 0)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await second).error).toBe("No screen: boom")
    const recovered = hub.next("pc", 0)
    await vi.advanceTimersByTimeAsync(2000)
    const state = await recovered
    expect(state.seq).toBe(1)
    expect(state.error).toBeUndefined()
    expect(times[1]! - times[0]!).toBe(1000)
    expect(times[2]! - times[1]!).toBe(2000)
    hub.close()
  })

  it("runs overlapping workers and never goes back in time", async () => {
    // Worker 1 starts first but finishes last: its stale frame must be dropped.
    const delays = [500, 100, 100, 100, 100, 100]
    let n = 0
    const capture = vi.fn(async () => {
      const id = n++
      await new Promise((r) => setTimeout(r, delays[id] ?? 100))
      return frame(id)
    })
    const hub = new ScreenHub({ capture, workers: 2, minIntervalMs: 100 })
    const first = hub.next("pc", 0, 5000)
    await vi.advanceTimersByTimeAsync(200)
    const got = await first
    expect(got.frame?.cursor.x).toBe(1)
    await vi.advanceTimersByTimeAsync(400)
    const later = await hub.next("pc", got.seq, 5000)
    expect(later.frame?.cursor.x).not.toBe(0)
    expect(capture.mock.calls.length).toBeGreaterThanOrEqual(3)
    hub.close()
  })

  it("close() settles waiters and stops loops", async () => {
    const hub = new ScreenHub({ capture: () => new Promise<ScreenFrame>(() => undefined) })
    const pending = hub.next("pc", 0, 60_000)
    hub.close()
    expect((await pending).seq).toBe(0)
  })
})

describe("point in tool events", () => {
  it("reads x/y at the top level or in arguments, rounded", () => {
    expect(toolPoint({ x: 10.4, y: 20.6 })).toEqual({ x: 10, y: 21 })
    expect(toolPoint({ name: "click", arguments: { x: 5, y: 6 } })).toEqual({ x: 5, y: 6 })
    expect(toolPoint({ x: -1, y: 2 })).toBeUndefined()
    expect(toolPoint({ x: Number.NaN, y: 2 })).toBeUndefined()
    expect(toolPoint({ x: "1", y: 2 })).toBeUndefined()
    expect(toolPoint({ x: 1 })).toBeUndefined()
    expect(toolPoint(undefined)).toBeUndefined()
  })
  it("attaches point to tool events", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "mcp__cua__call_tool", input: { arguments: { x: 3, y: 4 } } }, { type: "tool_use", name: "Bash", input: { command: "ls" } }] },
    })
    expect(claudeCode.parse(line)).toEqual([
      { type: "tool", name: "mcp__cua__call_tool", point: { x: 3, y: 4 } },
      { type: "tool", name: "Bash" },
    ])
  })
})

describe("screen routes", () => {
  let server: RunningServer
  let hub: ScreenHub
  let n = 0

  beforeEach(async () => {
    n = 0
    hub = new ScreenHub({
      capture: async (on) => {
        if (on === "nope") throw new Error('No computer named "nope". Known: local')
        if (on === "local") throw new Error("No screen: local is this machine")
        if (on === "flaky") throw new Error("connection reset")
        return frame(++n)
      },
    })
    server = await startServer({ port: 0, staticDir: "/nonexistent", screens: hub })
  })
  afterEach(() => server.close())

  function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
    const url = new URL(server.url)
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const headers: Record<string, string> = { host: url.host, "x-openspaces-token": server.token }
    if (payload) Object.assign(headers, { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) })
    return new Promise((resolve, reject) => {
      const req = request({ host: url.hostname, port: url.port, method, path, headers }, (res) => {
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }))
      })
      req.on("error", reject)
      req.end(payload)
    })
  }

  it("serves frames with increasing seq", async () => {
    const a = await call("GET", "/api/screen?on=pc")
    expect(a.status).toBe(200)
    expect(a.json).toMatchObject({ seq: 1, width: 1280, height: 800, cursor: { x: 1, y: 1 }, image: "AAAA" })
    expect(typeof a.json.at).toBe("number")
    const b = await call("GET", "/api/screen?on=pc&after=1")
    expect(b.json.seq).toBeGreaterThan(1)
  })
  it("maps errors", async () => {
    expect((await call("GET", "/api/screen?on=local")).status).toBe(404)
    expect((await call("GET", "/api/screen?on=nope")).status).toBe(404)
    expect((await call("GET", "/api/screen")).status).toBe(400)
    expect((await call("GET", "/api/screen?on=pc&after=-2")).status).toBe(400)
    const flaky = await call("GET", "/api/screen?on=flaky")
    expect(flaky).toMatchObject({ status: 200, json: { seq: 0, error: "connection reset" } })
  })
  it("validates input", async () => {
    expect((await call("POST", "/api/screen/input", { on: "pc", action: "key", key: "a;b" })).status).toBe(400)
    expect((await call("POST", "/api/screen/input", { action: "move", x: 1, y: 1 })).status).toBe(400)
    expect((await call("POST", "/api/screen/input", { on: "local", action: "move", x: 1, y: 1 })).status).toBe(404)
  })
})
