import { useEffect, useRef, useState } from "react"
import type { ScreenFrame } from "./api"

/**
 * Records the live screen to a WebM: every new frame is drawn onto a canvas
 * whose stream feeds a MediaRecorder. Keeps running while the viewer is collapsed.
 */
export function useRecorder(frame: ScreenFrame | undefined, name: string) {
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  // Paint each new frame while recording.
  useEffect(() => {
    if (!recording || !frame?.image || !canvas.current) return
    const img = new Image()
    img.onload = () => canvas.current?.getContext("2d")?.drawImage(img, 0, 0, canvas.current.width, canvas.current.height)
    img.src = `data:image/jpeg;base64,${frame.image}`
  }, [recording, frame?.image])

  const start = () => {
    if (recording || typeof MediaRecorder === "undefined") return
    const c = document.createElement("canvas")
    c.width = frame?.width ?? 1280
    c.height = frame?.height ?? 800
    canvas.current = c
    chunks.current = []
    const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
    const rec = new MediaRecorder(c.captureStream(12), { mimeType: type, videoBitsPerSecond: 4_000_000 })
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
    rec.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks.current, { type: "video/webm" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `openspaces-${name.replace(/[^a-z0-9-]+/gi, "-")}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
    rec.start(1000)
    recorder.current = rec
    setSecs(0)
    setRecording(true)
  }

  const stop = () => {
    recorder.current?.stop()
    recorder.current = null
    setRecording(false)
  }

  useEffect(() => () => recorder.current?.stop(), [])

  return { recording, secs, start, stop, supported: typeof MediaRecorder !== "undefined" }
}

export function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}
