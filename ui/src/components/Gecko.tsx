import { useEffect, useId, useState } from "react"
import { GECKO } from "../assets/geckos"
import type { AgentName, ThreadStatus } from "../lib/api"
import { cx } from "./ui"

export type GeckoMood = keyof typeof GECKO.moods
export type Mood = "idle" | "starting" | "busy" | "done" | "stuck" | "dead" | "asleep"

/** Grok Bot-style vivid tints, one per agent; the brand gecko is green. */
const TINT: Record<AgentName | "brand", { readonly from: string; readonly to: string; readonly shade: string }> = {
  brand: { from: "#5ef2b0", to: "#12b06d", shade: "#0b7a4b" },
  "claude-code": { from: "#5ef2b0", to: "#12b06d", shade: "#0b7a4b" },
  codex: { from: "#c4b5fd", to: "#7c3aed", shade: "#5b21b6" },
  gemini: { from: "#93c5fd", to: "#2563eb", shade: "#1e40af" },
  opencode: { from: "#fde68a", to: "#f97316", shade: "#c2410c" },
  shell: { from: "#fbcfe8", to: "#ec4899", shade: "#be185d" },
}

/** A dozen vivid Grok-style colours; each bot gets one from its id, so it keeps it everywhere. */
export const PALETTE = [
  { from: "#5ef2b0", to: "#12b06d", shade: "#0b7a4b" }, // mint
  { from: "#c4b5fd", to: "#7c3aed", shade: "#5b21b6" }, // violet
  { from: "#93c5fd", to: "#2563eb", shade: "#1e40af" }, // blue
  { from: "#fde68a", to: "#f97316", shade: "#c2410c" }, // orange
  { from: "#fbcfe8", to: "#ec4899", shade: "#be185d" }, // pink
  { from: "#a5f3fc", to: "#06b6d4", shade: "#0e7490" }, // cyan
  { from: "#fecaca", to: "#ef4444", shade: "#b91c1c" }, // coral
  { from: "#d9f99d", to: "#65a30d", shade: "#3f6212" }, // lime
  { from: "#c7d2fe", to: "#4f46e5", shade: "#3730a3" }, // indigo
  { from: "#fef08a", to: "#eab308", shade: "#a16207" }, // yellow
  { from: "#f5d0fe", to: "#c026d3", shade: "#86198f" }, // magenta
  { from: "#99f6e4", to: "#14b8a6", shade: "#0f766e" }, // teal
] as const

export function colorFor(seed: string): (typeof PALETTE)[number] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return PALETTE[Math.abs(h) % PALETTE.length]!
}

export function moodOf(status: ThreadStatus, error?: string): Mood {
  if (status === "starting") return "starting"
  if (status === "running") return "busy"
  if (status === "failed") return error && /worker|crash|exited before/.test(error) ? "dead" : "stuck"
  if (status === "closed") return "asleep"
  return "done"
}

const FACE: Record<Mood, GeckoMood> = {
  idle: "look",
  starting: "alert",
  busy: "sparkle",
  done: "happy",
  stuck: "dizzy",
  dead: "dead",
  asleep: "happy", // closed, contented eyes: the drawn "sleepy" face reads as a scowl
}

