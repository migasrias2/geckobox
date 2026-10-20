/** Thin wrapper over the browser Web Speech API (feature-detected). */

interface RecognitionAlternative {
  readonly transcript: string
}
interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: RecognitionAlternative
}
interface RecognitionEvent {
  readonly resultIndex: number
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult }
}
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const speechSupported = (): boolean => ctor() !== undefined

export interface Dictation {
  readonly start: () => void
  readonly stop: () => void
}

export interface DictationHandlers {
  readonly onInterim: (text: string) => void
  readonly onFinal: (text: string) => void
  readonly onEnd: (error?: string) => void
  readonly lang?: string
}

/** Returns undefined when the browser has no speech recognition. */
export function createDictation(handlers: DictationHandlers): Dictation | undefined {
  const Ctor = ctor()
  if (!Ctor) return undefined
  const rec = new Ctor()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = handlers.lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US")
  let failure: string | undefined
  rec.onresult = (e) => {
    let interim = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      const text = result?.[0]?.transcript ?? ""
      if (result?.isFinal) handlers.onFinal(text.trim())
      else interim += text
    }
    handlers.onInterim(interim.trim())
  }
  rec.onerror = (e) => {
    if (e.error !== "no-speech" && e.error !== "aborted") failure = e.error
  }
  rec.onend = () => {
    handlers.onInterim("")
    handlers.onEnd(failure)
    failure = undefined
  }
  return {
    start: () => {
      try {
        rec.start()
      } catch {
        handlers.onEnd("Could not start dictation")
      }
    },
    stop: () => rec.stop(),
  }
}
