import { AGENTS } from "./agents/index.js"
import { capture } from "./transport.js"
import type { Computer } from "./types.js"

export interface ProbeResult {
  readonly ok: boolean
  readonly host?: string
  /** Agent binary → present on the computer. */
  readonly agents: Readonly<Record<string, boolean>>
  readonly error?: string
  readonly stdout: string
}

/** Shell script that prints the host line and one ✓/- line per agent binary. */
export function probeScript(): string {
  const bins = Object.values(AGENTS).map((a) => a.binary).join(" ")
  return `echo "host: $(uname -sm)"; for b in ${bins}; do command -v "$b" >/dev/null 2>&1 && echo "  ✓ $b" || echo "  - $b"; done`
}

/** Pure: read the probe script's output. */
export function parseProbe(stdout: string): { readonly host?: string; readonly agents: Record<string, boolean> } {
  const lines = stdout.split("\n")
  const host = lines.find((l) => l.startsWith("host:"))?.slice(5).trim()
  const agents = Object.fromEntries(
    lines.flatMap((line) => {
      const match = /^\s*([✓-])\s+(\S+)\s*$/.exec(line)
      return match ? [[match[2]!, match[1] === "✓"] as const] : []
    }),
  )
  return { ...(host ? { host } : {}), agents }
}

/** Check a computer is reachable and which agents it has. Never throws. */
export async function probeComputer(computer: Computer): Promise<ProbeResult> {
  try {
    const res = await capture(computer, probeScript())
    const parsed = parseProbe(res.stdout)
    const ok = res.code === 0
    return { ok, ...parsed, stdout: res.stdout, ...(ok ? {} : { error: res.stderr || `exited with code ${res.code}` }) }
  } catch (error) {
    return { ok: false, agents: {}, stdout: "", error: (error as Error).message }
  }
}
