# Geckobox tutorial

Give an AI agent its own computer, watch it work, and take over when you want. Everything runs on machines you own. There is no account, no relay and no session limit.

This walk-through takes about 10 minutes. It assumes a Mac (macOS 26 on Apple silicon). Linux works too: use Docker or Podman for sandboxes.

## 1. Install

You need Node.js 20 or newer and an agent CLI. Claude Code is the best-tested one.

```sh
npm install -g github:migasrias2/geckobox   # installs the `openspaces` command
claude --version                             # Claude Code, logged in
```

## 2. Open the app

```sh
openspaces ui
```

The command prints a private link (`http://127.0.0.1:4600/#token=…`) and opens it. The dashboard only works through that link, so other websites can't drive your computers. If you restart the command, open the new link it prints.

![The new-thread screen](tutorial/01-new-thread.jpg)

## 3. Give an agent something to do

1. Type a task in the box, or click one of the ideas under it.
2. **on This Mac ▾** picks the computer. You can also type `@` in the message.
3. **Claude Code ▾** picks the agent: Claude Code, Codex, Gemini CLI, OpenCode, or Shell for plain commands.
4. **Default ▾** picks the model: Opus, Sonnet or Haiku. Haiku is fastest for simple jobs.
5. The **mic** dictates. Speech is transcribed on your Mac with whisper.cpp (see *Dictation* below).
6. Press **Enter** or the arrow to send.

`/` gives quick prompts (`/test`, `/deps`, `/review`, `/browse`, `/disk`).

**Options** holds the permission switches:

- **Let it use computers (Cua)** pre-approves only Cua's computer tools, so an agent on your Mac can drive a Cua sandbox's browser.
- **Auto-approve everything** skips every permission prompt. Use it only on a computer you're happy for the agent to change freely. Sandboxes always auto-approve, because they're walled off from your files.
- **Work in /path** runs the agent inside an existing folder, such as a repo.

## 4. Add computers

Open **Computers** in the sidebar.

![The Computers page](tutorial/02-computers.jpg)

**Sandboxes on this Mac** create a private Linux computer in about 20 seconds, with the agents you pick already installed. Each one is its own lightweight VM, made with Apple's `container` tool (or Docker/Podman on Linux):

```sh
brew install container && container system start   # once
```

Then type a name and press **Create**. The CLI does the same:

```sh
openspaces sandbox create dev
```

**Your computers** add machines you already have:

| Type | Address | Good for |
| --- | --- | --- |
| SSH | `user@host` or a Tailscale name | a Mac mini, a VPS, any Linux box |
| Docker | container name | an existing dev container |
| Cua sandbox | `local:desk` | a Linux desktop with a browser (from the Cua CLI) |

**Check** shows whether a computer is reachable and which agents it has.

### Logging agents in on sandboxes

A sandbox forwards the agent's login from your Mac. For Claude Code with a subscription:

```sh
claude setup-token                                 # prints a long-lived token
openspaces secrets set CLAUDE_CODE_OAUTH_TOKEN     # paste it; it's stored in the macOS Keychain
```

## 5. Watch it work

Every thread is a chat, with the agent's computer live beside it.

![A thread with the live screen](tutorial/03-thread-live-screen.jpg)

- **Ran 5 tools · 21s** rows expand to show each tool call and what it touched.
- The **gecko** shows the bot's state. It looks around when idle, sparkles and scurries while working, smiles when done, gets dizzy when stuck, and falls asleep when closed.
- The **live screen** follows whichever computer the agent is actually using. The green-rimmed pointer is the agent's, and a ripple shows each click.
- **Pause** stops the current turn. Send another message to carry on.
- The **ⓘ** button switches the right side to details: model, permissions, cost and work folder.

## 6. Take over

Click the screen, or **Take over**, to open the full viewer.

![Take-over mode](tutorial/04-take-over.jpg)

Click, scroll and type straight into the computer. Taking over pauses a working agent, so you don't fight it for the mouse.

- **Record** saves a `.webm` video of the screen. It keeps recording if you collapse the viewer.
- **Give back control** (or Shift+Esc) closes the viewer. Plain Esc goes to the remote computer, so you can still close its pop-ups.

## 7. Run one job everywhere

**Run everywhere** sends the same task to several computers at once. Results land side by side.

![Run everywhere](tutorial/05-run-everywhere.jpg)

Tick the computers, pick an agent (Shell is handy for quick checks), type the job and send. Each computer gets its own thread, so you can open any result and continue that conversation.

## The same from the terminal

```sh
openspaces start --on dev "Clone my repo and run the tests"   # prints a thread id
openspaces logs <id> -f                                        # follow along
openspaces send <id> --wait "Now fix the failing test"
openspaces run --on local,dev,mini "Check disk space"          # fan out
openspaces close <id>
```

`openspaces --help` lists everything.

## Dictation

The mic records in the browser and transcribes on your Mac. Nothing goes to a cloud speech service. It needs:

```sh
brew install whisper-cpp ffmpeg
mkdir -p ~/.openspaces/models
curl -L -o ~/.openspaces/models/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

The language is detected automatically. Click the mic again to stop recording.

## Troubleshooting

- **"This page's link is out of date"**: the server restarted with a new token. Open the newest link `openspaces ui` printed.
- **The screen says "Can't reach … screen"**: that computer has no desktop (plain sandboxes and SSH boxes without X don't). Pick another computer under *Watch another computer*.
- **An agent on your Mac says its tools were blocked**: turn on **Let it use computers (Cua)** for Cua tools, or **Auto-approve everything** in Options.
- **A Cua sandbox was recreated under the same name and agent runs fail with "Connection refused"**: restart Cua's daemon: `cua daemon stop && cua daemon start`.
- **Scrolling or clicks feel slow**: each action is one round trip to the computer, about 0.25 s on a local sandbox. Fewer, larger scrolls work best.
