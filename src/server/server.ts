import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { fileURLToPath } from "node:url"
import { hasAllowedHost, hasValidToken, newToken } from "./auth.js"
import { HttpError, readJsonBody, sendError, sendJson } from "./http.js"
import { matchRoute, toHttpError } from "./routes.js"
import { serveStatic } from "./static.js"
import { ScreenHub } from "../screenHub.js"
import { ViewManager } from "./views.js"

export interface ServerOptions {
  readonly port?: number
  readonly host?: string
  readonly staticDir?: string
  readonly token?: string
  /** Inject a hub (tests); defaults to one capturing real screens. */
  readonly screens?: ScreenHub
}

export interface RunningServer {
  readonly url: string
  readonly token: string
  close(): Promise<void>
}

const DEFAULT_PORT = 4600
const LOOPBACK = new Set(["127.0.0.1", "localhost"])

/** Built layout: dist/server/server.js serves dist/ui. */
function defaultStaticDir(): string {
  return fileURLToPath(new URL("../ui/", import.meta.url))
}

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams, views: ViewManager, screens: ScreenHub): Promise<void> {
  const match = matchRoute(req.method ?? "GET", path)
  if (!match) throw new HttpError(404, "not found")
  const body = match.route.needsBody ? await readJsonBody(req) : undefined
  sendJson(res, 200, await match.route.run({ params: match.params, query, body, views, screens }))
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1"
  if (!LOOPBACK.has(host)) throw new Error("The server only binds to 127.0.0.1")
  const token = options.token ?? newToken()
  const staticDir = options.staticDir ?? defaultStaticDir()
  const views = new ViewManager()
  const screens = options.screens ?? new ScreenHub()
  let port = 0

  const server = createServer((req, res) => {
    void dispatch(req, res).catch((error) => {
      const failure = toHttpError(error)
      sendError(res, failure.status, failure.message)
      if (failure.status === 413) req.resume()
    })
  })

  async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hasAllowedHost(req, port)) throw new HttpError(403, "forbidden host")
    const [path = "/", search = ""] = (req.url ?? "/").split("?", 2)
    if (path === "/api" || path.startsWith("/api/")) {
      if (!hasValidToken(req, token)) throw new HttpError(401, "missing or wrong x-openspaces-token")
      return handleApi(req, res, path, new URLSearchParams(search), views, screens)
    }
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "method not allowed")
    return serveStatic(res, staticDir, path, req.method === "HEAD")
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port ?? DEFAULT_PORT, host, () => {
      server.off("error", reject)
      resolve()
    })
  })
  port = (server.address() as AddressInfo).port

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        views.closeAll()
        screens.close()
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
