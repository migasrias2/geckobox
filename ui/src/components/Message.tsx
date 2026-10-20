import { Check, ChevronRight, CircleAlert, Terminal, Wrench } from "lucide-react"
import { Fragment, useState, type ReactNode } from "react"
import type { AgentName, ThreadEvent, TurnRecord } from "../lib/api"
import { duration } from "../lib/format"
import { AgentAvatar, cx } from "./ui"

/** Minimal, safe rich text: fenced code, inline code and bold. No HTML injection. */
export function RichText({ text, mono = false }: { text: string; mono?: boolean }) {
  if (mono) return <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-ink">{text}</pre>
  const parts = text.split(/```[a-z0-9-]*\n?/i)
  return (
    <div className="space-y-1 text-[14px] leading-relaxed">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="overflow-x-auto rounded-2xl border border-line bg-bg p-3 font-mono text-[12.5px] text-ink">
            {part.replace(/\n$/, "")}
          </pre>
        ) : (
          <Prose key={i} text={part} />
        ),
      )}
    </div>
  )
}

/** Paragraphs, `>` quotes, `-`/`1.` lists and `#` headings. */
function Prose({ text }: { text: string }) {
  const lines = text.replace(/^\n+|\n+$/g, "").split("\n")
  return (
    <>
      {lines.map((line, i) => {
        const quote = /^>\s?(.*)$/.exec(line)
        if (quote) return <p key={i} className="border-l-2 border-accent/50 pl-3 italic text-ink/90">{inline(quote[1] ?? "")}</p>
        const bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line)
        if (bullet)
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span className="mt-[9px] size-1 shrink-0 rounded-full bg-accent" />
              <span className="min-w-0 break-words">{inline(bullet[1] ?? "")}</span>
            </p>
          )
        const heading = /^#{1,4}\s+(.*)$/.exec(line)
        if (heading) return <p key={i} className="pt-1 font-semibold text-ink">{inline(heading[1] ?? "")}</p>
        if (!line.trim()) return <div key={i} className="h-2" />
        return <p key={i} className="whitespace-pre-wrap break-words">{inline(line)}</p>
      })}
    </>
  )
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((chunk, i) => {
    if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 1)
      return (
        <code key={i} className="rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[12.5px] text-accent">
          {chunk.slice(1, -1)}
        </code>
      )
    if (chunk.startsWith("**") && chunk.endsWith("**")) return <strong key={i} className="font-semibold text-ink">{chunk.slice(2, -2)}</strong>
    return <Fragment key={i}>{chunk}</Fragment>
  })
}

type Block =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "tools"; readonly names: readonly string[] }
  | { readonly kind: "logs"; readonly lines: readonly string[] }

/** Harmless notices agents print on every run. */
const NOISE = /claude\.ai connectors are disabled/

/** Group a turn's events into readable blocks. Pure. */
export function toBlocks(events: readonly ThreadEvent[], agent: AgentName): Block[] {
  const joiner = agent === "shell" ? "\n" : "\n\n"
  return events.reduce<Block[]>((blocks, e) => {
    const last = blocks.at(-1)
    if (e.type === "text") {
      return last?.kind === "text" ? [...blocks.slice(0, -1), { kind: "text", text: `${last.text}${joiner}${e.text}` }] : [...blocks, { kind: "text", text: e.text }]
    }
    if (e.type === "tool") {
      return last?.kind === "tools" ? [...blocks.slice(0, -1), { kind: "tools", names: [...last.names, e.name] }] : [...blocks, { kind: "tools", names: [e.name] }]
    }
    if (e.type === "stderr" && NOISE.test(e.text)) return blocks
    if (e.type === "stderr") {
      return last?.kind === "logs" ? [...blocks.slice(0, -1), { kind: "logs", lines: [...last.lines, e.text] }] : [...blocks, { kind: "logs", lines: [e.text] }]
    }
    return blocks
  }, [])
}

/** `mcp__cua__space_bash` → `cua · space_bash`. */
export function prettyTool(name: string): string {
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name)
  return m ? `${m[1]} · ${m[2]}` : name
}

function ToolChips({ names }: { names: readonly string[] }) {
  const counts = names.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n]: (acc[n] ?? 0) + 1 }), {})
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-1">
      <Wrench className="size-3.5 text-mute" />
      {Object.entries(counts).map(([name, n]) => (
        <span key={name} className="rounded-full border border-line bg-raised px-2 py-0.5 font-mono text-[11.5px] text-dim">
          {prettyTool(name)}
          {n > 1 && <span className="text-mute"> ×{n}</span>}
        </span>
      ))}
    </div>
  )
}

function Logs({ lines }: { lines: readonly string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pl-1">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-[12px] text-mute hover:text-dim">
        <ChevronRight className={cx("size-3.5 transition", open && "rotate-90")} />
        <Terminal className="size-3.5" /> {lines.length} log line{lines.length === 1 ? "" : "s"}
      </button>
      {open && (
        <pre className="mt-1.5 max-h-56 overflow-auto rounded-2xl border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-dim">
          {lines.join("\n")}
        </pre>
      )}
    </div>
  )
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="rise flex justify-end">
      <div className="max-w-[78%] rounded-[22px] rounded-br-md border border-accent/25 bg-accent/12 px-4 py-2.5 text-[14px] leading-relaxed text-ink">
        <span className="whitespace-pre-wrap break-words">{text}</span>
      </div>
    </div>
  )
}

export function AgentTurn({ turn, events, agent, liveTool }: { turn: TurnRecord; events: readonly ThreadEvent[]; agent: AgentName; liveTool?: string }) {
  const blocks = toBlocks(events, agent)
  const running = !turn.endedAt
  const hasText = blocks.some((b) => b.kind === "text")
  return (
    <div className="rise flex gap-3">
      <AgentAvatar agent={agent} size={30} busy={running} />
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        {blocks.map((b, i) =>
          b.kind === "text" ? (
            <div key={i} className="max-w-[92%] rounded-[22px] rounded-tl-md border border-line bg-raised px-4 py-3">
              <RichText text={b.text} mono={agent === "shell"} />
            </div>
          ) : b.kind === "tools" ? (
            <ToolChips key={i} names={b.names} />
          ) : (
            <Logs key={i} lines={b.lines} />
          ),
        )}
        {!running && !hasText && turn.ok && turn.text ? (
          <div className="max-w-[92%] rounded-[22px] rounded-tl-md border border-line bg-raised px-4 py-3">
            <RichText text={turn.text} mono={agent === "shell"} />
          </div>
        ) : null}
        <TurnFooter turn={turn} liveTool={liveTool} />
      </div>
    </div>
  )
}

function TurnFooter({ turn, liveTool }: { turn: TurnRecord; liveTool?: string }) {
  if (!turn.endedAt) {
    return (
      <div className="flex items-center gap-2 pl-1 text-[12.5px] text-accent">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
        Working{liveTool ? ` · ${prettyTool(liveTool)}` : ""} · {duration(turn.startedAt)}
      </div>
    )
  }
  if (turn.ok) {
    return (
      <div className="flex items-center gap-1.5 pl-1 text-[12px] text-mute">
        <Check className="size-3.5 text-accent" /> Done in {duration(turn.startedAt, turn.endedAt)}
        {turn.costUsd ? ` · $${turn.costUsd.toFixed(4)}` : ""}
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-danger/25 bg-danger/8 px-3 py-2 text-[13px] text-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="whitespace-pre-wrap break-words">{turn.error || "The turn failed"}</span>
    </div>
  )
}
