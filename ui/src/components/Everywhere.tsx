import { Check, CircleAlert } from "lucide-react"
import { GeckoIcon } from "./GeckoIcon"
import { useState } from "react"
import { api, type AgentName, type Computer, type Thread } from "../lib/api"
import { usePoll } from "../lib/hooks"
import { AGENT_LABEL, duration, isBusy } from "../lib/format"
import { Composer } from "./Composer"
import { Card, cx, Select, Skeleton } from "./ui"

type Launched = { readonly on: string; readonly id?: string; readonly error?: string }

export function Everywhere({ computers, onOpen }: { computers: readonly Computer[] | undefined; onOpen: (id: string) => void }) {
  const [picked, setPicked] = useState<readonly string[]>(["local"])
  const [agent, setAgent] = useState<AgentName>("claude-code")
  const [launched, setLaunched] = useState<readonly Launched[]>([])
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))

  return (
    <div className="panel h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center gap-2 text-accent">
          <GeckoIcon name="globe" size={30} />
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Fan out</span>
        </div>
        <h1 className="mt-2 text-[26px] font-semibold tracking-tight">Run one job on every computer</h1>
        <p className="mt-1.5 text-[14px] text-dim">Each computer gets its own thread. Results land side by side as they finish.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(computers ?? []).map((c) => {
            const on = picked.includes(c.name)
            return (
              <button
                key={c.name}
                onClick={() => toggle(c.name)}
                className={cx(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] transition",
                  on ? "border-accent/40 bg-accent/12 text-accent" : "border-line bg-raised text-dim hover:text-ink",
                )}
              >
                <span className={cx("grid size-4 place-items-center rounded-full border", on ? "border-accent bg-accent text-accent-ink" : "border-line-strong")}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                {c.name === "local" ? "This machine" : c.name}
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          <Composer
            placeholder={`What should every computer do? (${picked.length} selected)`}
            disabled={picked.length === 0}
            disabledHint="Pick at least one computer"
            onSubmit={async (prompt) => {
              const res = await api.fanout({ computers: [...picked], agent, prompt })
              setLaunched(res.threads)
            }}
            footer={
              <Select value={agent} onChange={(e) => setAgent(e.target.value as AgentName)} aria-label="Agent">
                {(Object.keys(AGENT_LABEL) as AgentName[]).map((a) => (
                  <option key={a} value={a}>
                    {AGENT_LABEL[a]}
                  </option>
                ))}
              </Select>
            }
          />
        </div>

        {launched.length > 0 && (
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {launched.map((l) => (l.id ? <ResultCard key={l.id} id={l.id} on={l.on} onOpen={onOpen} /> : <FailedCard key={l.on} launched={l} />))}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultCard({ id, on, onOpen }: { id: string; on: string; onOpen: (id: string) => void }) {
  const { data } = usePoll(() => api.thread(id, 1e9).then((r) => r.thread), 1000, id)
  return (
    <button onClick={() => onOpen(id)} className="rise text-left">
      <Card className={cx("h-full p-4 transition hover:border-accent/30", data && isBusy(data.status) && "glow")}>
        <Header on={on} thread={data} />
        <div className="mt-3 max-h-48 overflow-hidden text-[13px] leading-relaxed text-dim">{data ? <Body thread={data} /> : <Skeleton className="h-16" />}</div>
      </Card>
    </button>
  )
}

function Header({ on, thread }: { on: string; thread: Thread | undefined }) {
  const turn = thread?.turns.at(-1)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[14px] font-medium">{on === "local" ? "This machine" : on}</span>
      <span className="ml-auto font-mono text-[11.5px] text-mute">{turn ? duration(turn.startedAt, turn.endedAt) : ""}</span>
      {thread && (isBusy(thread.status) ? (
        <span className="size-2 rounded-full bg-accent pulse-ring" />
      ) : turn?.ok ? (
        <Check className="size-4 text-accent" />
      ) : (
        <CircleAlert className="size-4 text-danger" />
      ))}
    </div>
  )
}

function Body({ thread }: { thread: Thread }) {
  const turn = thread.turns.at(-1)
  if (!turn?.endedAt) return <span className="text-accent">Working…</span>
  if (turn.ok) return <p className="whitespace-pre-wrap break-words text-ink">{turn.text || "Done."}</p>
  return <p className="whitespace-pre-wrap break-words text-danger">{turn.error}</p>
}

function FailedCard({ launched }: { launched: Launched }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-medium">{launched.on}</span>
        <CircleAlert className="ml-auto size-4 text-danger" />
      </div>
      <p className="mt-3 text-[13px] text-danger">{launched.error}</p>
    </Card>
  )
}
