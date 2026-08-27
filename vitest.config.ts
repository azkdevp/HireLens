import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  define: Object.fromEntries(
    Object.entries(loadEnv(mode, process.cwd(), "")).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])
  )
}));
