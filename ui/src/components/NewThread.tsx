import { useState } from "react"
import { api, type AgentInfo, type AgentName, type Computer, type Thread } from "../lib/api"
import { AGENT_LABEL } from "../lib/format"
import { Composer } from "./Composer"
import { Select, Toggle } from "./ui"

const IDEAS = [
  "Clone my repo, run the tests and summarise what fails",
  "Upgrade the dependencies and open a short changelog",
  "Check disk space and what's using the most memory",
  "Find the TODOs in this project and rank them",
]

export function NewThread({
  agents,
  computers,
  onStarted,
}: {
  agents: readonly AgentInfo[] | undefined
  computers: readonly Computer[] | undefined
  onStarted: (thread: Thread) => void
}) {
  const [agent, setAgent] = useState<AgentName>("claude-code")
  const [on, setOn] = useState("local")
  const [autoApprove, setAutoApprove] = useState(false)
  const [computerTools, setComputerTools] = useState(true)
  const [cwd, setCwd] = useState("")
  const [idea, setIdea] = useState("")

  return (
    <div className="panel relative flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[12px] font-medium text-accent">
          <span className="size-1.5 rounded-full bg-accent pulse-ring" /> Unlimited sessions · your own computers
        </div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight">
          Give an agent <span className="text-accent">its own computer.</span>
        </h1>
        <p className="mt-2 text-[15px] text-dim">
          Pick the agent and the machine. It works in the background; you can watch, steer or take over anytime.
        </p>

        <div className="mt-8">
          <Composer
            big
            autoFocus
            initial={idea}
            placeholder="What should it do?"
            onSubmit={async (prompt) => {
              const thread = await api.start({
                agent,
                on,
                prompt,
                autoApprove,
                ...(computerTools ? { allowTools: ["mcp__cua"] } : {}),
                ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
              })
              onStarted(thread)
            }}
            footer={
              <>
                <Select value={agent} onChange={(e) => setAgent(e.target.value as AgentName)} aria-label="Agent">
                  {(agents ?? [{ name: "claude-code", binary: "claude", tested: true }]).map((a) => (
                    <option key={a.name} value={a.name}>
                      {AGENT_LABEL[a.name]}
                      {a.tested ? "" : " (beta)"}
                    </option>
                  ))}
                </Select>
                <Select value={on} onChange={(e) => setOn(e.target.value)} aria-label="Computer">
                  {(computers ?? [{ name: "local", address: "local", kind: "local" as const }]).map((c) => (
                    <option key={c.name} value={c.name}>
                      on {c.name === "local" ? "this Mac" : c.name}
                    </option>
                  ))}
                </Select>
              </>
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 px-1">
          <Toggle checked={computerTools} onChange={setComputerTools} label="Let it use computers (Cua)" />
          <Toggle checked={autoApprove} onChange={setAutoApprove} label="Auto-approve everything" />
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="Work in /path/to/repo (optional)"
            className="h-8 min-w-[240px] flex-1 rounded-full border border-line bg-transparent px-3.5 font-mono text-[12px] text-ink outline-none placeholder:font-sans placeholder:text-mute focus:border-accent/50"
          />
        </div>

        <div className="mt-10">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">Try</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {IDEAS.map((text) => (
              <button
                key={text}
                onClick={() => setIdea(text)}
                className="rounded-[22px] border border-line bg-panel px-4 py-3 text-left text-[13px] leading-snug text-dim transition hover:border-accent/30 hover:text-ink"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
