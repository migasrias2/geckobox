import { Monitor, Pause, Square, X } from "lucide-react"
import type { Thread } from "../lib/api"
import { ago, AGENT_LABEL, cost, isBusy, title } from "../lib/format"
import { moodOf } from "./Gecko"
import { AgentAvatar, Card, IconButton, Row, SectionLabel, StatusPill } from "./ui"

const KIND_LABEL = { local: "This machine", ssh: "Over SSH", container: "Sandbox on this Mac", docker: "Docker container", podman: "Podman container", cua: "Cua sandbox" } as const

export function DetailsPanel({
  thread,
  onDesktop,
  onInterrupt,
  onCloseThread,
  onHide,
}: {
  thread: Thread
  onDesktop: () => void
  onInterrupt: () => void
  onCloseThread: () => void
  onHide: () => void
}) {
  const busy = isBusy(thread.status)
  const closed = thread.status === "closed"
  const total = cost(thread)
  return (
    <aside className="panel flex h-full w-[360px] shrink-0 flex-col overflow-y-auto">
      <div className="flex justify-end px-3 pt-3">
        <button onClick={onHide} className="rounded-lg p-1.5 text-mute hover:bg-hover hover:text-ink" aria-label="Hide details">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col items-center px-6 pb-5 text-center">
        <AgentAvatar agent={thread.agent} seed={thread.id} size={84} mood={moodOf(thread.status, thread.turns.at(-1)?.error)} />
        <div className="mt-4 line-clamp-2 text-[15px] font-semibold leading-snug">{title(thread)}</div>
        <div className="mt-1 font-mono text-[11.5px] text-mute">{thread.id}</div>
        <div className="mt-3">
          <StatusPill status={thread.status} />
        </div>
        <div className="mt-5 flex gap-3">
          <IconButton label="Watch the desktop" onClick={onDesktop}>
            <Monitor className="size-4" />
          </IconButton>
          <IconButton label="Interrupt the turn" onClick={onInterrupt} disabled={!busy}>
            <Pause className="size-4" />
          </IconButton>
          <IconButton label="Close the thread" onClick={onCloseThread} disabled={closed} className="hover:!border-danger/40 hover:!text-danger">
            <Square className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="space-y-1 px-4 pb-6">
        <SectionLabel>Computer</SectionLabel>
        <Card>
          <button onClick={onDesktop} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-hover/50">
            <span className="grid size-9 place-items-center rounded-2xl border border-line bg-raised">
              <Monitor className="size-4 text-accent" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{thread.on}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-dim">
                <span className="size-1.5 rounded-full bg-accent" /> {KIND_LABEL[thread.computer.kind]}
              </span>
            </span>
            <span className="text-[12px] text-accent">View</span>
          </button>
        </Card>

        <SectionLabel>Details</SectionLabel>
        <Card>
          <Row label="Agent">{AGENT_LABEL[thread.agent]}{thread.model ? ` · ${thread.model}` : ""}</Row>
          <Row label="Permissions">{thread.autoApprove ? "Auto-approve" : "Edits only"}</Row>
          <Row label="Turns">{thread.turns.length}</Row>
          {total > 0 && <Row label="Cost">${total.toFixed(4)}</Row>}
          <Row label="Started">{ago(thread.createdAt)}</Row>
          <Row label="Work dir" mono>{thread.cwd ?? `~/.openspaces/work/${thread.id}`}</Row>
          <Row label="Session" mono>{thread.sessionId ?? "—"}</Row>
        </Card>
        <p className="px-1 pt-3 text-[12px] leading-relaxed text-mute">
          {thread.deleteOnClose && !thread.cwd ? "Closing deletes the work dir on the computer." : "Closing keeps the work dir."} Runs directly on your
          computer — no relay, no session limits.
        </p>
      </div>
    </aside>
  )
}
