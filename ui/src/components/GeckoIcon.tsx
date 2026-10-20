import { cx } from "./ui"

/** Names of the icons cut from docs/brand/gecko-icons.png by scripts/icons.py. */
export type GeckoIconName =
  | "face" | "happy" | "wink" | "sparkle" | "badge" | "cool"
  | "crawl" | "peek" | "sleep" | "climb" | "idea" | "love"
  | "run" | "laptop" | "terminal" | "server" | "globe" | "cloud"
  | "done" | "failed" | "search" | "settings" | "shield" | "refresh"
  | "mail" | "new" | "link" | "location" | "calendar" | "bell"
  | "nap" | "hide" | "dizzy" | "king" | "code" | "stand"

/** One of Miguel's dark-mode gecko icons. Decorative unless given a label. */
const MOTION: Partial<Record<GeckoIconName, string>> = { peek: "gicon-peek", idea: "gicon-glow" }

/** Stable per-icon offset so a column of icons never bobs in lockstep. */
function delayFor(name: string): string {
  const n = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return `${-((n % 17) / 17) * 3.8}s`
}

export function GeckoIcon({
  name,
  size = 22,
  label,
  className,
  still = false,
}: {
  name: GeckoIconName
  size?: number
  label?: string
  className?: string
  /** Turn the animation off (e.g. inside dense lists). */
  still?: boolean
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/${name}.png`}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      style={{ ["--gi-delay" as string]: delayFor(name) }}
      className={cx("inline-block shrink-0 select-none object-contain", !still && (MOTION[name] ?? "gicon"), className)}
    />
  )
}
