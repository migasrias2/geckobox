import { z } from "zod"
import { resolveComputer } from "./computers.js"
import { quote } from "./shell.js"
import { capture } from "./transport.js"
import type { Computer } from "./types.js"

export interface ScreenFrame {
  readonly width: number
  readonly height: number
  readonly cursor: { readonly x: number; readonly y: number }
  readonly jpegBase64: string
}

const NO_SCREEN = "No screen"

/** Find the X display (respecting an existing $DISPLAY) and make sure the tools exist. */
const DISPLAY_PREFIX = [
  `if [ -z "$DISPLAY" ]; then N=$(ls /tmp/.X11-unix 2>/dev/null | head -1 | tr -dc 0-9); [ -n "$N" ] && DISPLAY=":$N"; fi`,
  `export DISPLAY`,
  `[ -n "$DISPLAY" ] || { echo "noscreen no X display found"; exit 3; }`,
  `command -v xdotool >/dev/null 2>&1 || { echo "noscreen xdotool is not installed"; exit 3; }`,
].join("\n")

const CAPTURE_BODY = [
  `command -v import >/dev/null 2>&1 || { echo "noscreen ImageMagick import is not installed"; exit 3; }`,
  `LOC=$(xdotool getmouselocation 2>/dev/null) || { echo "noscreen cannot open display $DISPLAY"; exit 3; }`,
  `echo "$LOC" | sed -E 's/^x:(-?[0-9]+) y:(-?[0-9]+).*/cursor \\1 \\2/'`,
  `echo "size $(xdotool getdisplaygeometry)"`,
  `import -silent -window root -quality 60 jpg:- | base64 -w0`,
  `echo`,
].join("\n")

/** Shell script that prints `cursor X Y`, `size W H`, then the base64 JPEG. */
export function screenScript(): string {
  return `${DISPLAY_PREFIX}\n${CAPTURE_BODY}`
}

const noScreen = (reason: string) => new Error(`${NO_SCREEN}: ${reason}`)

function pair(line: string | undefined, label: string): readonly [number, number] {
  const match = new RegExp(`^${label} (-?\\d+) (-?\\d+)$`).exec((line ?? "").trim())
  if (!match) throw noScreen(`unexpected output (${label})`)
  return [Number(match[1]), Number(match[2])]
}

/** Parse the output of screenScript(). */
export function parseCapture(stdout: string): ScreenFrame {
  const lines = stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "")
  const first = lines[0] ?? ""
  if (first.startsWith("noscreen")) throw noScreen(first.slice("noscreen".length).trim() || "unavailable")
  const [x, y] = pair(lines[0], "cursor")
  const [width, height] = pair(lines[1], "size")
  const jpegBase64 = lines[2] ?? ""
  if (!/^[A-Za-z0-9+/=]+$/.test(jpegBase64)) throw noScreen("no image in output")
  return { width, height, cursor: { x, y }, jpegBase64 }
}

function assertScreenable(computer: Computer): void {
  if (computer.kind === "local") throw noScreen("local is this machine")
}

function reasonOf(result: { code: number | null; stdout: string; stderr: string }): string {
  const noscreen = /^noscreen (.*)$/m.exec(result.stdout)
  if (noscreen) return noscreen[1] ?? "unavailable"
  return result.stderr.trim().split("\n").at(-1) || `exit code ${result.code}`
}

/** Grab one frame of the computer's screen. */
export async function captureScreen(computer: Computer): Promise<ScreenFrame> {
  assertScreenable(computer)
  const result = await capture(computer, screenScript())
  if (result.code !== 0) throw noScreen(reasonOf(result))
  return parseCapture(result.stdout)
}

/** Resolve a registry name or inline address, then grab a frame. */
export async function captureScreenOn(on: string): Promise<ScreenFrame> {
  return captureScreen(await resolveComputer(on))
}

const coord = z.number().int().min(0).max(20000)
const pointer = { x: coord, y: coord }

export const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["click", "double_click", "right_click", "move"]), ...pointer }),
  z.object({ action: z.literal("type"), text: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("key"), key: z.string().regex(/^[A-Za-z0-9_+]{1,40}$/, "invalid key") }),
  z.object({
    action: z.literal("scroll"),
    ...pointer,
    direction: z.enum(["up", "down"]),
    amount: z.number().int().min(1).max(20),
  }),
])

export type InputAction = z.infer<typeof inputSchema>

function inputCommand(action: InputAction): string {
  switch (action.action) {
    case "move":
      return `xdotool mousemove ${action.x} ${action.y}`
    case "click":
      return `xdotool mousemove ${action.x} ${action.y} click 1`
    case "double_click":
      return `xdotool mousemove ${action.x} ${action.y} click --repeat 2 --delay 80 1`
    case "right_click":
      return `xdotool mousemove ${action.x} ${action.y} click 3`
    case "type":
      return `xdotool type --delay 8 -- ${quote(action.text)}`
    case "key":
      return `xdotool key -- ${quote(action.key)}`
    case "scroll":
      return `xdotool mousemove ${action.x} ${action.y} click --repeat ${action.amount} ${action.direction === "up" ? 4 : 5}`
  }
}

/** Shell script performing one validated input action. */
export function inputScript(action: InputAction): string {
  return `${DISPLAY_PREFIX}\n${inputCommand(inputSchema.parse(action))}`
}

export async function sendInput(computer: Computer, action: InputAction): Promise<void> {
  assertScreenable(computer)
  const result = await capture(computer, inputScript(action))
  if (result.code !== 0) throw noScreen(reasonOf(result))
}

export async function sendInputOn(on: string, action: InputAction): Promise<void> {
  return sendInput(await resolveComputer(on), action)
}
