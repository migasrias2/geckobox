import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react"
import { api, type ScreenFrame, type ScreenInput } from "../lib/api"
import { cx, Skeleton } from "./ui"

export interface AgentPoint {
  readonly key: string
  readonly x: number
  readonly y: number
}

/** Long-poll frames for a computer. Stops on unmount or when `on` changes. */
export function useScreen(on: string) {
  const [frame, setFrame] = useState<ScreenFrame | undefined>()
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    let alive = true
    let seq = 0
    setFrame(undefined)
    setError(undefined)
    const loop = async () => {
      while (alive) {
        try {
          const next = await api.screen(on, seq)
          if (!alive) return
          if (next.image) {
            seq = next.seq
            setFrame(next)
            setError(undefined)
          } else if (next.error) {
            setError(next.error)
            await sleep(1500)
          }
        } catch (e) {
          if (!alive) return
          setError((e as Error).message)
          await sleep(3000)
        }
      }
    }
    void loop()
    return () => {
      alive = false
    }
  }, [on])
  return { frame, error }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const SPECIAL: Record<string, string> = {
  Enter: "Return", Backspace: "BackSpace", Tab: "Tab", Escape: "Escape", Delete: "Delete",
  ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", Home: "Home", End: "End", PageUp: "Prior", PageDown: "Next",
}

/** Map a browser key event to an xdotool key, or undefined when it's plain text. */
function keyFor(e: KeyboardEvent): string | undefined {
  const mods = [e.ctrlKey || e.metaKey ? "ctrl" : "", e.altKey ? "alt" : ""].filter(Boolean)
  const base = SPECIAL[e.key] ?? (mods.length && /^[a-z0-9]$/i.test(e.key) ? e.key.toLowerCase() : undefined)
  return base ? [...mods, base].join("+") : undefined
}

export function LiveScreen({
  on,
  frame,
  points = [],
  interactive = false,
  className,
}: {
  on: string
  frame: ScreenFrame | undefined
  points?: readonly AgentPoint[]
  interactive?: boolean
  className?: string
}) {
  const img = useRef<HTMLImageElement>(null)
  const typed = useRef("")
  const flush = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [mine, setMine] = useState<readonly AgentPoint[]>([])
  const w = frame?.width ?? 1280
  const h = frame?.height ?? 800

  const send = (input: ScreenInput) => void api.input(on, input).catch(() => undefined)
  const at = (e: MouseEvent | WheelEvent) => {
    const r = img.current!.getBoundingClientRect()
    return { x: Math.round(((e.clientX - r.left) / r.width) * w), y: Math.round(((e.clientY - r.top) / r.height) * h) }
  }
  const ripple = (x: number, y: number) => setMine((p) => [...p.slice(-4), { key: `${Date.now()}`, x, y }])

  const onKey = (e: KeyboardEvent) => {
    const key = keyFor(e)
    e.preventDefault()
    if (key) {
      if (typed.current) send({ action: "type", text: typed.current })
      typed.current = ""
      send({ action: "key", key })
      return
    }
    if (e.key.length === 1) {
      typed.current += e.key
      clearTimeout(flush.current)
      flush.current = setTimeout(() => {
        if (typed.current) send({ action: "type", text: typed.current })
        typed.current = ""
      }, 140)
    }
  }

  if (!frame?.image) return <Skeleton className={cx("aspect-[16/10] w-full rounded-[22px]", className)} />

  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  return (
    <div
      className={cx("relative w-full select-none overflow-hidden rounded-[22px] bg-black outline-none", interactive && "cursor-none ring-2 ring-accent/70", className)}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={interactive ? onKey : undefined}
    >
      <img
        ref={img}
        src={`data:image/jpeg;base64,${frame.image}`}
        alt={`${on} screen`}
        draggable={false}
        className="block h-auto w-full"
        onClick={interactive ? (e) => { const p = at(e); ripple(p.x, p.y); send({ action: "click", ...p }) } : undefined}
        onDoubleClick={interactive ? (e) => send({ action: "double_click", ...at(e) }) : undefined}
        onContextMenu={interactive ? (e) => { e.preventDefault(); send({ action: "right_click", ...at(e) }) } : undefined}
        onWheel={interactive ? (e) => send({ action: "scroll", ...at(e), direction: e.deltaY > 0 ? "down" : "up", amount: Math.min(5, Math.max(1, Math.round(Math.abs(e.deltaY) / 60))) }) : undefined}
      />
      {[...points, ...mine].map((p) => (
        <span
          key={p.key}
          className="ripple pointer-events-none absolute size-10 rounded-full border-2 border-accent bg-accent/25"
          style={{ left: pct(p.x, w), top: pct(p.y, h) }}
        />
      ))}
      {frame.cursor && (
        <svg
          className="cursor-glide pointer-events-none absolute drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]"
          style={{ left: pct(frame.cursor.x, w), top: pct(frame.cursor.y, h) }}
          width="22"
          height="22"
          viewBox="0 0 24 24"
        >
          <path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#3ee39b" stroke="#03150c" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}
