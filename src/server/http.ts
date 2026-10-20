import type { IncomingMessage, ServerResponse } from "node:http"

export const MAX_BODY_BYTES = 64 * 1024

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  })
  res.end(payload)
}

export function sendError(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  sendJson(res, status, { error: message })
}

function hasBody(req: IncomingMessage): boolean {
  const length = req.headers["content-length"]
  return (length !== undefined && length !== "0") || req.headers["transfer-encoding"] !== undefined
}

/** Read a JSON body (max 64 KB, application/json only). No body means `{}`. */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (!hasBody(req)) return {}
  const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase()
  if (type !== "application/json") throw new HttpError(415, "content-type must be application/json")
  const declared = Number(req.headers["content-length"] ?? 0)
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, `body is larger than ${MAX_BODY_BYTES} bytes`)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, `body is larger than ${MAX_BODY_BYTES} bytes`)
    chunks.push(chunk as Buffer)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new HttpError(400, "body is not valid JSON")
  }
}
