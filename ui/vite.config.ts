import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: { outDir: "../dist/ui", emptyOutDir: true },
  server: { port: 5174, proxy: { "/api": "http://127.0.0.1:4600" } },
})
