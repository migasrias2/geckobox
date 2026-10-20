import { startServer } from "../server/server.js"
import { openUrl } from "../view.js"
import { out } from "./format.js"

/** Run the local web UI until Ctrl-C. */
export async function cmdUi(port: number, open: boolean): Promise<number> {
  const server = await startServer({ port })
  const url = `${server.url}/#token=${server.token}`
  out(`openspaces UI: ${url}`)
  out("Anyone with this link can run commands on your computers. Press Ctrl-C to stop.")
  if (open) openUrl(url)
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve)
    process.once("SIGTERM", resolve)
  })
  await server.close()
  return 0
}
