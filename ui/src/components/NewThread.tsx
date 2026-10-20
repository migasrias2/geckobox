import { useState } from "react"
import { api, type AgentInfo, type AgentName, type Computer, type Thread } from "../lib/api"
import { AGENT_LABEL } from "../lib/format"
import { Composer, MODELS } from "./Composer"
import { SlidersHorizontal } from "lucide-react"
import { cx, Toggle } from "./ui"

const IDEAS = [
  { label: "Run the tests", text: "Clone my repo, run the tests and summarise what fails" },
  { label: "Upgrade deps", text: "Upgrade the dependencies and open a short changelog" },
  { label: "Check disk", text: "Check disk space and what's using the most memory" },
  { label: "Rank TODOs", text: "Find the TODOs in this project and rank them" },
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
  const [showOptions, setShowOptions] = useState(false)
  const [model, setModel] = useState<string | undefined>()
  const [idea, setIdea] = useState("")

  return (
    <div className="panel relative flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[360px]" />
      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        <h1 className="mb-6 text-center text-[30px] font-semibold tracking-tight">
          Give an agent <span className="text-accent">its own computer.</span>
        </h1>

        <Composer
          big
          autoFocus
          initial={idea}
          computers={computers ?? [{ name: "local", address: "local", kind: "local" as const }]}
          computer={on}
          onPickComputer={setOn}
          models={MODELS}
          model={model}
          onModelChange={setModel}
          placeholder="What should it do?"
          onSubmit={async (prompt) => {
            const thread = await api.start({
              agent,
              on,
              prompt,
              ...(model ? { model } : {}),
              autoApprove,
              ...(computerTools ? { allowTools: ["mcp__cua"] } : {}),
              ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
            })
            onStarted(thread)
          }}
          footer={
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value as AgentName)}
              aria-label="Agent"
              className="h-8 cursor-pointer appearance-none rounded-full bg-transparent px-3 text-[13px] font-semibold text-dim outline-none transition hover:bg-hover hover:text-ink"
            >
              {(agents ?? [{ name: "claude-code", binary: "claude", tested: true }]).map((a) => (
                <option key={a.name} value={a.name}>
                  {AGENT_LABEL[a.name]}
                  {a.tested ? "" : " (beta)"}
                </option>
              ))}
            </select>
          }
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          {IDEAS.map((idea) => (
            <button
              key={idea.label}
              onClick={() => setIdea(idea.text)}
              className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-mute transition hover:bg-raised hover:text-ink"
            >
              {idea.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-line-strong" />
          <button
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition hover:bg-raised hover:text-ink",
              showOptions || autoApprove || cwd.trim() || !computerTools ? "text-dim" : "text-mute",
            )}
          >
            <SlidersHorizontal className="size-3.5" /> Options
          </button>
        </div>

        {showOptions && (
          <div className="rise mx-auto mt-3 flex w-full flex-col gap-3 rounded-[20px] bg-raised/60 p-4">
            <Toggle checked={computerTools} onChange={setComputerTools} label="Let it use computers (Cua)" />
            <Toggle checked={autoApprove} onChange={setAutoApprove} label="Auto-approve everything" />
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="Work in /path/to/repo (optional)"
              className="h-9 rounded-full bg-hover px-3.5 font-mono text-[12px] text-ink outline-none placeholder:font-sans placeholder:text-mute focus:ring-2 focus:ring-accent/40"
            />
          </div>
        )}
      </div>
    </div>
  )
}
