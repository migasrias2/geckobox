#!/usr/bin/env node
import { parseArgs } from "node:util"
import { AGENT_NAMES, getAgent } from "./agents/index.js"
import {
  cmdClose,
  cmdComputers,
  cmdInterrupt,
  cmdLogs,
  cmdRun,
  cmdSend,
  cmdStart,
  cmdStatus,
  cmdWait,
  cmdWorker,
  type StartFlags,
} from "./cli/commands.js"
import { err, out } from "./cli/format.js"
import { cmdSandbox, cmdSecrets } from "./cli/sandbox.js"
import { cmdUi } from "./cli/ui.js"
import { resolveComputer } from "./computers.js"
import { freePort, runView, viewPlan } from "./view.js"

const HELP = `openspaces: put any coding agent on any of your computers.

  openspaces computers [ls]                   list computers ("local" is built in)
  openspaces computers add <name> <address>   address: local | ssh:user@host | container|docker|podman:[user@]name | cua:name
  openspaces computers rm <name>
  openspaces computers test [name]            check the computer and which agents it has

  openspaces start [opts] "<prompt>"          start a thread in the background, print its id
  openspaces send <id> "<prompt>" [--wait]    next message, same agent session
  openspaces wait <id>                        wait for the current turn, print the answer
  openspaces status [id]                      one thread in detail, or all threads
  openspaces logs <id> [-f]                   the agent's messages and tool calls
  openspaces interrupt <id>                   stop the current turn, keep the thread
  openspaces close <id>                       stop and clean up
  openspaces run --on a,b,c [opts] "<prompt>" the same job on several computers at once
  openspaces view <computer> [--port 5900]    watch and take over its desktop (SSH tunnel or Cua viewer,
                                              no relay, no session or hour limits; --view-only for cua)
  openspaces ui [--port 4600] [--no-open]     local web UI (127.0.0.1 only, link carries a secret token)

  openspaces sandbox create <name>            an isolated Linux sandbox on this machine with agents installed
                                              (Apple container, Docker or Podman); then --on <name>
  openspaces sandbox [ls] | rm | stop | start <name>
  openspaces secrets set <NAME>               store an agent's token in the macOS Keychain (read from stdin)

options for start and run:
  --on <computer>        where to run (default local; run takes a comma list)
  --agent <name>         ${AGENT_NAMES.join(" | ")} (default claude-code)
  --cwd <abs path>       work in this dir on the computer (default: a fresh dir per thread)
  --keep                 keep the thread's work dir on close (run: leave threads open)
  --auto-approve         skip the agent's permission prompts (default on sandboxes/containers/cua)
  --no-auto-approve
  --model <id>           pass a model to the agent
  --env <NAME>           forward this env var to the computer (repeatable)
  --wait                 start: block until the first turn finishes and print it
`

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    allowNegative: true,
    options: {
      on: { type: "string" },
      agent: { type: "string", default: "claude-code" },
      cwd: { type: "string" },
      keep: { type: "boolean", default: false },
      "auto-approve": { type: "boolean" },
      model: { type: "string" },
      env: { type: "string", multiple: true, default: [] },
      wait: { type: "boolean", default: false },
      follow: { type: "boolean", short: "f", default: false },
      help: { type: "boolean", short: "h", default: false },
      port: { type: "string" },
      agents: { type: "string" },
      image: { type: "string" },
      runtime: { type: "string" },
      cpus: { type: "string" },
      memory: { type: "string" },
      "view-only": { type: "boolean", default: false },
      open: { type: "boolean", default: true },
    },
  })
  const [command, ...rest] = positionals
  if (!command || values.help) {
    out(HELP)
    return command ? 0 : 1
  }
  const need = (value: string | undefined, usage: string): string => {
    if (!value) throw new Error(`usage: openspaces ${usage}`)
    return value
  }
  const startFlags = (prompt: string | undefined, on: string): StartFlags => ({
    on,
    agent: getAgent(values.agent).name,
    prompt: need(prompt, `${command} [opts] "<prompt>"`),
    keep: values.keep,
    env: values.env,
    wait: values.wait,
    ...(values.cwd ? { cwd: values.cwd } : {}),
    ...(values["auto-approve"] !== undefined ? { autoApprove: values["auto-approve"] } : {}),
    ...(values.model ? { model: values.model } : {}),
  })

  switch (command) {
    case "computers":
      return cmdComputers(rest[0], rest.slice(1))
    case "start":
      return cmdStart(startFlags(rest.join(" "), values.on ?? "local"))
    case "run": {
      const computers = need(values.on, `run --on a,b,c "<prompt>"`).split(",").map((c) => c.trim()).filter(Boolean)
      return cmdRun({ ...startFlags(rest.join(" "), computers[0] ?? "local"), computers })
    }
    case "send":
      return cmdSend(need(rest[0], `send <id> "<prompt>"`), need(rest.slice(1).join(" "), `send <id> "<prompt>"`), values.wait)
    case "wait":
      return cmdWait(need(rest[0], "wait <id>"))
    case "status":
    case "ls":
      return cmdStatus(rest[0])
    case "logs":
      return cmdLogs(need(rest[0], "logs <id>"), values.follow)
    case "interrupt":
      return cmdInterrupt(need(rest[0], "interrupt <id>"))
    case "close":
      return cmdClose(need(rest[0], "close <id>"))
    case "sandbox":
      return cmdSandbox(rest[0], rest.slice(1), {
        ...(values.agents !== undefined ? { agents: values.agents.split(",").map((a) => a.trim()).filter(Boolean) as never } : {}),
        ...(values.image ? { image: values.image } : {}),
        ...(values.runtime ? { runtime: values.runtime as never } : {}),
        ...(values.cpus ? { cpus: Number(values.cpus) } : {}),
        ...(values.memory ? { memoryGb: Number(values.memory) } : {}),
        ...(values.env.length ? { forwardEnv: values.env } : {}),
      })
    case "secrets":
      return cmdSecrets(rest[0], rest.slice(1))
    case "view": {
      const computer = await resolveComputer(need(rest[0], "view <computer> [--port 5900]"))
      const plan = viewPlan(computer, await freePort(), {
        viewOnly: values["view-only"],
        ...(values.port ? { port: Number(values.port) } : {}),
      })
      return runView(plan, out)
    }
    case "ui":
      return cmdUi(values.port ? Number(values.port) : 4600, values.open)
    case "__worker":
      return cmdWorker(need(rest[0], "__worker <id>"))
    default:
      throw new Error(`unknown command "${command}". Run openspaces --help`)
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    err(`openspaces: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  },
)
