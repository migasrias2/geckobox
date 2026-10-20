import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react"
import { ChevronDown } from "lucide-react"
import type { AgentName, ThreadStatus } from "../lib/api"
import { Gecko, type Mood } from "./Gecko"
import { isBusy, STATUS_LABEL } from "../lib/format"

export function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(" ")
}

type Variant = "primary" | "subtle" | "ghost" | "danger"

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-[#4ade9f] font-semibold shadow-[0_0_24px_-6px_var(--color-accent)]",
  subtle: "bg-raised text-ink hover:bg-hover",
  ghost: "text-dim hover:text-ink hover:bg-hover",
  danger: "bg-raised text-danger hover:bg-danger/10",
}

export function Button({
  variant = "subtle",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 select-none active:scale-[.97]",
        "disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent/60",
        size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-10 px-5 text-sm",
        VARIANT[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={cx(
        "grid size-10 place-items-center rounded-full bg-raised text-dim transition active:scale-95",
        "hover:bg-hover hover:text-accent disabled:opacity-35 disabled:pointer-events-none",
        className,
      )}
    >
      {children}
    </button>
  )
}

export function StatusDot({ status }: { status: ThreadStatus }) {
  const color =
    status === "failed" ? "bg-danger" : status === "closed" ? "bg-mute" : isBusy(status) ? "bg-accent pulse-ring" : "bg-accent/70"
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", color)} />
}

export function StatusPill({ status }: { status: ThreadStatus }) {
  const tone =
    status === "failed"
      ? "text-danger bg-danger/10 border-danger/20"
      : status === "closed"
        ? "text-mute bg-raised border-line"
        : "text-accent bg-accent/10 border-accent/20"
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tone)}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function AgentAvatar({ agent, size = 36, busy = false, mood }: { agent: AgentName; size?: number; busy?: boolean; mood?: Mood }) {
  return <Gecko agent={agent} size={size} mood={mood ?? (busy ? "busy" : "idle")} />
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-[22px] bg-raised/60 shadow-[inset_0_0_0_1px_var(--color-line)]", className)}>{children}</div>
}

export function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px] [&+&]:border-t [&+&]:border-line">
      <span className="text-dim">{label}</span>
      <span className={cx("min-w-0 truncate text-right text-ink", mono && "font-mono text-xs")}>{children}</span>
    </div>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative inline-flex", className)}>
      <select
        {...rest}
        className="h-9 w-full appearance-none rounded-full bg-hover pl-4 pr-8 text-[13px] font-semibold text-ink outline-none transition hover:bg-[#252a27] focus:ring-2 focus:ring-accent/40"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
    </span>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-[13px] text-dim hover:text-ink"
    >
      <span className={cx("relative h-5 w-9 rounded-full border transition", checked ? "border-accent/40 bg-accent/80" : "border-line bg-raised")}>
        <span className={cx("absolute top-0.5 size-3.5 rounded-full transition-all", checked ? "left-[18px] bg-accent-ink" : "left-0.5 bg-mute")} />
      </span>
      {label}
    </button>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1.5 pt-5 text-[12px] font-bold text-mute">{children}</div>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-2xl", className)} />
}
