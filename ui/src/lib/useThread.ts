import { useCallback, useEffect, useRef, useState } from "react"
import { api, type Thread, type ThreadEvent } from "./api"

const POLL_MS = 900

/** Live thread state; events are fetched incrementally. */
export function useThread(id: string) {
  const [thread, setThread] = useState<Thread | undefined>()
  const [events, setEvents] = useState<readonly ThreadEvent[]>([])
  const [error, setError] = useState<string | undefined>()
  const count = useRef(0)
  const inFlight = useRef(false)
  const generation = useRef(0)

  const load = useCallback(async () => {
    // One request at a time; a reply only lands if it continues exactly where we are.
    if (inFlight.current) return
    inFlight.current = true
    const gen = generation.current
    const after = count.current
    try {
      const res = await api.thread(id, after)
      if (gen !== generation.current) return
      setThread(res.thread)
      if (res.events.length > 0 && count.current === after) {
        count.current = after + res.events.length
        setEvents((prev) => (prev.length === after ? [...prev, ...res.events] : prev))
      }
      setError(undefined)
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message)
    } finally {
      inFlight.current = false
    }
  }, [id])

  useEffect(() => {
    generation.current += 1
    inFlight.current = false
    count.current = 0
    setThread(undefined)
    setEvents([])
    setError(undefined)
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  return { thread, events, error, refresh: load }
}
