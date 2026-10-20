import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach } from "vitest"

/** Point OPENSPACES_HOME and the target $HOME at throwaway dirs for each test. */
export function useTempHome(): { readonly home: () => string } {
  let dir = ""
  const saved = { os: process.env.OPENSPACES_HOME, home: process.env.HOME }
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "openspaces-test-"))
    process.env.OPENSPACES_HOME = join(dir, "state")
    process.env.HOME = join(dir, "home")
  })
  afterEach(async () => {
    process.env.OPENSPACES_HOME = saved.os
    process.env.HOME = saved.home
    await rm(dir, { recursive: true, force: true })
  })
  return { home: () => dir }
}
