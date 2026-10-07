import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === "serve" && !isPreview ? "/" : "/Quiz/",
  build: {
    target: "es2022",
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tools/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    restoreMocks: true,
  },
}));
