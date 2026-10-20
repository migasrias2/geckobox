import { describe, expect, it } from "vitest"
import { capture, invocationFor } from "../src/transport.js"

describe("invocationFor", () => {
  it("runs local scripts over stdin with env exported inside", () => {
    const inv = invocationFor({ kind: "local" }, "echo hi", { TOKEN: "s3cret" })
    expect(inv.command).toBe("/bin/sh")
    expect(inv.args).not.toContain("s3cret")
    expect(inv.stdin).toBe("export TOKEN=s3cret\necho hi")
  })
  it("keeps secrets out of ssh and docker argv", () => {
    const ssh = invocationFor({ kind: "ssh", host: "me@h", options: ["-p", "2222"] }, "x", { T: "s3cret" })
    expect(ssh.args).toEqual(["-T", "-o", "BatchMode=yes", "-p", "2222", "--", "me@h", "sh -l -s"])
    expect(ssh.stdin).toContain("s3cret")
    const docker = invocationFor({ kind: "docker", container: "box" }, "x")
    expect(docker.args).toEqual(["exec", "-i", "box", "sh", "-l", "-s"])
  })
  it("passes the script as one quoted arg to cua", () => {
    const inv = invocationFor({ kind: "cua", sandbox: "desk" }, "echo 'a'")
    expect(inv.args).toEqual(["sandbox", "exec", "desk", `sh -l -c 'echo '\\''a'\\'''`])
    expect(inv.stdin).toBeUndefined()
  })
})

describe("capture", () => {
  it("runs a script locally and collects output", async () => {
    const res = await capture({ kind: "local" }, 'echo "$GREETING"; echo oops >&2; exit 3', { GREETING: "hello there" })
    expect(res).toEqual({ code: 3, stdout: "hello there", stderr: "oops" })
  })
})
