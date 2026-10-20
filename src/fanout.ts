import { startThread, type StartOptions, type Thread } from "./thread.js"
import type { AgentEvent, TurnResult } from "./types.js"

export interface FanOutResult {
  readonly on: string
  readonly threadId?: string
  readonly result?: TurnResult
  readonly error?: string
}

export type FanOutOptions = Omit<StartOptions, "on" | "onEvent"> & {
  /** Close every thread once its job is done (default true). */
  readonly close?: boolean
  readonly onEvent?: (on: string, event: AgentEvent) => void
}

/** Run the same job on several computers at once and collect every result. */
export async function fanOut(computers: readonly string[], options: FanOutOptions): Promise<readonly FanOutResult[]> {
  if (computers.length === 0) throw new Error("fanOut needs at least one computer")
  const { close = true, onEvent, ...start } = options
  const runOne = async (on: string): Promise<FanOutResult> => {
    let thread: Thread | undefined
    try {
      thread = await startThread({ ...start, on, ...(onEvent ? { onEvent: (event: AgentEvent) => onEvent(on, event) } : {}) })
      const result = await thread.wait()
      return { on, threadId: thread.id, ...(result ? { result } : {}) }
    } catch (error) {
      return { on, ...(thread ? { threadId: thread.id } : {}), error: (error as Error).message }
    } finally {
      if (close && thread) await thread.close().catch(() => undefined)
    }
  }
  return Promise.all(computers.map(runOne))
}
