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
  asleep: "sleepy",
}

const STYLE = `
@keyframes gk-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.035) } }
@keyframes gk-scurry { 0% { transform: rotate(-7deg) translate(-2%, 1%) } 100% { transform: rotate(6deg) translate(2%, -1%) } }
@keyframes gk-hop { 0%,100% { transform: translateY(0) } 25% { transform: translateY(-14%) rotate(-6deg) } 45% { transform: translateY(0) } 60% { transform: translateY(-5%) } }
@keyframes gk-shake { 0%,80%,100% { transform: translateX(0) } 84% { transform: translateX(-5%) rotate(-4deg) } 88% { transform: translateX(5%) rotate(4deg) } 92% { transform: translateX(-3%) } 96% { transform: translateX(3%) } }
@keyframes gk-blink { 0%,93%,100% { transform: scaleY(1) } 96% { transform: scaleY(0.08) } }
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
  className,
}: {
  agent?: AgentName | "brand"
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

  // Working geckos alternate between sparkly eyes and a focused squint.
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

  const tint = TINT[agent]
  const face: GeckoMood = hover && hoverLove && mood !== "dead" ? "love" : mood === "busy" && focused ? "grumpy" : FACE[mood]
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
    </span>
  )
}
