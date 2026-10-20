import { Check, Monitor, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { api, type Computer, type ComputerTest } from "../lib/api"
import { GeckoIcon } from "./GeckoIcon"
import { ScreenPane } from "./ScreenPane"
import { Sandboxes } from "./Sandboxes"
import { Button, Card, cx } from "./ui"

const KINDS = [
  { kind: "ssh", label: "SSH", icon: "server" as const, hint: "user@host or a Tailscale name", prefix: "ssh:" },
  { kind: "docker", label: "Docker", icon: "terminal" as const, hint: "container name", prefix: "docker:" },
  { kind: "cua", label: "Cua sandbox", icon: "cloud" as const, hint: "sandbox name, e.g. local:desk", prefix: "cua:" },
] as const

const ICON = { local: "laptop", ssh: "server", container: "terminal", docker: "terminal", podman: "terminal", cua: "cloud" } as const

export function Computers({ computers, onChanged }: { computers: readonly Computer[] | undefined; onChanged: () => void }) {
  const [viewing, setViewing] = useState<string | undefined>()
  if (viewing) return <ScreenPane wide on={viewing} agentLabel="Nobody" busy={false} onClose={() => setViewing(undefined)} />
  return (
    <div className="panel h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-[26px] font-semibold tracking-tight">Computers</h1>
        <p className="mt-1.5 text-[14px] text-dim">
          Anything that can run a shell is a computer. openspaces connects to them directly — no relay, so no hour or session limits.
        </p>
        <Sandboxes onChanged={onChanged} />
        <h2 className="mt-10 text-[15px] font-semibold">Your computers</h2>
        <AddComputer onAdded={onChanged} />
        <div className="mt-6 space-y-3">
          {(computers ?? []).map((c) => (
            <ComputerCard key={c.name} computer={c} onView={() => setViewing(c.name)} onRemoved={onChanged} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ComputerCard({ computer, onView, onRemoved }: { computer: Computer; onView: () => void; onRemoved: () => void }) {
  const [test, setTest] = useState<ComputerTest | undefined>()
  const [testing, setTesting] = useState(false)
  const run = async () => {
    setTesting(true)
    try {
      setTest(await api.testComputer(computer.name))
    } catch (e) {
      setTest({ ok: false, agents: {}, error: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }
  return (
    <Card className="rise p-4">
      <div className="flex items-center gap-3.5">
        <span className="grid size-11 place-items-center rounded-2xl border border-line bg-raised">
          <GeckoIcon name={ICON[computer.kind]} size={40} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-medium">{computer.name === "local" ? "This machine" : computer.name}</div>
          <div className="truncate font-mono text-[12px] text-mute">{computer.address}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onView}>
          <Monitor className="size-3.5" /> Desktop
        </Button>
        <Button size="sm" onClick={() => void run()} disabled={testing}>
          {testing ? "Checking…" : "Check"}
        </Button>
        {computer.name !== "local" && (
          <button
            onClick={() => void api.removeComputer(computer.name).then(onRemoved)}
            className="rounded-lg p-2 text-mute transition hover:bg-danger/10 hover:text-danger"
            aria-label={`Remove ${computer.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {test && (
        <div className="mt-4 border-t border-line pt-3.5">
          {test.ok ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[12.5px] text-dim">{test.host}</span>
              {Object.entries(test.agents).map(([bin, has]) => (
                <span
                  key={bin}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11.5px]",
                    has ? "border-accent/25 bg-accent/10 text-accent" : "border-line text-mute",
                  )}
                >
                  {has ? <Check className="size-3" /> : <X className="size-3" />} {bin}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-danger">{test.error ?? "Not reachable"}</p>
          )}
        </div>
      )}
    </Card>
  )
}

function AddComputer({ onAdded }: { onAdded: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]>(KINDS[0])
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [error, setError] = useState<string | undefined>()
  const submit = async () => {
    setError(undefined)
    try {
      await api.addComputer(name.trim(), `${kind.prefix}${target.trim()}`)
      setName("")
      setTarget("")
      onAdded()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Card className="mt-3 p-4">
      <div className="flex gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            onClick={() => setKind(k)}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition",
              k.kind === kind.kind ? "bg-accent/12 text-accent ring-1 ring-accent/30" : "text-dim hover:bg-hover hover:text-ink",
            )}
          >
            <GeckoIcon name={k.icon} size={22} className="-ml-1" /> {k.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, e.g. mac-mini"
          className="h-10 w-44 rounded-2xl border border-line bg-raised px-3 text-[13.5px] outline-none placeholder:text-mute focus:border-accent/50"
        />
        <div className="flex h-10 min-w-[220px] flex-1 items-center rounded-2xl border border-line bg-raised pl-3 focus-within:border-accent/50">
          <span className="font-mono text-[12.5px] text-mute">{kind.prefix}</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder={kind.hint}
            className="h-full flex-1 bg-transparent px-1 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-mute"
          />
        </div>
        <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || !target.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </Card>
  )
}
