import { Hand, Maximize2, Monitor, Pause, X } from "lucide-react"
import { useEffect, useState } from "react"
import { api, type Computer } from "../lib/api"
import { LiveScreen, useScreen, type AgentPoint, type Screen } from "./LiveScreen"
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
            <LiveScreen on={target} frame={frame} error={error} points={points} />
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
                  <Maximize2 className="size-3.5" /> Take over
                </Button>
              </span>
            </div>
          </>
        )}
      </div>

      {takeover && <TakeOver on={target} screen={screen} points={points} busy={busy} agentLabel={agentLabel} onPause={onPause} onDone={() => setTakeover(false)} />}
    </section>
  )
}

function TakeOver({
  on,
  screen,
  points,
  busy,
  agentLabel,
  onPause,
  onDone,
}: {
  on: string
  screen: Screen
  points?: readonly AgentPoint[]
  busy: boolean
  agentLabel: string
  onPause?: () => void
  onDone: () => void
}) {
  const { frame, error } = screen
  // Fit the whole screen in the window: width limited by both viewport width and height.
  const ratio = (frame?.width ?? 1280) / (frame?.height ?? 800)
  const fit = `min(1500px, calc(100vw - 48px), calc((100vh - 120px) * ${ratio.toFixed(4)}))`
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && e.shiftKey) onDone()
    }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onDone])
  return (
    <div data-takeover="" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#030403]/95 p-6 backdrop-blur-xl">
      <div className="flex items-center gap-3" style={{ width: fit }}>
        <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-bold text-accent-ink">
          <Hand className="size-3.5" /> You have control of {label(on)}
        </span>
        <span className="hidden truncate text-[12.5px] text-dim lg:inline">Click, scroll and type straight into it · Shift+Esc to leave</span>
        <div className="ml-auto flex gap-2">
          {busy && onPause && (
            <Button size="sm" onClick={onPause}>
              <Pause className="size-3.5" /> Pause {agentLabel}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={onDone}>
            Give back control
          </Button>
        </div>
      </div>
      <div style={{ width: fit }}>
        <LiveScreen on={on} frame={frame} error={error} points={points} interactive className="shadow-[0_30px_120px_-30px_rgba(62,227,155,.35)]" />
      </div>
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
