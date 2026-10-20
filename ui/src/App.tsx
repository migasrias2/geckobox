import { KeyRound } from "lucide-react"
import { useEffect, useState } from "react"
import { Computers } from "./components/Computers"
import { Everywhere } from "./components/Everywhere"
import { NewThread } from "./components/NewThread"
import { Logo, Sidebar, type View } from "./components/Sidebar"
import { ThreadView } from "./components/ThreadView"
import { api, readToken, setToken } from "./lib/api"
import { usePoll } from "./lib/hooks"

export function App() {
  const [token] = useState(() => readToken())
  setToken(token)
  const [view, setView] = useState<View>({ kind: "new" })
  const threads = usePoll(api.threads, 1500)
  const computers = usePoll(api.computers, 10_000)
  const agents = usePoll(api.agents, 60_000)

  useEffect(() => {
    // A new link (e.g. after restarting `openspaces ui`) only changes the hash: take its token.
    const onHash = () => {
      if (/token=/.test(window.location.hash)) {
        readToken()
        window.location.reload()
      }
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : undefined
      const typing = el !== undefined && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
      const remote = el?.closest("[data-capture-keys]") != null || document.querySelector("[data-takeover]") !== null
      if (!typing && !remote && e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) setView({ kind: "new" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (!token || threads.error?.includes("x-openspaces-token")) return <NoToken />

  const changed = () => void threads.refresh()
  return (
    <div className="flex h-full gap-2.5 overflow-hidden p-2.5">
      <Sidebar view={view} onView={setView} threads={threads.data} computers={computers.data} />
      <main className="flex min-w-0 flex-1 gap-2.5">
        {view.kind === "new" && (
          <NewThread
            agents={agents.data}
            computers={computers.data}
            onStarted={(t) => {
              changed()
              setView({ kind: "thread", id: t.id })
            }}
          />
        )}
        {view.kind === "thread" && <ThreadView key={view.id} id={view.id} onChanged={changed} />}
        {view.kind === "computers" && <Computers computers={computers.data} onChanged={() => void computers.refresh()} />}
        {view.kind === "everywhere" && <Everywhere computers={computers.data} onOpen={(id) => setView({ kind: "thread", id })} />}
      </main>
    </div>
  )
}

function NoToken() {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="max-w-sm text-center">
        <div className="flex justify-center"><Logo /></div>
        <KeyRound className="mx-auto mt-8 size-6 text-accent" />
        <h1 className="mt-3 text-[18px] font-semibold">Open the link from your terminal</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-dim">
          For safety, the dashboard only works from the private link that <code className="font-mono text-accent">openspaces ui</code> prints.
        </p>
      </div>
    </div>
  )
}
