import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { exportLines, isEnvName, join, quote } from "../src/shell.js"

const echo = (line: string): string => execFileSync("/bin/sh", ["-c", `printf '%s|' ${line}`], { encoding: "utf8" })

describe("quote", () => {
  it("leaves safe words alone", () => {
    expect(quote("abc-1.2/x")).toBe("abc-1.2/x")
  })
  it("quotes empty strings", () => {
    expect(quote("")).toBe("''")
  })
  it.each(["it's", "a b", "$(rm -rf /)", "`id`", 'say "hi"', "new\nline", "*", "; ls"])("round-trips %j through sh", (value) => {
    expect(echo(quote(value))).toBe(`${value}|`)
  })
})

describe("join", () => {
  it("keeps argv boundaries", () => {
    expect(echo(join(["a b", "c'd", "e"]))).toBe("a b|c'd|e|")
  })
})

describe("exportLines", () => {
  it("exports set vars and skips unset ones", () => {
    expect(exportLines({ A: "x y", B: undefined })).toBe("export A='x y'")
  })
  it("rejects bad names", () => {
    expect(() => exportLines({ "A;rm": "x" })).toThrow(/Invalid environment variable/)
  })
  it("validates names", () => {
    expect(isEnvName("CLAUDE_CODE_OAUTH_TOKEN")).toBe(true)
    expect(isEnvName("1A")).toBe(false)
  })
})
