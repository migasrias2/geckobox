import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { HttpError } from "./http.js"

const run = promisify(execFile)
const MAX_AUDIO = 20 * 1024 * 1024

/** Whisper model: OPENSPACES_WHISPER_MODEL, else ~/.openspaces/models, else the Claude Glasses one. */
export function whisperModel(): string | undefined {
  const candidates = [
    process.env.OPENSPACES_WHISPER_MODEL,
    join(homedir(), ".openspaces/models/ggml-small.bin"),
    join(homedir(), ".openspaces/models/ggml-base.en.bin"),
    join(homedir(), ".claude-glasses/models/ggml-small.bin"),
  ]
  return candidates.find((p): p is string => p !== undefined && existsSync(p))
}

async function has(binary: string): Promise<boolean> {
  try {
    await run("/usr/bin/which", [binary])
    return true
  } catch {
    return false
  }
}

export async function dictationStatus(): Promise<{ available: boolean; reason?: string }> {
  if (!(await has("whisper-cli"))) return { available: false, reason: "Install whisper.cpp: brew install whisper-cpp" }
  if (!(await has("ffmpeg"))) return { available: false, reason: "Install ffmpeg: brew install ffmpeg" }
  if (!whisperModel()) return { available: false, reason: "Put a Whisper model at ~/.openspaces/models/ggml-small.bin" }
  return { available: true }
}

async function readAudio(req: IncomingMessage): Promise<Buffer> {
  const type = req.headers["content-type"] ?? ""
  if (!/^audio\//.test(type)) throw new HttpError(415, "send audio/* (e.g. audio/webm)")
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_AUDIO) throw new HttpError(413, "recording too long")
    chunks.push(chunk as Buffer)
  }
  if (size === 0) throw new HttpError(400, "empty recording")
  return Buffer.concat(chunks)
}

/** POST /api/transcribe: audio in, text out, all on this machine (ffmpeg + whisper.cpp). */
export async function transcribe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const status = await dictationStatus()
  if (!status.available) throw new HttpError(412, status.reason ?? "dictation unavailable")
  const audio = await readAudio(req)
  const dir = await mkdtemp(join(tmpdir(), "openspaces-dictation-"))
  try {
    const input = join(dir, "in.webm")
    const wav = join(dir, "in.wav")
    await writeFile(input, audio)
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav])
    const { stdout } = await run("whisper-cli", ["-m", whisperModel()!, "-f", wav, "-nt", "-np", "-l", "auto"], { maxBuffer: 4 * 1024 * 1024 })
    const text = stdout.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim()
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    res.end(JSON.stringify({ text }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
