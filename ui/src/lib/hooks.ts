import { useCallback, useEffect, useRef, useState } from "react"

/** Poll `load` every `ms` while mounted; `key` changes restart it. */
export function usePoll<T>(load: () => Promise<T>, ms: number, key: unknown = null) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const loadRef = useRef(load)
  loadRef.current = load
  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current())
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    setData(undefined)
    let alive = true
    const tick = async () => {
      if (alive) await refresh()
    }
    void tick()
    const timer = setInterval(tick, ms)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [ms, key, refresh])
  return { data, error, refresh }
}
