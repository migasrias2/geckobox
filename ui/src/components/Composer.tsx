import { ArrowUp, ChevronDown, Mic, Monitor, Plus } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Computer } from "../lib/api"
import { createDictation, speechSupported, type Dictation } from "../lib/speech"
import { cx } from "./ui"

export interface ModelOption {
  readonly label: string
  readonly value: string | undefined
}

export const MODELS: readonly ModelOption[] = [
  { label: "Default", value: undefined },
  { label: "Opus", value: "opus" },
  { label: "Sonnet", value: "sonnet" },
  { label: "Haiku", value: "haiku" },
]

const SLASH = [
  { name: "test", text: "Run the test suite and summarise failures" },
  { name: "deps", text: "Upgrade the dependencies and list what changed" },
  { name: "review", text: "Review the latest changes for bugs" },
  { name: "browse", text: "Open the browser and " },
  { name: "disk", text: "Check disk space and the biggest folders" },
] as const

type MenuKind = "computers" | "slash" | "model"
interface MenuItem {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly active?: boolean
}
interface Token {
  readonly kind: "computers" | "slash"
  readonly start: number
  readonly query: string
}

const TOKEN = /(^|\s)([@/])([\w.-]*)$/

function parseToken(before: string): Token | undefined {
  const m = TOKEN.exec(before)
  if (!m) return undefined
  const query = m[3] ?? ""
  return { kind: m[2] === "@" ? "computers" : "slash", start: before.length - query.length - 1, query }
}

const CSS = `
@keyframes os-sweep {
  0% { transform: translateX(-100%); opacity: 0; }
  15% { opacity: .5; }
  100% { transform: translateX(100%); opacity: 0; }
}
.os-sweep {
  background: linear-gradient(90deg, #ff4d4d, #ff9f43, #ffe14d, #3ee39b, #38d9e8, #4d8dff, #a66bff);
  filter: blur(18px);
  animation: os-sweep 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes os-eq { 0%, 100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
.os-eq > span { transform-origin: center; animation: os-eq 900ms ease-in-out infinite; }
.os-eq > span:nth-child(2) { animation-delay: -300ms; }
.os-eq > span:nth-child(3) { animation-delay: -600ms; }
@media (prefers-reduced-motion: reduce) {
  .os-sweep { display: none; }
  .os-eq > span { animation: none; }
}
`

