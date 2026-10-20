import { Hand, Maximize2, Monitor, Pause, X } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { clock, useRecorder } from "../lib/useRecorder"
import { api, type Computer } from "../lib/api"
import { LiveScreen, useScreen, type AgentPoint, type Screen } from "./LiveScreen"

type Recorder = ReturnType<typeof useRecorder>
import { Button, cx } from "./ui"

function label(on: string): string {
  return on === "local" ? "This Mac" : on.replace(/^cua:(local:)?/, "")
}

/** The agent's computer, live, beside the conversation (Grok Bot's right pane). */
export function ScreenPane({
  on,
  agentLabel,
  busy,
  points,
  onPause,
  onClose,
  wide = false,
}: {
  on: string
  agentLabel: string
  busy: boolean
  points?: readonly AgentPoint[]
  onPause?: () => void
  onClose?: () => void
  wide?: boolean
}) {
  const [picked, setPicked] = useState<string | undefined>()
  const [takeover, setTakeover] = useState(false)
  useEffect(() => setPicked(undefined), [on])
  const target = picked ?? on
  const screen = useScreen(target)
  const rec = useRecorder(screen.frame, label(target))
  const { frame, error } = screen
  const takeOver = () => {
    // Like Grok Bot: taking control pauses a working agent so you don't fight over the mouse.
    if (busy && onPause) onPause()
    setTakeover(true)
  }
  const noScreen = !frame && error !== undefined

  return (
    <section className={cx("panel flex min-w-0 flex-col overflow-hidden", wide ? "flex-1" : "w-[52%] max-w-[1100px] shrink-0")}>
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-5">
        <Monitor className="size-4 text-accent" />
        <span className="text-[14.5px] font-bold">{label(target)}</span>
        {frame && !noScreen && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-0.5 text-[11.5px] font-bold text-accent">
            <span className="size-1.5 rounded-full bg-accent pulse-ring" /> Live
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {frame && (
            <Button size="sm" onClick={takeOver}>
              <Hand className="size-3.5" /> Take over
            </Button>
          )}
          {onClose && (
            <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-mute hover:bg-hover hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 pb-4">
        {noScreen ? (
          <NoScreen on={target} reason={error} onPick={setPicked} />
        ) : (
          <>
            {/* Resting card: the live screen; hover reveals an Open pill. */}
            <div className="group/screen relative cursor-pointer" onClick={() => setTakeover(true)}>
              <LiveScreen on={target} frame={frame} error={error} points={points} className="transition-shadow duration-150 group-hover/screen:shadow-[0_20px_60px_-25px_rgba(62,227,155,.45)]" />
              {frame && (
                <div className="absolute inset-0 grid place-items-center rounded-[22px] bg-black/0 transition-colors duration-150 group-hover/screen:bg-black/25">
                  <span className="translate-y-1 opacity-0 transition duration-150 group-hover/screen:translate-y-0 group-hover/screen:opacity-100">
                    <Button size="sm" variant="primary">
                      <Maximize2 className="size-3.5" /> Open
                    </Button>
                  </span>
                </div>
              )}
              {rec.recording && <RecBadge secs={rec.secs} className="absolute right-3 top-3" />}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-full bg-raised/70 py-1.5 pl-4 pr-1.5 text-[13px]">
              <span className="flex items-center gap-2 font-semibold text-dim">
                <span className={cx("size-2 rounded-full", busy ? "bg-accent pulse-ring" : "bg-mute")} />
                {busy ? `${agentLabel} has control` : `${agentLabel} is waiting`}
              </span>
              <span className="flex gap-1.5">
                {busy && onPause && (
                  <Button size="sm" variant="ghost" onClick={onPause}>
                    <Pause className="size-3.5" /> Pause
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={takeOver} disabled={!frame}>
                  <Hand className="size-3.5" /> Take over
                </Button>
              </span>
            </div>
          </>
        )}
      </div>

      {takeover &&
        createPortal(
          <Viewer on={target} screen={screen} points={points} busy={busy} agentLabel={agentLabel} rec={rec} onPause={onPause} onDone={() => setTakeover(false)} />,
          document.body,
        )}
    </section>
  )
}

function RecBadge({ secs, className }: { secs: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full bg-danger/15 py-0.5 pl-1.5 pr-2 text-[11.5px] font-bold tabular-nums text-danger backdrop-blur", className)}>
      <span className="size-2 animate-pulse rounded-full bg-danger" /> REC {clock(secs)}
    </span>
  )
}

const collapseIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
)

/** Expanded viewer, portaled over the page: you have control; recording survives collapsing. */
function Viewer({
  on,
  screen,
  points,
  busy,
  agentLabel,
  rec,
  onPause,
  onDone,
}: {
  on: string
  screen: Screen
  points?: readonly AgentPoint[]
  busy: boolean
  agentLabel: string
  rec: Recorder
  onPause?: () => void
  onDone: () => void
}) {
  const { frame, error } = screen
  const ratio = (frame?.width ?? 1280) / (frame?.height ?? 800)
  const fit = `min(1500px, calc(100vw - 64px), calc((100vh - 110px) * ${ratio.toFixed(4)}))`
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && e.shiftKey) onDone()
    }
    window.addEventListener("keydown", esc)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", esc)
      document.body.style.overflow = ""
    }
  }, [onDone])
  return (
    <div data-takeover="" role="dialog" aria-modal="true" aria-label={`${label(on)}'s screen`} className="fixed inset-0 z-[100] grid place-items-center p-4 sm:p-6">
      <div className="viewer-fade absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onDone} />
      <div className="viewer-pop relative flex max-h-full flex-col overflow-hidden rounded-[22px] bg-panel p-2 pt-0 shadow-[0_40px_140px_-40px_rgba(0,0,0,.95),inset_0_0_0_1px_var(--color-line)]" style={{ width: `calc(${fit} + 16px)` }}>
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13.5px] font-bold">{label(on)}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[11.5px] font-bold text-accent-ink">
              <Hand className="size-3" /> You have control
            </span>
            {rec.recording && <RecBadge secs={rec.secs} />}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {busy && onPause && (
              <Button size="sm" variant="ghost" onClick={onPause}>
                <Pause className="size-3.5" /> Pause {agentLabel}
              </Button>
            )}
            {rec.supported &&
              (rec.recording ? (
                <button onClick={rec.stop} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-danger pl-3 pr-3.5 text-[13px] font-bold text-white transition active:scale-[.96]">
                  <span className="size-2.5 rounded-[2px] bg-white" /> End
                </button>
              ) : (
                <Button size="sm" onClick={rec.start}>
                  <span className="grid size-3.5 place-items-center rounded-full border-2 border-current"><span className="size-1.5 rounded-full bg-danger" /></span> Record
                </Button>
              ))}
            <Button size="sm" variant="primary" onClick={onDone}>
              Give back control
            </Button>
            <button onClick={onDone} aria-label="Collapse" className="grid size-8 place-items-center rounded-full text-mute transition hover:bg-hover hover:text-ink">
              {collapseIcon}
            </button>
          </div>
        </div>
        <LiveScreen on={on} frame={frame} error={error} points={points} interactive className="rounded-[14px]" />
      </div>
      <style>{`
        @keyframes viewer-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes viewer-pop { from { opacity: 0; transform: scale(.96) translateY(8px) } to { opacity: 1; transform: none } }
        .viewer-fade { animation: viewer-fade 180ms ease-out both }
        .viewer-pop { animation: viewer-pop 240ms cubic-bezier(.23,1,.32,1) both }
        @media (prefers-reduced-motion: reduce) { .viewer-fade, .viewer-pop { animation: none } }
      `}</style>
    </div>
  )
}

function NoScreen({ on, reason, onPick }: { on: string; reason?: string; onPick: (on: string) => void }) {
  const [others, setOthers] = useState<readonly Computer[]>([])
  useEffect(() => {
    api.computers().then((all) => setOthers(all.filter((c) => c.name !== on && c.kind !== "local")), () => setOthers([]))
  }, [on])
  return (
    <div className="grid h-full place-items-center px-4 py-10">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[18px] bg-raised">
          <Monitor className="size-5 text-accent" />
        </span>
        <h3 className="mt-4 text-[16px] font-bold">{on === "local" ? "This is your own screen" : "No screen to show"}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-dim">
          {on === "local" ? "The agent works on this Mac, right in front of you." : (reason ?? "This computer has no desktop.")}
        </p>
        {others.length > 0 && (
          <>
            <div className="mt-5 text-[12px] font-bold text-mute">Watch another computer</div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {others.map((c) => (
                <Button key={c.name} size="sm" onClick={() => onPick(c.name)}>
                  <Monitor className="size-3.5" /> {c.name}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
