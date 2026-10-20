import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    coverage: { include: ["src/**/*.ts"], exclude: ["src/cli.ts"], reporter: ["text-summary", "text"] },
  },
})
