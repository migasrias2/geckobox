import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import type { IncomingMessage } from "node:http"

export const TOKEN_HEADER = "x-openspaces-token"

export function newToken(): string {
  return randomBytes(32).toString("hex")
}

/** Constant-time compare (hashing first so lengths never leak). */
export function tokenMatches(expected: string, given: string | string[] | undefined): boolean {
  if (typeof given !== "string") return false
  const a = createHash("sha256").update(expected).digest()
  const b = createHash("sha256").update(given).digest()
  return timingSafeEqual(a, b)
}

export function hasValidToken(req: IncomingMessage, token: string): boolean {
  return tokenMatches(token, req.headers[TOKEN_HEADER])
}

/** DNS-rebinding guard: only the exact loopback origins we listen on are served. */
export function hasAllowedHost(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host?.toLowerCase()
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}
