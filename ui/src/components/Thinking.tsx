import { Check, ChevronDown, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"
import { duration } from "../lib/format"
import { cx } from "./ui"

export interface ToolCall {
  readonly at: string
  readonly name: string
  readonly target?: string
  readonly point?: { readonly x: number; readonly y: number }
}

interface Row {
  readonly key: string
  readonly name: string
  readonly secondary?: string
  readonly count: number
}

/** `mcp__cua__space_bash` → `cua · space_bash`. */
export function prettyToolName(name: string): string {
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name)
  return m ? `${m[1]} · ${m[2]}` : name
}

const secondaryOf = (c: ToolCall): string | undefined => c.target || (c.point ? `${Math.round(c.point.x)},${Math.round(c.point.y)}` : undefined)

/** Collapse consecutive identical calls into one row with a count. Pure. */
export function toRows(calls: readonly ToolCall[]): Row[] {
  return calls.reduce<Row[]>((rows, c) => {
    const secondary = secondaryOf(c)
    const key = `${c.name}|${secondary ?? ""}`
    const last = rows.at(-1)
    if (last && last.key === key) return [...rows.slice(0, -1), { ...last, count: last.count + 1 }]
    return [...rows, { key, name: c.name, secondary, count: 1 }]
  }, [])
}

const EASE = "cubic-bezier(0.23,1,0.32,1)"

const CSS = `
@keyframes shimmer-text { from { background-position: 200% 0 } to { background-position: -200% 0 } }
@keyframes thinking-fade-up { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.thinking-shimmer {
  background-image: linear-gradient(90deg, var(--color-mute) 0%, var(--color-mute) 35%, var(--color-ink) 50%, var(--color-mute) 65%, var(--color-mute) 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text;
  color: transparent; -webkit-text-fill-color: transparent;
  animation: shimmer-text 2.2s linear infinite;
}
.thinking-row { animation: thinking-fade-up 380ms ${EASE} both; }
@media (prefers-reduced-motion: reduce) {
  .thinking-shimmer { animation: none; background-image: none; color: var(--color-dim); -webkit-text-fill-color: currentColor }
  .thinking-row { animation: none }
  .thinking-body, .thinking-chevron { transition: none !important }
}
`

function StatusGlyph({ spinning }: { spinning: boolean }) {
  if (spinning) return <span className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-accent/25 border-t-accent" />
  return <Check className="size-3.5 shrink-0 text-mute" strokeWidth={2.25} />
}

export function Thinking({ calls, running, startAt, endAt }: { calls: readonly ToolCall[]; running: boolean; startAt: string; endAt?: string }) {
  // null = follow the turn (open while running, closed when done); boolean = user's explicit choice.
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? running
  const rows = useMemo(() => toRows(calls), [calls])
  const total = calls.length

  const label = running
    ? total > 0 ? "Running tools" : "Working"
    : total > 0 ? `Ran ${total} tool${total === 1 ? "" : "s"} · ${duration(startAt, endAt)}` : `Thought for ${duration(startAt, endAt)}`

  return (
    <div className="pl-1">
      <style>{CSS}</style>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="group inline-flex items-center gap-1.5 rounded-xl py-1 pr-2 text-[13px] text-mute transition-colors hover:text-dim"
      >
        <Sparkles className={cx("size-3.5", running ? "text-accent" : "text-mute")} />
        <span className={cx(running && "thinking-shimmer")}>{label}</span>
        <ChevronDown
          className={cx("thinking-chevron size-3.5 transition-transform duration-300", open && "rotate-180")}
          style={{ transitionTimingFunction: EASE }}
        />
      </button>
      <div
        className="thinking-body grid"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: `grid-template-rows 400ms ${EASE}` }}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative ml-[7px] mt-1 pb-1 pl-4">
            <span className="absolute inset-y-0 left-0 w-px rounded-full bg-line" />
            <ul className="space-y-1.5">
              {rows.map((r, i) => {
                const newest = running && i === rows.length - 1
                return (
                  <li
                    key={`${i}-${r.key}`}
                    className="thinking-row flex min-w-0 items-center gap-2 text-[12.5px]"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  >
                    <StatusGlyph spinning={newest} />
                    <span className={cx("shrink-0 font-mono", newest ? "text-ink" : "text-dim")}>{prettyToolName(r.name)}</span>
                    {r.secondary && <span className="min-w-0 truncate text-mute">{r.secondary}</span>}
                    {r.count > 1 && <span className="shrink-0 text-mute">×{r.count}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
