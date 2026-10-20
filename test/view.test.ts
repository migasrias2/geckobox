import { describe, expect, it } from "vitest"
import { freePort, runView, viewPlan } from "../src/view.js"

describe("viewPlan", () => {
  it("tunnels ssh computers to their VNC port", () => {
    expect(viewPlan({ kind: "ssh", host: "me@mini", options: ["-p", "2222"] }, 41000)).toEqual({
      kind: "tunnel",
      tunnel: ["ssh", "-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-p", "2222", "-L", "127.0.0.1:41000:127.0.0.1:5900", "--", "me@mini"],
      localPort: 41000,
      url: "vnc://127.0.0.1:41000",
    })
    expect(viewPlan({ kind: "ssh", host: "h" }, 41000, { port: 5901 })).toMatchObject({ tunnel: expect.arrayContaining(["127.0.0.1:41000:127.0.0.1:5901"]) })
  })
  it("uses Cua's local viewer for cua sandboxes", () => {
    expect(viewPlan({ kind: "cua", sandbox: "desk" }, 1)).toEqual({ kind: "command", argv: ["cua", "sandbox", "view", "desk"] })
    expect(viewPlan({ kind: "cua", sandbox: "desk" }, 1, { viewOnly: true })).toEqual({ kind: "command", argv: ["cua", "sandbox", "view", "--view-only", "desk"] })
  })
  it("handles local and docker", () => {
    expect(viewPlan({ kind: "local" }, 1).kind).toBe("self")
    expect(viewPlan({ kind: "docker", container: "x" }, 1, { port: 5902 })).toEqual({ kind: "open", url: "vnc://127.0.0.1:5902" })
  })
  it("rejects bad ports", () => {
    expect(() => viewPlan({ kind: "ssh", host: "h" }, 1, { port: 70000 })).toThrow(/Invalid port/)
    expect(() => viewPlan({ kind: "ssh", host: "h" }, 0)).toThrow(/Invalid port/)
  })
})

describe("runView", () => {
  it("finds a free port", async () => {
    expect(await freePort()).toBeGreaterThan(0)
  })
  it("prints the local message", async () => {
    const lines: string[] = []
    expect(await runView({ kind: "self", message: "hi" }, (l) => lines.push(l))).toBe(0)
    expect(lines).toEqual(["hi"])
  })
  it("runs a viewer command and returns its exit code", async () => {
    expect(await runView({ kind: "command", argv: ["sh", "-c", "exit 3"] }, () => undefined)).toBe(3)
  })
  it("fails clearly when the tunnel dies", async () => {
    await expect(runView({ kind: "tunnel", tunnel: ["sh", "-c", "exit 255"], localPort: await freePort(), url: "vnc://x" }, () => undefined)).rejects.toThrow(/exited with code 255/)
  })
})
