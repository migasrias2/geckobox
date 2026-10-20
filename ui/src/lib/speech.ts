import { api } from "./api"

/**
 * Dictation that runs on this machine: the mic is recorded in the browser and
 * transcribed by whisper.cpp through the local server (no cloud speech service).
 */
export const speechSupported = (): boolean =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"

export interface Dictation {
  readonly start: () => void
  readonly stop: () => void
}

export interface DictationHandlers {
  /** Status text while recording/transcribing (shown in the placeholder). */
  readonly onInterim: (text: string) => void
  readonly onFinal: (text: string) => void
  readonly onEnd: (error?: string) => void
  readonly lang?: string
}

const MAX_MS = 120_000

export function createDictation(handlers: DictationHandlers): Dictation | undefined {
  if (!speechSupported()) return undefined
  let recorder: MediaRecorder | undefined
  let stream: MediaStream | undefined
  let limit: ReturnType<typeof setTimeout> | undefined
  const chunks: Blob[] = []

  const release = () => {
    clearTimeout(limit)
    stream?.getTracks().forEach((t) => t.stop())
  }

  const finish = async () => {
    release()
    const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" })
    if (blob.size < 1200) return handlers.onEnd()
    handlers.onInterim("Transcribing…")
    try {
      const { text } = await api.transcribe(blob)
      handlers.onFinal(text)
      handlers.onEnd()
    } catch (e) {
      handlers.onEnd((e as Error).message)
    }
  }

  return {
    start: () => {
      void (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
          recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus" } : undefined)
          recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
          recorder.onstop = () => void finish()
          recorder.start(250)
          handlers.onInterim("Listening… click the mic again to stop")
          limit = setTimeout(() => recorder?.state === "recording" && recorder.stop(), MAX_MS)
        } catch (e) {
          release()
          handlers.onEnd((e as Error).name === "NotAllowedError" ? "microphone permission was denied" : (e as Error).message)
        }
      })()
    },
    stop: () => {
      if (recorder?.state === "recording") recorder.stop()
      else release()
    },
  }
}
