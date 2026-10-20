import { Globe2, MonitorSmartphone, Plus, Server } from "lucide-react"
import type { Computer, Thread } from "../lib/api"
import { ago, AGENT_LABEL, isBusy, title } from "../lib/format"
import { moodOf } from "./BotFace"
import { AgentAvatar, cx, SectionLabel, Skeleton } from "./ui"

export type View =
  | { readonly kind: "new" }
  | { readonly kind: "thread"; readonly id: string }
  | { readonly kind: "computers" }
  | { readonly kind: "everywhere" }

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] border border-accent/30 bg-[radial-gradient(circle_at_30%_25%,#1f4d39,#0b1712_70%)]">
        <MonitorSmartphone className="size-4 text-accent" strokeWidth={2.2} />
      </span>
      <div className="leading-tight">
        <div className="text-[17px] font-extrabold tracking-tight">openspaces</div>
        <div className="text-[11px] text-mute">free · open source · no relay</div>
      </div>
    </div>
  )
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex h-10 w-full items-center gap-2.5 rounded-full px-4 text-[14px] font-semibold transition",
        active ? "bg-hover text-ink" : "text-dim hover:bg-hover/60 hover:text-ink",
      )}
    >
      <span className={cx(active ? "text-accent" : "text-mute")}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge ? <span className="rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold text-accent">{badge}</span> : null}
    </button>
  )
}

function ThreadItem({ thread, active, onClick }: { thread: Thread; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "group flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition",
        active ? "bg-hover" : "hover:bg-hover/60",
        thread.status === "closed" && !active && "opacity-55",
      )}
    >
      <AgentAvatar agent={thread.agent} size={34} mood={moodOf(thread.status, thread.turns.length > 0)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{title(thread)}</span>
        <span className="block truncate text-[11.5px] text-mute">
          {AGENT_LABEL[thread.agent]} · {thread.on} · {ago(thread.updatedAt)}
        </span>
      </span>
    </button>
  )
}

export function Sidebar({
  view,
  onView,
  threads,
  computers,
}: {
  view: View
  onView: (view: View) => void
  threads: readonly Thread[] | undefined
  computers: readonly Computer[] | undefined
}) {
  const busy = threads?.filter((t) => isBusy(t.status)).length ?? 0
  const open = threads?.filter((t) => t.status !== "closed") ?? []
  const closed = threads?.filter((t) => t.status === "closed") ?? []
  return (
    <aside className="panel flex h-full w-[276px] shrink-0 flex-col overflow-hidden">
      <div className="px-4 pb-3 pt-5">
        <Logo />
      </div>
      <div className="px-3">
        <button
          onClick={() => onView({ kind: "new" })}
          className={cx(
            "flex h-11 w-full items-center gap-2 rounded-full px-4 text-[14px] font-bold transition active:scale-[.98]",
            view.kind === "new" ? "bg-accent text-accent-ink" : "bg-raised text-ink hover:bg-hover",
          )}
        >
          <Plus className="size-4" /> New thread
          <span className="ml-auto grid size-5 place-items-center rounded-md bg-black/15 font-mono text-[10.5px] opacity-70">N</span>
        </button>
        <div className="mt-2 space-y-0.5">
          <NavItem active={view.kind === "everywhere"} onClick={() => onView({ kind: "everywhere" })} icon={<Globe2 className="size-4" />} label="Run everywhere" />
          <NavItem
            active={view.kind === "computers"}
            onClick={() => onView({ kind: "computers" })}
            icon={<Server className="size-4" />}
            label="Computers"
            badge={computers?.length}
          />
        </div>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <SectionLabel>Bots{busy ? ` · ${busy} working` : ""}</SectionLabel>
        {threads === undefined ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : open.length === 0 && closed.length === 0 ? (
          <p className="px-3 text-[13px] leading-relaxed text-mute">No threads yet. Start one and it shows up here.</p>
        ) : (
          <div className="space-y-0.5">
            {open.map((t) => (
              <ThreadItem key={t.id} thread={t} active={view.kind === "thread" && view.id === t.id} onClick={() => onView({ kind: "thread", id: t.id })} />
            ))}
          </div>
        )}
        {closed.length > 0 && (
          <>
            <SectionLabel>Closed</SectionLabel>
            <div className="space-y-0.5">
              {closed.slice(0, 20).map((t) => (
                <ThreadItem key={t.id} thread={t} active={view.kind === "thread" && view.id === t.id} onClick={() => onView({ kind: "thread", id: t.id })} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-[12px] text-mute">
        <span className="size-1.5 rounded-full bg-accent" />
        {computers ? `${computers.length} computer${computers.length === 1 ? "" : "s"}` : "…"} · unlimited sessions
      </div>
    </aside>
  )
}
