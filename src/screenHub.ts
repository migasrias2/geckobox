import { captureScreenOn, type ScreenFrame } from "./screen.js"

export interface ScreenState {
  /** Increments with every new frame; 0 until the first one. */
  readonly seq: number
  /** Epoch ms of the latest frame. */
  readonly at: number
  readonly frame?: ScreenFrame
  readonly error?: string
}

export interface ScreenHubOptions {
  readonly capture?: (on: string) => Promise<ScreenFrame>
  readonly minIntervalMs?: number
  /** Stop capturing when nobody asked for a frame for this long. */
  readonly idleMs?: number
  readonly retryMinMs?: number
  readonly retryMaxMs?: number
}

interface Waiter {
  readonly afterSeq: number
  readonly resolve: (state: ScreenState) => void
  readonly timer: ReturnType<typeof setTimeout>
}

interface Entry {
  state: ScreenState
  askedAt: number
  running: boolean
  failures: number
  waiters: readonly Waiter[]
  sleeper?: { readonly timer: ReturnType<typeof setTimeout>; readonly wake: () => void }
}

/**
 * Keeps one capture loop per computer, only while someone is watching.
 * Consumers long-poll with next(); the loop idles out after `idleMs` without a request.
 */
export class ScreenHub {
  private readonly entries = new Map<string, Entry>()
  private closed = false
  private readonly capture: (on: string) => Promise<ScreenFrame>
  private readonly minIntervalMs: number
  private readonly idleMs: number
  private readonly retryMinMs: number
  private readonly retryMaxMs: number

  constructor(options: ScreenHubOptions = {}) {
    this.capture = options.capture ?? captureScreenOn
    this.minIntervalMs = options.minIntervalMs ?? 250
    this.idleMs = options.idleMs ?? 8000
    this.retryMinMs = options.retryMinMs ?? 1000
    this.retryMaxMs = options.retryMaxMs ?? 5000
  }

  /** Resolve with the first frame newer than `afterSeq`, or the current state on timeout (or first error). */
  next(on: string, afterSeq: number, timeoutMs = 3000): Promise<ScreenState> {
    const entry = this.entryFor(on)
    entry.askedAt = Date.now()
    this.ensureRunning(on, entry)
    if (this.closed || entry.state.seq > afterSeq) return Promise.resolve(entry.state)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        entry.waiters = entry.waiters.filter((w) => w.timer !== timer)
        resolve(entry.state)
      }, timeoutMs)
      entry.waiters = [...entry.waiters, { afterSeq, resolve, timer }]
    })
  }

  close(): void {
    this.closed = true
    for (const entry of this.entries.values()) {
      if (entry.sleeper) {
        clearTimeout(entry.sleeper.timer)
        entry.sleeper.wake()
      }
      this.release(entry, () => true)
    }
  }

  private entryFor(on: string): Entry {
    const found = this.entries.get(on)
    if (found) return found
    const created: Entry = { state: { seq: 0, at: 0 }, askedAt: 0, running: false, failures: 0, waiters: [] }
    this.entries.set(on, created)
    return created
  }

  private ensureRunning(on: string, entry: Entry): void {
    if (entry.running || this.closed) return
    entry.running = true
    void this.loop(on, entry)
  }

  private release(entry: Entry, ready: (w: Waiter) => boolean): void {
    const [done, rest] = [entry.waiters.filter(ready), entry.waiters.filter((w) => !ready(w))]
    entry.waiters = rest
    for (const waiter of done) {
      clearTimeout(waiter.timer)
      waiter.resolve(entry.state)
    }
  }

  private sleep(entry: Entry, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = () => {
        entry.sleeper = undefined
        resolve()
      }
      entry.sleeper = { timer: setTimeout(wake, ms), wake }
    })
  }

  private watched(entry: Entry): boolean {
    return !this.closed && Date.now() - entry.askedAt < this.idleMs
  }

  private async loop(on: string, entry: Entry): Promise<void> {
    while (this.watched(entry)) {
      const started = Date.now()
      await this.step(on, entry)
      const wait = entry.failures > 0 ? this.backoff(entry.failures) : this.minIntervalMs - (Date.now() - started)
      if (wait > 0) await this.sleep(entry, wait)
    }
    entry.running = false
  }

  private backoff(failures: number): number {
    return Math.min(this.retryMaxMs, this.retryMinMs * 2 ** (failures - 1))
  }

  private async step(on: string, entry: Entry): Promise<void> {
    try {
      const frame = await this.capture(on)
      entry.failures = 0
      entry.state = { seq: entry.state.seq + 1, at: Date.now(), frame }
      this.release(entry, (w) => entry.state.seq > w.afterSeq)
    } catch (error) {
      entry.failures += 1
      const message = error instanceof Error ? error.message : String(error)
      entry.state = { ...entry.state, error: message }
      // With nothing to show yet, tell waiters right away instead of making them time out.
      if (!entry.state.frame) this.release(entry, () => true)
    }
  }
}
