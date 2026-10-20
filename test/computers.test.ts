import { describe, expect, it } from "vitest"
import { addComputer, describe as describeComputer, loadRegistry, parseAddress, removeComputer, resolveComputer } from "../src/computers.js"
import { useTempHome } from "./helpers.js"

describe("parseAddress", () => {
  it("parses every kind", () => {
    expect(parseAddress("local")).toEqual({ kind: "local" })
    expect(parseAddress("ssh:me@mac-mini.local")).toEqual({ kind: "ssh", host: "me@mac-mini.local" })
    expect(parseAddress("docker:box")).toEqual({ kind: "docker", container: "box" })
    expect(parseAddress("cua:local:desk")).toEqual({ kind: "cua", sandbox: "local:desk" })
  })
  it("returns undefined for plain names", () => {
    expect(parseAddress("mac-mini")).toBeUndefined()
  })
  it("rejects flag injection and spaces", () => {
    expect(() => parseAddress("ssh:-oProxyCommand=x")).toThrow(/Invalid address/)
    expect(() => parseAddress("docker:a b")).toThrow(/Invalid address/)
  })
  it("describes computers back as addresses", () => {
    for (const address of ["local", "ssh:me@h", "docker:box", "cua:desk"]) {
      expect(describeComputer(parseAddress(address)!)).toBe(address)
    }
  })
})

describe("registry", () => {
  useTempHome()

  it("is empty when there is no file", async () => {
    expect(await loadRegistry()).toEqual({})
  })
  it("adds, resolves and removes computers", async () => {
    await addComputer("mini", "ssh:me@mini")
    expect(await resolveComputer("mini")).toEqual({ kind: "ssh", host: "me@mini" })
    expect(await resolveComputer("docker:x")).toEqual({ kind: "docker", container: "x" })
    await removeComputer("mini")
    await expect(resolveComputer("mini")).rejects.toThrow(/No computer named "mini"/)
  })
  it("rejects bad names, the reserved name and unknown addresses", async () => {
    await expect(addComputer("bad name", "local")).rejects.toThrow(/Invalid computer name/)
    await expect(addComputer("local", "local")).rejects.toThrow(/built in/)
    await expect(addComputer("x", "ftp:host")).rejects.toThrow(/Unknown address/)
    await expect(removeComputer("ghost")).rejects.toThrow(/No computer/)
  })
})
