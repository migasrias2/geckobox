import { useCallback, useEffect, useRef, useState } from "react"
import { api, type Thread, type ThreadEvent } from "./api"

const POLL_MS = 900

/** Live thread state; events are fetched incrementally. */
export function useThread(id: string) {
  const [thread, setThread] = useState<Thread | undefined>()
  const [events, setEvents] = useState<readonly ThreadEvent[]>([])
  const [error, setError] = useState<string | undefined>()
  const count = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await api.thread(id, count.current)
      setThread(res.thread)
      if (res.events.length > 0) {
        count.current += res.events.length
        setEvents((prev) => [...prev, ...res.events])
      }
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
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
