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
export function GeckoIcon({ name, size = 22, label, className }: { name: GeckoIconName; size?: number; label?: string; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/${name}.png`}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={cx("inline-block shrink-0 select-none object-contain", className)}
    />
  )
}
