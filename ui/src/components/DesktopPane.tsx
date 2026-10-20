import { ExternalLink, Monitor, X } from "lucide-react"
import { useEffect, useState } from "react"
import { api, type Computer, type ViewResult } from "../lib/api"
import { Button, Skeleton } from "./ui"

/** A computer's live desktop: embedded (Cua viewer) or opened in the system VNC app. */
export function DesktopPane({ on, onClose }: { on: string; onClose: () => void }) {
  const [view, setView] = useState<ViewResult | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    setView(undefined)
    setError(undefined)
    api.view(on).then(setView, (e: Error) => setError(e.message))
  }, [on])

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-l border-line bg-bg">
      <header className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <Monitor className="size-4 text-accent" />
        <span className="text-[14px] font-medium">{label(on)}'s desktop</span>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">live · no relay</span>
        <div className="ml-auto flex items-center gap-1">
          {view?.kind === "embed" && (
            <a href={view.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-mute hover:bg-hover hover:text-ink" aria-label="Open in a tab">
              <ExternalLink className="size-4" />
            </a>
          )}
          <button onClick={onClose} className="rounded-lg p-2 text-mute hover:bg-hover hover:text-ink" aria-label="Close desktop">
            <X className="size-4" />
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center p-5">
        {error ? (
          <Notice title="Couldn't open the desktop" body={error} />
        ) : !view ? (
          <Skeleton className="aspect-video w-full max-w-4xl" />
        ) : view.kind === "embed" ? (
          // Cua's viewer forbids framing (frame-ancestors 'none'), so it gets its own tab.
          <Notice
            title="Live desktop is ready"
            body="Watch the agent work and take over with your mouse and keyboard. It's served from this machine — no relay, no time limit."
            action={
              <Button variant="primary" onClick={() => window.open(view.url, "_blank", "noopener")}>
                <ExternalLink className="size-4" /> Open desktop
              </Button>
            }
          />
        ) : view.kind === "external" ? (
          <Notice
            title="Opened in Screen Sharing"
            body={`The desktop opened in your VNC app through a private SSH tunnel (${view.url}). You can watch and take over from there.`}
            action={<Button onClick={() => window.open(view.url)}>Open again</Button>}
          />
        ) : (
          <Notice title={on === "local" ? "This is your machine" : "No desktop here"} body={view.message} action={<OtherDesktops current={on} />} />
        )}
      </div>
    </section>
  )
}

function label(on: string): string {
  return on.replace(/^cua:(local:)?/, "")
}

/** Desktops of other computers, for when this one has none to show. */
function OtherDesktops({ current }: { current: string }) {
  const [list, setList] = useState<readonly Computer[]>([])
  const [opening, setOpening] = useState<string | undefined>()
  useEffect(() => {
    api.computers().then((all) => setList(all.filter((c) => c.name !== current && (c.kind === "cua" || c.kind === "ssh"))), () => setList([]))
  }, [current])
  if (list.length === 0) return null
  const open = async (name: string) => {
    setOpening(name)
    try {
      const v = await api.view(name)
      if (v.kind !== "self") window.open(v.url, "_blank", "noopener")
    } finally {
      setOpening(undefined)
    }
  }
  return (
    <div>
      <div className="mb-2 text-[12px] text-mute">Open another computer's desktop</div>
      <div className="flex flex-wrap justify-center gap-2">
        {list.map((c) => (
          <Button key={c.name} size="sm" onClick={() => void open(c.name)} disabled={opening === c.name}>
            <Monitor className="size-3.5" /> {opening === c.name ? "Opening…" : c.name}
          </Button>
        ))}
      </div>
    </div>
  )
}

function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="max-w-md rounded-2xl border border-line bg-panel p-6 text-center">
      <Monitor className="mx-auto size-6 text-accent" />
      <h3 className="mt-3 text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
