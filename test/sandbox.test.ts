import { describe, expect, it } from "vitest"
import { addComputer, describe as describeComputer, isIsolated, parseAddress, resolveComputer, setComputerEnv } from "../src/computers.js"
import { runArgs, sandboxOptionsSchema, setupScript, DEFAULT_IMAGE } from "../src/sandbox.js"
import { resolveSecret } from "../src/secrets.js"
import { createThread } from "../src/thread.js"
import { invocationFor } from "../src/transport.js"
import { viewPlan } from "../src/view.js"
import { useTempHome } from "./helpers.js"

describe("container computers", () => {
  it("parses runtime addresses with an optional user", () => {
    expect(parseAddress("container:agent@openspaces-dev")).toEqual({ kind: "container", user: "agent", container: "openspaces-dev" })
    expect(parseAddress("podman:box")).toEqual({ kind: "podman", container: "box" })
    expect(describeComputer(parseAddress("container:agent@x")!)).toBe("container:agent@x")
    expect(() => parseAddress("container:Bad User@x")).toThrow(/Invalid address/)
  })
  it("execs as the sandbox user over stdin", () => {
    const inv = invocationFor({ kind: "container", container: "c", user: "agent" }, "x", { T: "secret" })
    expect(inv).toEqual({ command: "container", args: ["exec", "-i", "-u", "agent", "c", "sh", "-l", "-s"], stdin: "export T=secret\nx" })
    expect(invocationFor({ kind: "podman", container: "c" }, "x").args).toEqual(["exec", "-i", "c", "sh", "-l", "-s"])
  })
  it("counts containers and cua as isolated, not local or ssh", () => {
    expect(isIsolated({ kind: "container", container: "c" })).toBe(true)
    expect(isIsolated({ kind: "cua", sandbox: "c" })).toBe(true)
    expect(isIsolated({ kind: "ssh", host: "h" })).toBe(false)
    expect(isIsolated({ kind: "local" })).toBe(false)
  })
  it("has no desktop to view", () => {
    expect(viewPlan({ kind: "container", container: "c" }, 1).kind).toBe("self")
  })
})

describe("sandbox plans", () => {
  it("uses each runtime's limit flags", () => {
    expect(runArgs("container", "openspaces-dev", "img", 2, 4)).toEqual(["run", "-d", "--name", "openspaces-dev", "-c", "2", "-m", "4G", "img", "sleep", "infinity"])
    expect(runArgs("docker", "x", "img", 1, 2)).toEqual(["run", "-d", "--name", "x", "--cpus", "1", "--memory", "2g", "img", "sleep", "infinity"])
  })
  it("installs only the chosen agents as an unprivileged user", () => {
    const script = setupScript(["claude-code", "codex"])
    expect(script).toContain("useradd -m -s /bin/bash agent")
    expect(script).toContain("npm install -g --silent @anthropic-ai/claude-code @openai/codex")
    expect(setupScript([])).not.toContain("npm install")
  })
  it("validates options", () => {
    expect(sandboxOptionsSchema.parse({ name: "dev" })).toMatchObject({ agents: ["claude-code"], image: DEFAULT_IMAGE, cpus: 4, memoryGb: 4 })
    expect(() => sandboxOptionsSchema.parse({ name: "Dev Box" })).toThrow()
    expect(() => sandboxOptionsSchema.parse({ name: "x", image: "--privileged" })).toThrow()
    expect(() => sandboxOptionsSchema.parse({ name: "x", agents: ["shell"] })).toThrow()
  })
})

describe("per-computer env and secrets", () => {
  useTempHome()

  it("forwards a computer's env names on every thread", async () => {
    await addComputer("box", "container:agent@openspaces-box")
    await setComputerEnv("box", ["CLAUDE_CODE_OAUTH_TOKEN"])
    expect((await resolveComputer("box")).forwardEnv).toEqual(["CLAUDE_CODE_OAUTH_TOKEN"])
    const state = await createThread({ agent: "shell", prompt: "x", on: "box", forwardEnv: ["EXTRA", "CLAUDE_CODE_OAUTH_TOKEN"] })
    expect(state.forwardEnv).toEqual(["CLAUDE_CODE_OAUTH_TOKEN", "EXTRA"])
    expect(state.autoApprove).toBe(true)
    await expect(setComputerEnv("ghost", [])).rejects.toThrow(/No computer/)
  })

  it("resolves secrets from env first and rejects bad names", () => {
    expect(resolveSecret("OS_TEST_X", { OS_TEST_X: "v" })).toBe("v")
    expect(resolveSecret("OS_TEST_SURELY_UNSET_123", {})).toBeUndefined()
    expect(() => resolveSecret("bad name")).toThrow(/Invalid/)
  })
})