const STYLE = `
@keyframes gk-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.035) } }
@keyframes gk-scurry { 0% { transform: rotate(-7deg) translate(-2%, 1%) } 100% { transform: rotate(6deg) translate(2%, -1%) } }
@keyframes gk-hop { 0%,100% { transform: translateY(0) } 25% { transform: translateY(-14%) rotate(-6deg) } 45% { transform: translateY(0) } 60% { transform: translateY(-5%) } }
@keyframes gk-shake { 0%,80%,100% { transform: translateX(0) } 84% { transform: translateX(-5%) rotate(-4deg) } 88% { transform: translateX(5%) rotate(4deg) } 92% { transform: translateX(-3%) } 96% { transform: translateX(3%) } }
@keyframes gk-blink { 0%,93%,100% { transform: scaleY(1) } 96% { transform: scaleY(0.08) } }
@keyframes gk-z { 0% { opacity: 0; transform: translate(0, 0) scale(.7) } 30% { opacity: .9 } 100% { opacity: 0; transform: translate(35%, -60%) scale(1.1) } }
.gk-z { position: absolute; right: -6%; top: -4%; font-weight: 800; color: var(--color-dim); animation: gk-z 2.8s ease-out infinite; pointer-events: none; }
@keyframes gk-pop { from { transform: scale(.6); opacity: 0 } to { transform: none; opacity: 1 } }
.gk { transform-origin: 50% 55%; }
.gk-idle, .gk-done, .gk-asleep { animation: gk-breathe 3.4s ease-in-out infinite; }
.gk-asleep { animation-duration: 5s; filter: saturate(.35) brightness(.75); }
.gk-busy, .gk-starting { animation: gk-scurry .42s ease-in-out infinite alternate; }
.gk-starting { animation-duration: .7s; }
.gk-hop { animation: gk-hop .9s cubic-bezier(.3,1.6,.5,1) 1, gk-breathe 3.4s ease-in-out .9s infinite; }
.gk-stuck, .gk-dead { animation: gk-shake 2.6s ease-in-out infinite; }
.gk-dead { filter: saturate(.5); }
.gk-eyes { transform-box: fill-box; transform-origin: center; }
.gk-blink .gk-eyes { animation: gk-blink 4.6s infinite; }
.gk-face { animation: gk-pop .22s cubic-bezier(.3,1.5,.5,1) both; transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: reduce) { .gk, .gk * { animation: none !important; } }
`

let styled = false
function useGeckoStyle(): void {
  useEffect(() => {
    if (styled) return
    styled = true
    const el = document.createElement("style")
    el.textContent = STYLE
    document.head.appendChild(el)
  }, [])
}

/** Miguel's gecko, tinted per agent, whose face and motion show what the bot is doing. */
export function Gecko({
  agent = "brand",
  mood = "idle",
  size = 36,
  hoverLove = true,
  seed,
  className,
}: {
  agent?: AgentName | "brand"
  /** Colour seed (a thread id); without one the agent's own colour is used. */
  seed?: string
  mood?: Mood
  size?: number
  hoverLove?: boolean
  className?: string
}) {
  useGeckoStyle()
  const id = useId().replace(/:/g, "")
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hop, setHop] = useState(false)

  // Working geckos alternate between sparkly eyes and wide-open ones.
  useEffect(() => {
    if (mood !== "busy") return
    const t = setInterval(() => setFocused((f) => !f), 2600)
    return () => clearInterval(t)
  }, [mood])
  // A little hop the moment a job finishes.
  useEffect(() => {
    if (mood !== "done") return
    setHop(true)
    const t = setTimeout(() => setHop(false), 950)
    return () => clearTimeout(t)
  }, [mood])

  const tint = seed ? colorFor(seed) : TINT[agent]
  const face: GeckoMood = hover && hoverLove && mood !== "dead" ? "love" : mood === "busy" && focused ? "look" : FACE[mood]
  const motion = hop ? "gk-hop" : `gk-${mood}`
  const { width: W, height: H } = GECKO
  return (
    <span
      className={cx("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width={size} height={size} className={cx("gk overflow-visible", motion, (mood === "idle" || mood === "done") && "gk-blink")}>
        <defs>
          <linearGradient id={`b${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={tint.from} />
            <stop offset="1" stopColor={tint.to} />
          </linearGradient>
        </defs>
        <g transform={`translate(0,${H}) scale(0.1,-0.1)`}>
          <path d={GECKO.body} fill={`url(#b${id})`} />
          <path d={GECKO.shade} fill={tint.shade} />
          <g className="gk-eyes">
            <path key={face} className="gk-face" d={GECKO.moods[face]} fill="#060b08" />
          </g>
        </g>
      </svg>
      {mood === "asleep" && size >= 24 && (
        <span className="gk-z" style={{ fontSize: Math.max(9, size * 0.3) }} aria-hidden>
          z
        </span>
      )}
    </span>
  )
}
