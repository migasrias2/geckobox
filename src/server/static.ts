import { createReadStream } from "node:fs"
import { realpath, stat } from "node:fs/promises"
import type { ServerResponse } from "node:http"
import { extname, join, sep } from "node:path"
import { sendError } from "./http.js"

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
}

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>openspaces</title>
<body style="font-family:system-ui;padding:2rem"><h1>UI not built</h1><p>Run <code>npm run build</code>, then reload.</p></body>`

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isFile() === true
}

/** Map a decoded URL path to a file under `root`, or undefined if it would escape or is not a file. */
async function resolveInside(root: string, urlPath: string): Promise<string | undefined> {
  const parts = urlPath.split(/[\\/]/).filter((p) => p !== "" && p !== ".")
  if (parts.includes("..") || urlPath.includes("\0")) return undefined
  const candidate = join(root, ...parts)
  const real = await realpath(candidate).catch(() => undefined)
  if (!real || !(real === root || real.startsWith(root + sep)) || !(await isFile(real))) return undefined
  return real
}

function sendFile(res: ServerResponse, file: string, head: boolean): void {
  res.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  })
  if (head) {
    res.end()
    return
  }
  createReadStream(file).on("error", () => res.destroy()).pipe(res)
}

function sendNotBuilt(res: ServerResponse): void {
  res.writeHead(200, { "content-type": TYPES[".html"]!, "content-length": Buffer.byteLength(NOT_BUILT) })
  res.end(NOT_BUILT)
}

/** Serve a file from `staticDir`; unknown paths fall back to index.html (SPA). */
export async function serveStatic(res: ServerResponse, staticDir: string, rawPath: string, head: boolean): Promise<void> {
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return sendError(res, 400, "bad path encoding")
  }
  const root = await realpath(staticDir).catch(() => undefined)
  if (!root) return sendNotBuilt(res)
  if (decoded.split(/[\\/]/).includes("..") || decoded.includes("\0")) return sendError(res, 404, "not found")
  const file = (await resolveInside(root, decoded)) ?? (await resolveInside(root, "index.html"))
  if (!file) return sendNotBuilt(res)
  sendFile(res, file, head)
}
