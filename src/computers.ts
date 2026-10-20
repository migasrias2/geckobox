import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { z } from "zod"
import { computersFile } from "./paths.js"
import type { Computer } from "./types.js"

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
// Hosts, containers and sandboxes: no spaces, no leading dash (no flag injection).
const TARGET = /^[A-Za-z0-9_][A-Za-z0-9_.@:-]*$/

const ENV = /^[A-Za-z_][A-Za-z0-9_]*$/
const USER = /^[a-z_][a-z0-9_-]{0,31}$/
const shared = { forwardEnv: z.array(z.string().regex(ENV, "invalid env var name")).optional() }
const containerShape = (kind: "container" | "docker" | "podman") =>
  z.object({
    kind: z.literal(kind),
    container: z.string().regex(TARGET, "invalid container"),
    user: z.string().regex(USER, "invalid user").optional(),
    ...shared,
  })

const computerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local"), ...shared }),
  z.object({
    kind: z.literal("ssh"),
    host: z.string().regex(TARGET, "invalid ssh host"),
    options: z.array(z.string()).optional(),
    ...shared,
  }),
  containerShape("container"),
  containerShape("docker"),
  containerShape("podman"),
  z.object({ kind: z.literal("cua"), sandbox: z.string().regex(TARGET, "invalid cua sandbox"), ...shared }),
])

export const CONTAINER_KINDS = ["container", "docker", "podman"] as const

export function isContainer(computer: Computer): computer is Extract<Computer, { kind: "container" | "docker" | "podman" }> {
  return (CONTAINER_KINDS as readonly string[]).includes(computer.kind)
}

/** Boxed-in computers, where skipping the agent's permission prompts is a sane default. */
export function isIsolated(computer: Computer): boolean {
  return computer.kind === "cua" || isContainer(computer)
}

const registrySchema = z.record(z.string().regex(NAME), computerSchema)

export type Registry = Readonly<Record<string, Computer>>

/**
 * Parse an inline address: `local`, `ssh:user@host`, `docker:[user@]name`, `podman:…`,
 * `container:…` (Apple's container runtime) or `cua:name`.
 * Returns undefined when the string is not an address (it may be a registry name).
 */
export function parseAddress(address: string): Computer | undefined {
  if (address === "local") return { kind: "local" }
  const match = /^(ssh|docker|podman|container|cua):(.+)$/.exec(address)
  if (!match) return undefined
  const [, kind, target] = match as unknown as [string, "ssh" | "docker" | "podman" | "container" | "cua", string]
  const at = target.indexOf("@")
  const raw =
    kind === "ssh"
      ? { kind, host: target }
      : kind === "cua"
        ? { kind, sandbox: target }
        : at > 0
          ? { kind, user: target.slice(0, at), container: target.slice(at + 1) }
          : { kind, container: target }
  const parsed = computerSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`Invalid address "${address}": ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

export function describe(computer: Computer): string {
  switch (computer.kind) {
    case "local":
      return "local"
    case "ssh":
      return `ssh:${computer.host}`
    case "container":
    case "docker":
    case "podman":
      return `${computer.kind}:${computer.user ? `${computer.user}@` : ""}${computer.container}`
    case "cua":
      return `cua:${computer.sandbox}`
  }
}

export async function loadRegistry(file = computersFile()): Promise<Registry> {
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw new Error(`Could not read ${file}: ${(error as Error).message}`)
  }
  const parsed = registrySchema.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error(`${file} is not a valid computer registry: ${parsed.error.message}`)
  return parsed.data
}

async function saveRegistry(registry: Registry, file: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(registry, null, 2)}\n`)
  await rename(tmp, file)
}

export async function addComputer(name: string, address: string, file = computersFile()): Promise<Registry> {
  if (!NAME.test(name)) throw new Error(`Invalid computer name "${name}" (letters, digits, . _ -)`)
  if (name === "local") throw new Error(`"local" is built in`)
  const computer = parseAddress(address)
  if (!computer) throw new Error(`Unknown address "${address}". Use local, ssh:user@host, docker:name or cua:name`)
  const next = { ...(await loadRegistry(file)), [name]: computer }
  await saveRegistry(next, file)
  return next
}

/** Set the env var names always forwarded to a registered computer. */
export async function setComputerEnv(name: string, forwardEnv: readonly string[], file = computersFile()): Promise<Computer> {
  const current = await loadRegistry(file)
  const found = current[name]
  if (!found) throw new Error(`No computer named "${name}"`)
  const updated = computerSchema.parse({ ...found, forwardEnv: [...forwardEnv] })
  await saveRegistry({ ...current, [name]: updated }, file)
  return updated
}

export async function removeComputer(name: string, file = computersFile()): Promise<Registry> {
  const current = await loadRegistry(file)
  if (!(name in current)) throw new Error(`No computer named "${name}"`)
  const next = Object.fromEntries(Object.entries(current).filter(([key]) => key !== name))
  await saveRegistry(next, file)
  return next
}

/** Turn `on` into a computer: an inline address first, then a registry name. */
export async function resolveComputer(on: string, file = computersFile()): Promise<Computer> {
  const inline = parseAddress(on)
  if (inline) return inline
  const registry = await loadRegistry(file)
  const found = registry[on]
  if (!found) {
    const known = ["local", ...Object.keys(registry)].join(", ")
    throw new Error(`No computer named "${on}". Known: ${known}. Add one with: openspaces computers add ${on} ssh:user@host`)
  }
  return found
}
