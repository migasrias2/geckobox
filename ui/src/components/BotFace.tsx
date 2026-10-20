import type { AgentName, ThreadStatus } from "../lib/api"
import { cx } from "./ui"

/** Each agent gets its own shape and tint; status lives in the face, like Grok Bot. */
const LOOK: Record<AgentName, { readonly shape: string; readonly from: string; readonly to: string }> = {
  "claude-code": { shape: "M6 2h20a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z", from: "#3ee39b", to: "#0f7a4c" },
  codex: { shape: "M16 2a14 14 0 1 1 0 28a14 14 0 0 1 0-28z", from: "#7fe7c4", to: "#1b6f5b" },
  gemini: { shape: "M16 2l12 7v14l-12 7l-12-7V9z", from: "#9be37a", to: "#3d7a1f" },
  opencode: { shape: "M9 2h14l7 7v14l-7 7H9l-7-7V9z", from: "#62d6a8", to: "#145c47" },
  shell: { shape: "M4 6a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v14a10 10 0 0 1-10 10h-4A10 10 0 0 1 4 20z", from: "#b6f2d4", to: "#2e6b52" },
}

export type Mood = "idle" | "busy" | "done" | "stuck" | "asleep"

export function moodOf(status: ThreadStatus, hasTurns = true): Mood {
  if (status === "running" || status === "starting") return "busy"
  if (status === "failed") return "stuck"
  if (status === "closed") return "asleep"
  return hasTurns ? "done" : "idle"
}

export function BotFace({ agent, mood = "idle", size = 36, ring = false }: { agent: AgentName; mood?: Mood; size?: number; ring?: boolean }) {
  const look = LOOK[agent]
  const id = `g-${agent}`
  return (
    <span
      className={cx("relative inline-grid shrink-0 place-items-center", mood === "busy" ? "face-busy" : "face-idle", ring && mood === "busy" && "rounded-full")}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} className={cx(mood === "asleep" && "opacity-50 saturate-50")}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={look.from} />
            <stop offset="1" stopColor={look.to} />
          </linearGradient>
        </defs>
        <path d={look.shape} fill={`url(#${id})`} />
        <path d={look.shape} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth=".8" />
        <g className="eyes">
          {mood === "done" ? (
            <g fill="none" stroke="#03150c" strokeWidth="2.2" strokeLinecap="round">
              <path d="M9.5 16.5q2.5-3 5 0" />
              <path d="M17.5 16.5q2.5-3 5 0" />
            </g>
          ) : mood === "asleep" ? (
            <g stroke="#03150c" strokeWidth="2" strokeLinecap="round">
              <path d="M10 16h4.5M17.5 16h4.5" />
            </g>
          ) : mood === "stuck" ? (
            <g fill="#03150c">
              <ellipse className="eye" cx="12" cy="16" rx="2" ry="2.6" />
              <ellipse className="eye" cx="20" cy="16" rx="2" ry="2.6" />
              <path d="M9.5 11.5l4 1.5M22.5 11.5l-4 1.5" stroke="#03150c" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          ) : (
            <g fill="#03150c">
              <ellipse className="eye" cx="12" cy="15.5" rx="2.1" ry="2.9" />
              <ellipse className="eye" cx="20" cy="15.5" rx="2.1" ry="2.9" />
              <circle cx="12.7" cy="14.4" r=".7" fill="#fff" opacity=".85" />
              <circle cx="20.7" cy="14.4" r=".7" fill="#fff" opacity=".85" />
            </g>
          )}
        </g>
      </svg>
      {mood === "busy" && <span className="pulse-ring absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel bg-accent" />}
      {mood === "stuck" && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel bg-danger" />}
    </span>
  )
}
