import { Info, Monitor } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../lib/api"
import { AGENT_LABEL, isBusy, title } from "../lib/format"
import { useThread } from "../lib/useThread"
import { moodOf } from "./Gecko"
import { Composer } from "./Composer"
import { DetailsPanel } from "./DetailsPanel"
import type { AgentPoint } from "./LiveScreen"
import { AgentTurn, UserBubble } from "./Message"
import { ScreenPane } from "./ScreenPane"
import { AgentAvatar, cx, Skeleton, StatusPill } from "./ui"

const RECENT_MS = 4000

export function ThreadView({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { thread, events, error, refresh } = useThread(id)
  const [side, setSide] = useState<"computer" | "details">("computer")
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [events.length, thread?.turns.length])

  const byTurn = useMemo(
    () => events.reduce<Record<number, typeof events>>((acc, e) => ({ ...acc, [e.turn]: [...(acc[e.turn] ?? []), e] }), {}),
    [events],
  )

  if (error && !thread) return <div className="panel grid flex-1 place-items-center text-[14px] text-dim">{error}</div>
  if (!thread) return <Loading />

  const busy = isBusy(thread.status)
  const closed = thread.status === "closed"
  const tools = events.filter((e) => e.type === "tool")
  const liveTool = tools.at(-1)
  // On "local", an agent may drive a Cua computer through its tools: watch that one.
  const targets = [...new Set(tools.flatMap((e) => (e.type === "tool" && e.target ? [e.target] : [])))]
  const screenOn = thread.computer.kind === "local" && targets.length > 0 ? `cua:${targets.at(-1)}` : thread.on
  const now = Date.now()
  const points: AgentPoint[] = tools.flatMap((e) =>
    e.type === "tool" && e.point && now - Date.parse(e.at) < RECENT_MS ? [{ key: `${e.at}-${e.point.x}-${e.point.y}`, ...e.point }] : [],
  )
  const act = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined)
    await refresh()
    onChanged()
  }

  return (
    <div className="flex h-full min-w-0 flex-1 gap-2.5">
      <section className="panel flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 px-5">
          <AgentAvatar agent={thread.agent} seed={thread.id} size={34} mood={moodOf(thread.status, thread.turns.at(-1)?.error)} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{title(thread)}</div>
            <div className="truncate text-[12px] text-mute">
              {AGENT_LABEL[thread.agent]} · {thread.on}
            </div>
          </div>
          <StatusPill status={thread.status} />
          <div className="flex rounded-full bg-raised p-1">
            {(["computer", "details"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSide(tab)}
                aria-label={tab === "computer" ? "Show computer" : "Show details"}
                className={cx("grid size-8 place-items-center rounded-full transition", side === tab ? "bg-hover text-accent" : "text-mute hover:text-ink")}
              >
                {tab === "computer" ? <Monitor className="size-4" /> : <Info className="size-4" />}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
            {thread.turns.map((turn) => (
              <div key={turn.index} className="space-y-4">
                <UserBubble text={turn.prompt} />
                <AgentTurn
                  seed={thread.id}
                  turn={turn}
                  events={byTurn[turn.index] ?? []}
                  agent={thread.agent}
                  liveTool={!turn.endedAt && liveTool?.type === "tool" && liveTool.turn === turn.index ? liveTool.name : undefined}
                />
              </div>
            ))}
            <div ref={bottom} />
          </div>
        </div>

        <div className="shrink-0 px-5 pb-5 pt-2">
          <div className="mx-auto max-w-2xl">
            <Composer
              placeholder={`Message ${AGENT_LABEL[thread.agent]}…`}
              disabled={busy || closed}
              disabledHint={closed ? "This thread is closed" : "Working… you can send the next message when it's done"}
              onSubmit={async (text) => {
                await api.send(id, text)
                await refresh()
                onChanged()
              }}
            />
          </div>
        </div>
      </section>

      {side === "computer" ? (
        <ScreenPane
          on={screenOn}
          agentLabel={AGENT_LABEL[thread.agent]}
          busy={busy}
          points={points}
          onPause={() => void act(() => api.interrupt(id))}
        />
      ) : (
        <DetailsPanel
          thread={thread}
          onHide={() => setSide("computer")}
          onDesktop={() => setSide("computer")}
          onInterrupt={() => void act(() => api.interrupt(id))}
          onCloseThread={() => void act(() => api.close(id))}
        />
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="panel flex-1 space-y-5 px-10 py-20">
      <Skeleton className="ml-auto h-12 w-2/3" />
      <Skeleton className="h-24 w-4/5" />
      <Skeleton className="ml-auto h-10 w-1/2" />
    </div>
  )
}