function GlideMenu({
  items,
  active,
  onActive,
  onPick,
  className,
  title,
  style,
}: {
  items: readonly MenuItem[]
  active: number
  onActive: (i: number) => void
  onPick: (i: number) => void
  className?: string
  title?: string
  style?: React.CSSProperties
}) {
  const rows = useRef<Array<HTMLButtonElement | null>>([])
  const [box, setBox] = useState<{ top: number; height: number } | undefined>()
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const el = rows.current[active]
    if (el) setBox({ top: el.offsetTop, height: el.offsetHeight })
  }, [active, items])
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      role="listbox"
      className={cx(
        "absolute z-30 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[18px] border border-line-strong bg-raised p-1.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,.9)]",
        style ? "" : "bottom-full mb-2",
        className,
      )}
     style={style}>
      {title && <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-mute">{title}</div>}
      <div className="relative max-h-64 overflow-y-auto">
        {box && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 rounded-[14px] bg-hover"
            style={{
              top: box.top,
              height: box.height,
              transition: ready ? "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1)" : "none",
            }}
          />
        )}
        {items.map((item, i) => (
          <button
            key={item.id}
            ref={(el) => {
              rows.current[i] = el
            }}
            type="button"
            role="option"
            aria-selected={i === active}
            onPointerDown={(e) => e.preventDefault()}
            onPointerMove={() => i !== active && onActive(i)}
            onClick={() => onPick(i)}
            className="relative flex w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-left text-[13px]"
          >
            <span className={cx("truncate font-semibold", item.active ? "text-accent" : "text-ink")}>{item.label}</span>
            {item.hint && <span className="shrink-0 truncate text-[12px] text-mute">{item.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function Equaliser() {
  return (
    <span className="os-eq flex h-4 items-center gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-full w-[3px] rounded-full bg-accent" />
      ))}
    </span>
  )
}

export function Composer({
  placeholder,
  onSubmit,
  disabled = false,
  disabledHint,
  autoFocus = false,
  big = false,
  footer,
  initial = "",
  computers,
  computer,
  onPickComputer,
  models,
  model,
  onModelChange,
}: {
  placeholder: string
  onSubmit: (text: string) => Promise<void>
  disabled?: boolean
  disabledHint?: string
  autoFocus?: boolean
  big?: boolean
  footer?: ReactNode
  initial?: string
  computers?: readonly Computer[]
  /** Name of the currently selected computer; shows a chip that opens the @ menu. */
  computer?: string
  onPickComputer?: (name: string) => void
  models?: readonly ModelOption[]
  model?: string
  onModelChange?: (model: string | undefined) => void
}) {
  const [text, setText] = useState(initial)
  const [caret, setCaret] = useState(initial.length)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [multi, setMulti] = useState(false)
  const [open, setOpen] = useState<"computers" | "model" | undefined>()
  const modelBtn = useRef<HTMLButtonElement>(null)
  const [modelAt, setModelAt] = useState<React.CSSProperties | undefined>()
  // The composer clips overflow, so the model menu is placed by measurement, just above its button.
  useLayoutEffect(() => {
    if (open !== "model" || !modelBtn.current || !root.current) return
    const r = root.current.getBoundingClientRect()
    const b = modelBtn.current.getBoundingClientRect()
    setModelAt({ right: r.right - b.right, bottom: r.bottom - b.top + 8, width: 184 })
  }, [open])
  const [dismissed, setDismissed] = useState<string | undefined>()
  const [active, setActive] = useState(0)
  const [sweep, setSweep] = useState(0)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const dictation = useRef<Dictation | undefined>(undefined)
  const canSpeak = useMemo(() => speechSupported(), [])

  useEffect(() => {
    setText(initial)
    setCaret(initial.length)
  }, [initial])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    const h = Math.min(el.scrollHeight, 160)
    el.style.height = `${h}px`
    setMulti(h > 28 || text.includes("\n"))
  }, [text, big])

  const hasComputers = (computers?.length ?? 0) > 0
  const token = useMemo(() => {
    const t = parseToken(text.slice(0, caret))
    if (!t || (t.kind === "computers" && !hasComputers)) return undefined
    return t
  }, [text, caret, hasComputers])
  const tokenKey = token ? `${token.kind}:${token.start}` : undefined
  useEffect(() => {
    if (!tokenKey) setDismissed(undefined)
  }, [tokenKey])

  const kind: MenuKind | undefined = open ?? (token && tokenKey !== dismissed ? token.kind : undefined)
  const query = open ? "" : (token?.query.toLowerCase() ?? "")

  const items = useMemo<readonly MenuItem[]>(() => {
    if (kind === "computers")
      return (computers ?? [])
        .filter((c) => c.name.toLowerCase().includes(query))
        .map((c) => ({ id: c.name, label: c.name === "local" ? "This Mac" : c.name, hint: c.kind, active: c.name === computer }))
    if (kind === "slash")
      return SLASH.filter((s) => s.name.startsWith(query)).map((s) => ({ id: s.name, label: `/${s.name}`, hint: s.text.replace(/ $/, "…").slice(0, 26) }))
    if (kind === "model") return (models ?? []).map((m) => ({ id: m.label, label: m.label, active: m.value === model }))
    return []
  }, [kind, query, computers, computer, models, model])

  const menuOpen = kind !== undefined && items.length > 0
  useEffect(() => {
    setActive(0)
  }, [kind, query])

  const closeMenu = useCallback(() => {
    setOpen(undefined)
    setDismissed(tokenKey)
  }, [tokenKey])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen, closeMenu])

  useEffect(() => () => dictation.current?.stop(), [])

  const replaceToken = (replacement: string) => {
    const start = token?.start ?? caret
    const end = token ? caret : caret
    const next = text.slice(0, start) + replacement + text.slice(end)
    const pos = start + replacement.length
    setText(next)
    setCaret(pos)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  const pick = (i: number) => {
    const item = items[i]
    if (!item) return
    if (kind === "computers") {
      if (token) replaceToken("")
      onPickComputer?.(item.id)
    } else if (kind === "slash") {
      replaceToken(SLASH.find((s) => s.name === item.id)?.text ?? "")
    } else if (kind === "model") {
      const next = models?.find((m) => m.label === item.id)
      onModelChange?.(next?.value)
      if (next?.value === "opus" && model !== "opus") setSweep((n) => n + 1)
    }
    setOpen(undefined)
    ref.current?.focus()
  }

  const toggleMic = () => {
    if (listening) {
      dictation.current?.stop()
      return
    }
    dictation.current = createDictation({
      onInterim: setInterim,
      onFinal: (t) => t && setText((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${t}` : prev + t)),
      onEnd: (err) => {
        setListening(false)
        if (err) setError(`Dictation: ${err}`)
      },
    })
    if (!dictation.current) return
    setError(undefined)
    setListening(true)
    dictation.current.start()
  }

  const send = async () => {
    const value = text.trim()
    if (!value || sending || disabled) return
    setSending(true)
    setError(undefined)
    try {
      await onSubmit(value)
      setText("")
      setCaret(0)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        pick(active)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        closeMenu()
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const sendable = text.trim().length > 0 && !sending && !disabled
  const rounded = big || multi || footer !== undefined
  const modelLabel = models?.find((m) => m.value === model)?.label ?? "Default"
  const computerLabel = computer === "local" ? "This Mac" : computer
  const shownPlaceholder = listening ? interim || "Listening…" : disabled && disabledHint ? disabledHint : placeholder

  const actions = (
    <>
          {models && (
        <button
          type="button"
          disabled={disabled}
          ref={modelBtn}
          onClick={() => setOpen((o) => (o === "model" ? undefined : "model"))}
          aria-label="Model"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-dim transition hover:bg-hover hover:text-ink active:scale-[.97] disabled:opacity-50"
        >
          {modelLabel}
          <ChevronDown className="size-3.5 text-mute" />
        </button>
      )}
      {canSpeak && (
        <button
          type="button"
          disabled={disabled}
          onClick={toggleMic}
          aria-label={listening ? "Stop dictation" : "Start dictation"}
          aria-pressed={listening}
          className={cx(
            "grid size-9 shrink-0 place-items-center rounded-full transition active:scale-[.94] disabled:opacity-50",
            listening ? "bg-accent/15 text-accent" : "text-dim hover:bg-hover hover:text-ink",
          )}
        >
          {listening ? <Equaliser /> : <Mic className="size-[18px]" strokeWidth={2} />}
        </button>
      )}
      <button
        type="button"
        onClick={() => void send()}
        disabled={!sendable}
        aria-label="Send"
        className={cx(
          "grid size-9 shrink-0 place-items-center rounded-full transition active:scale-[.94]",
          sendable ? "bg-accent text-accent-ink hover:bg-[#4ade9f]" : "bg-hover text-mute",
        )}
      >
        <ArrowUp className={cx("size-[18px]", sending && "animate-pulse")} strokeWidth={2.6} />
      </button>
    </>
  )

  return (
    <div ref={root} className="relative">
      <style>{CSS}</style>
      {menuOpen && kind && (
        <GlideMenu
          items={items}
          active={active}
          onActive={setActive}
          onPick={pick}
          title={kind === "computers" ? "Run on" : kind === "slash" ? "Quick prompts" : "Model"}
          className={kind === "model" ? "" : "left-0 w-64"}
          style={kind === "model" ? modelAt : undefined}
        />
      )}
      <div
        className={cx(
          "relative overflow-hidden border bg-raised transition-[border-radius,border-color,box-shadow] duration-200 focus-within:border-accent/45 focus-within:shadow-[0_0_0_4px_rgba(62,227,155,0.08)]",
          rounded ? "rounded-[24px]" : "rounded-full",
          disabled ? "border-line opacity-70" : "border-line-strong",
        )}
      >
        {sweep > 0 && <span key={sweep} aria-hidden className="os-sweep pointer-events-none absolute inset-0 opacity-0" />}
        <div className="relative flex items-end gap-1.5 p-2">
          {hasComputers && !big && (
            <button
              type="button"
              aria-label="Choose a computer"
              disabled={disabled}
              onClick={() => setOpen((o) => (o === "computers" ? undefined : "computers"))}
              className="grid size-9 shrink-0 place-items-center rounded-full text-dim transition hover:bg-hover hover:text-ink active:scale-[.94] disabled:opacity-50"
            >
              <Plus className="size-[18px]" strokeWidth={2.2} />
            </button>
          )}
          <textarea
            ref={ref}
            value={text}
            autoFocus={autoFocus}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value)
              setCaret(e.target.selectionStart)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={shownPlaceholder}
            className={cx(
              "block min-w-0 flex-1 resize-none bg-transparent leading-6 text-ink outline-none placeholder:text-mute",
              big ? "min-h-[64px] px-3 pt-3 pb-1 text-[15px]" : "px-2 py-1.5 text-[14px]",
              !hasComputers && !big && "pl-3",
            )}
          />
          {!big && actions}
        </div>
        {(footer || computerLabel || big) && (
          <div className="relative flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-0.5">
            {hasComputers && computerLabel && (
              <button
                type="button"
                onClick={() => setOpen((o) => (o === "computers" ? undefined : "computers"))}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-dim transition hover:bg-hover hover:text-ink active:scale-[.97]"
              >
                <Monitor className="size-3.5 text-accent" />
                on {computerLabel}
              </button>
            )}
            {footer}
            {big && <div className="ml-auto flex items-center gap-1">{actions}</div>}
          </div>
        )}
      </div>
      {error && <p className="mt-2 px-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  )
}
