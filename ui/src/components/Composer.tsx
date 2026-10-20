import { ArrowUp } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cx } from "./ui"

export function Composer({
  placeholder,
  onSubmit,
  disabled = false,
  disabledHint,
  autoFocus = false,
  big = false,
  footer,
  initial = "",
}: {
  placeholder: string
  onSubmit: (text: string) => Promise<void>
  disabled?: boolean
  disabledHint?: string
  autoFocus?: boolean
  big?: boolean
  footer?: ReactNode
  initial?: string
}) {
  const [text, setText] = useState(initial)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setText(initial)
  }, [initial])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, big ? 260 : 200)}px`
  }, [text, big])

  const send = async () => {
    const value = text.trim()
    if (!value || sending || disabled) return
    setSending(true)
    setError(undefined)
    try {
      await onSubmit(value)
      setText("")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div
        className={cx(
          "rounded-[22px] border bg-raised transition focus-within:border-accent/45 focus-within:shadow-[0_0_0_4px_rgba(52,211,153,0.08)]",
          disabled ? "border-line opacity-70" : "border-line-strong",
        )}
      >
        <textarea
          ref={ref}
          value={text}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          placeholder={disabled && disabledHint ? disabledHint : placeholder}
          className={cx(
            "block w-full resize-none bg-transparent px-4 text-ink outline-none placeholder:text-mute",
            big ? "min-h-[84px] pt-4 text-[15px]" : "min-h-[48px] pt-3.5 text-[14px]",
          )}
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{footer}</div>
          <button
            onClick={() => void send()}
            disabled={!text.trim() || sending || disabled}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition hover:bg-[#4ade9f] disabled:bg-line disabled:text-mute"
          >
            <ArrowUp className={cx("size-4.5", sending && "animate-pulse")} strokeWidth={2.6} />
          </button>
        </div>
      </div>
      {error && <p className="mt-2 px-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  )
}
