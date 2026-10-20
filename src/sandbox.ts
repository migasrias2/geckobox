import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { z } from "zod"
import { addComputer, isContainer, loadRegistry, removeComputer, setComputerEnv } from "./computers.js"
import { capture } from "./transport.js"
import type { AgentName, Computer, ContainerRuntime } from "./types.js"

const run = promisify(execFile)

/** npm packages that install each agent's CLI. */
export const AGENT_PACKAGES: Readonly<Partial<Record<AgentName, string>>> = {
  "claude-code": "@anthropic-ai/claude-code",
  codex: "@openai/codex",
  gemini: "@google/gemini-cli",
  opencode: "opencode-ai",
}

/** The env var each agent needs to log in. */
export const AGENT_AUTH: Readonly<Partial<Record<AgentName, readonly string[]>>> = {
  "claude-code": ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
  codex: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY"],
}

export const DEFAULT_IMAGE = "docker.io/library/node:22-bookworm-slim"
export const SANDBOX_USER = "agent"
const PREFIX = "openspaces-"
const RUNTIMES: readonly ContainerRuntime[] = ["container", "docker", "podman"]

export const sandboxOptionsSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "use lowercase letters, digits and dashes"),
  agents: z.array(z.enum(Object.keys(AGENT_PACKAGES) as [AgentName, ...AgentName[]])).default(["claude-code"]),
  image: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/, "invalid image").default(DEFAULT_IMAGE),
  runtime: z.enum(["container", "docker", "podman"]).optional(),
  cpus: z.number().int().min(1).max(64).default(4),
  memoryGb: z.number().int().min(1).max(256).default(4),
  forwardEnv: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).optional(),
})

export type SandboxOptions = z.input<typeof sandboxOptionsSchema>

export interface SandboxInfo {
  readonly name: string
  readonly runtime: ContainerRuntime
  readonly container: string
  readonly state: string
}

async function has(binary: string): Promise<boolean> {
  try {
    await run(binary, ["--version"])
    return true
  } catch {
    return false
  }
}

/** Apple's `container` on macOS when present, else Docker, else Podman. */
export async function detectRuntime(preferred?: ContainerRuntime): Promise<ContainerRuntime> {
  const order = preferred ? [preferred] : RUNTIMES
  for (const runtime of order) if (await has(runtime)) return runtime
  throw new Error(
    preferred
      ? `${preferred} is not installed`
      : "No container runtime found. On a Mac: brew install container && container system start. On Linux: install Docker or Podman.",
  )
}

/** Pure: argv that starts the sandbox's long-lived container. */
export function runArgs(runtime: ContainerRuntime, container: string, image: string, cpus: number, memoryGb: number): string[] {
  const limits = runtime === "container" ? ["-c", String(cpus), "-m", `${memoryGb}G`] : ["--cpus", String(cpus), "--memory", `${memoryGb}g`]
  return ["run", "-d", "--name", container, ...limits, image, "sleep", "infinity"]
}

/** Pure: root setup script: tools, an unprivileged user, and the agent CLIs. */
export function setupScript(agents: readonly AgentName[]): string {
  const packages = agents.flatMap((a) => (AGENT_PACKAGES[a] ? [AGENT_PACKAGES[a]] : []))
  return [
    "set -e",
    "if command -v apt-get >/dev/null 2>&1; then",
    "  export DEBIAN_FRONTEND=noninteractive",
    "  apt-get update -qq && apt-get install -y -qq git curl ca-certificates python3 procps >/dev/null",
    "fi",
    `id ${SANDBOX_USER} >/dev/null 2>&1 || useradd -m -s /bin/bash ${SANDBOX_USER}`,
    ...(packages.length ? [`npm install -g --silent ${packages.join(" ")} >/dev/null 2>&1`] : []),
    `echo ready`,
  ].join("\n")
}

export async function createSandbox(options: SandboxOptions, log: (line: string) => void = () => undefined): Promise<Computer> {
  const o = sandboxOptionsSchema.parse(options)
  if ((await loadRegistry())[o.name]) throw new Error(`A computer named "${o.name}" already exists`)
  const runtime = await detectRuntime(o.runtime)
  const container = `${PREFIX}${o.name}`
  log(`starting ${container} on ${runtime} (${o.image}, ${o.cpus} CPUs, ${o.memoryGb} GB)`)
  try {
    await run(runtime, runArgs(runtime, container, o.image, o.cpus, o.memoryGb), { timeout: 10 * 60_000 })
  } catch (error) {
    throw new Error(`Could not start the container: ${(error as { stderr?: string }).stderr?.trim() || (error as Error).message}`)
  }
  log(`installing ${o.agents.join(", ") || "tools"} (a minute or two the first time)`)
  const root: Computer = { kind: runtime, container }
  const setup = await capture(root, setupScript(o.agents))
  if (setup.code !== 0) {
    await run(runtime, ["rm", "-f", container]).catch(() => undefined)
    throw new Error(`Sandbox setup failed: ${setup.stderr || setup.stdout || `exit ${setup.code}`}`)
  }
  const forwardEnv = o.forwardEnv ?? [...new Set(o.agents.flatMap((a) => AGENT_AUTH[a] ?? []))]
  await addComputer(o.name, `${runtime}:${SANDBOX_USER}@${container}`)
  const computer = await setComputerEnv(o.name, forwardEnv)
  log(`ready: openspaces start --on ${o.name} "…"`)
  return computer
}

async function containerState(runtime: ContainerRuntime, container: string): Promise<string> {
  try {
    if (runtime === "container") {
      const { stdout } = await run("container", ["list", "--all", "--format", "json"])
      const rows = JSON.parse(stdout) as Array<{ configuration?: { id?: string }; status?: { state?: string } | string }>
      const row = rows.find((r) => r.configuration?.id === container)
      const status = row?.status
      return row ? (typeof status === "string" ? status : status?.state ?? "unknown") : "missing"
    }
    const { stdout } = await run(runtime, ["inspect", "-f", "{{.State.Status}}", container])
    return stdout.trim() || "unknown"
  } catch {
    return "missing"
  }
}

/** Sandboxes are the registry's container computers that openspaces created. */
export async function listSandboxes(): Promise<readonly SandboxInfo[]> {
  const registry = await loadRegistry()
  const entries = Object.entries(registry).flatMap(([name, c]) =>
    isContainer(c) && c.container.startsWith(PREFIX) ? [{ name, runtime: c.kind, container: c.container }] : [],
  )
  return Promise.all(entries.map(async (e) => ({ ...e, state: await containerState(e.runtime, e.container) })))
}

async function sandboxOf(name: string): Promise<SandboxInfo> {
  const found = (await listSandboxes()).find((s) => s.name === name)
  if (!found) throw new Error(`No sandbox named "${name}"`)
  return found
}

export async function removeSandbox(name: string): Promise<void> {
  const s = await sandboxOf(name)
  await run(s.runtime, ["rm", "-f", s.container]).catch(() => undefined)
  await removeComputer(name)
}

export async function setSandboxRunning(name: string, running: boolean): Promise<SandboxInfo> {
  const s = await sandboxOf(name)
  await run(s.runtime, [running ? "start" : "stop", s.container])
  return { ...s, state: await containerState(s.runtime, s.container) }
}
