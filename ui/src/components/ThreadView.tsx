import { PanelRight } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../lib/api"
import { AGENT_LABEL, isBusy, title } from "../lib/format"
import { useThread } from "../lib/useThread"
import { Composer } from "./Composer"
import { DesktopPane } from "./DesktopPane"
import { DetailsPanel } from "./DetailsPanel"
import { AgentTurn, UserBubble } from "./Message"
import { AgentAvatar, Skeleton, StatusPill } from "./ui"

export function ThreadView({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { thread, events, error, refresh } = useThread(id)
  const [details, setDetails] = useState(true)
  const [desktop, setDesktop] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDesktop(false)
  }, [id])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [events.length, thread?.turns.length])

  const byTurn = useMemo(() => {
    return events.reduce<Record<number, typeof events>>((acc, e) => ({ ...acc, [e.turn]: [...(acc[e.turn] ?? []), e] }), {})
  }, [events])

  if (error && !thread) return <Empty text={error} />
  if (!thread) return <Loading />

  // On "local", an agent may drive a Cua computer through its MCP tools: show that one.
  const usedTargets = [...new Set(events.flatMap((e) => (e.type === "tool" && e.target ? [e.target] : [])))]
  const desktopOn = thread.computer.kind === "local" && usedTargets.length > 0 ? `cua:${usedTargets.at(-1)}` : thread.on
  const busy = isBusy(thread.status)
  const closed = thread.status === "closed"
  const liveTool = [...events].reverse().find((e) => e.type === "tool")
  const act = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined)
    await refresh()
    onChanged()
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <section className={desktop ? "flex h-full w-[440px] shrink-0 flex-col" : "flex h-full min-w-0 flex-1 flex-col"}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
          <AgentAvatar agent={thread.agent} size={28} busy={busy} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{title(thread)}</div>
            <div className="truncate text-[11.5px] text-mute">
              {AGENT_LABEL[thread.agent]} on {thread.on}
            </div>
          </div>
          <StatusPill status={thread.status} />
          {!details && (
            <button onClick={() => setDetails(true)} className="rounded-lg p-2 text-mute hover:bg-hover hover:text-ink" aria-label="Show details">
              <PanelRight className="size-4" />
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
            {thread.turns.map((turn) => (
              <div key={turn.index} className="space-y-4">
                <UserBubble text={turn.prompt} />
                <AgentTurn
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

        <div className="shrink-0 px-6 pb-5 pt-2">
          <div className="mx-auto max-w-3xl">
            <Composer
              placeholder={`Message ${AGENT_LABEL[thread.agent]} on ${thread.on}…`}
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

      {desktop && <DesktopPane on={desktopOn} onClose={() => setDesktop(false)} />}
      {details && !desktop && (
        <DetailsPanel
          thread={thread}
          onHide={() => setDetails(false)}
          onDesktop={() => setDesktop(true)}
          onInterrupt={() => void act(() => api.interrupt(id))}
          onCloseThread={() => void act(() => api.close(id))}
        />
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-20">
      <Skeleton className="ml-auto h-12 w-2/3" />
      <Skeleton className="h-24 w-4/5" />
      <Skeleton className="ml-auto h-10 w-1/2" />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="grid flex-1 place-items-center text-[14px] text-dim">{text}</div>
}
