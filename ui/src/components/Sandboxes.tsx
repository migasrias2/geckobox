import { Box, Play, Plus, Square, Trash2 } from "lucide-react"
import { useState } from "react"
import { api, type AgentName, type Sandbox } from "../lib/api"
import { AGENT_LABEL } from "../lib/format"
import { usePoll } from "../lib/hooks"
import { Button, Card, cx, Skeleton } from "./ui"

const INSTALLABLE: readonly AgentName[] = ["claude-code", "codex", "gemini", "opencode"]
const RUNTIME_LABEL = { container: "Apple container", docker: "Docker", podman: "Podman" } as const

/** Isolated Linux sandboxes on this machine: create, start/stop, delete. */
export function Sandboxes({ onChanged }: { onChanged: () => void }) {
  const { data, refresh } = usePoll(api.sandboxes, 5000)
  const [name, setName] = useState("")
  const [agents, setAgents] = useState<readonly AgentName[]>(["claude-code"])
  const [busy, setBusy] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setError(undefined)
    try {
      await fn()
      await refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }
  const toggle = (a: AgentName) => setAgents((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))
  const creating = busy === "create"

  return (
    <Card className="mt-7 overflow-hidden">
      <div className="border-b border-line bg-[radial-gradient(ellipse_at_top_left,rgba(52,211,153,0.10),transparent_60%)] p-5">
        <div className="flex items-center gap-2">
          <Box className="size-4 text-accent" />
          <h2 className="text-[15px] font-semibold">Sandboxes on this Mac</h2>
          {data?.runtime && <span className="ml-auto rounded-full bg-raised px-2.5 py-0.5 text-[11.5px] text-dim">{RUNTIME_LABEL[data.runtime]}</span>}
        </div>
        <p className="mt-1 text-[13px] text-dim">
          A private Linux computer for an agent, running on your own hardware. Each one is its own lightweight VM, so the agent can do anything inside
          without touching your files. Free, no limits.
        </p>

        {data && !data.runtime ? (
          <p className="mt-4 rounded-2xl border border-warn/25 bg-warn/10 px-3 py-2 text-[13px] text-warn">
            No container runtime found. Run <code className="font-mono">brew install container && container system start</code>, then reload.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="Name, e.g. dev"
                disabled={creating}
                className="h-10 w-48 rounded-2xl border border-line bg-raised px-3 text-[13.5px] outline-none placeholder:text-mute focus:border-accent/50"
              />
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {INSTALLABLE.map((a) => (
                  <button
                    key={a}
                    onClick={() => toggle(a)}
                    disabled={creating}
                    className={cx(
                      "h-8 rounded-full border px-3 text-[12.5px] transition",
                      agents.includes(a) ? "border-accent/40 bg-accent/12 text-accent" : "border-line text-dim hover:text-ink",
                    )}
                  >
                    {AGENT_LABEL[a]}
                  </button>
                ))}
              </div>
              <Button variant="primary" disabled={!name || creating} onClick={() => void act("create", () => api.createSandbox(name, [...agents]).then(() => setName("")))}>
                <Plus className="size-4" /> {creating ? "Creating…" : "Create"}
              </Button>
            </div>
            {creating && (
              <div className="mt-3 flex items-center gap-2 text-[12.5px] text-accent">
                <span className="size-1.5 rounded-full bg-accent pulse-ring" /> Booting the VM and installing {agents.map((a) => AGENT_LABEL[a]).join(", ")}. Usually under a minute.
              </div>
            )}
          </>
        )}
        {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
      </div>

      <div className="divide-y divide-line">
        {!data ? (
          <div className="p-4">
            <Skeleton className="h-10" />
          </div>
        ) : data.sandboxes.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-mute">No sandboxes yet.</p>
        ) : (
          data.sandboxes.map((s) => <SandboxRow key={s.name} sandbox={s} busy={busy} act={act} />)
        )}
      </div>
    </Card>
  )
}

function SandboxRow({ sandbox, busy, act }: { sandbox: Sandbox; busy?: string; act: (label: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const running = sandbox.state === "running"
  const mine = busy === sandbox.name
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className={cx("size-2 rounded-full", running ? "bg-accent pulse-ring" : "bg-mute")} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{sandbox.name}</div>
        <div className="font-mono text-[11.5px] text-mute">
          {sandbox.container} · {sandbox.state}
        </div>
      </div>
      <Button size="sm" variant="ghost" disabled={mine} onClick={() => void act(sandbox.name, () => api.setSandbox(sandbox.name, !running))}>
        {running ? <Square className="size-3.5" /> : <Play className="size-3.5" />} {running ? "Stop" : "Start"}
      </Button>
      <button
        disabled={mine}
        onClick={() => void act(sandbox.name, () => api.removeSandbox(sandbox.name))}
        className="rounded-lg p-2 text-mute transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
        aria-label={`Delete ${sandbox.name}`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
