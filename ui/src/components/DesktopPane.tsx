import { ExternalLink, Monitor, X } from "lucide-react"
import { useEffect, useState } from "react"
import { api, type ViewResult } from "../lib/api"
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
        <span className="text-[14px] font-medium">{on}'s desktop</span>
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
          <Notice title="This is your machine" body={view.message} />
        )}
      </div>
    </section>
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
