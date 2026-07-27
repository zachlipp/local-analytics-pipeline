/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
// so `base` must match the repo name exactly. Deriving it from the Actions
// env keeps the name in one place — renaming the repo needs no commit here.
// Outside CI (dev, preview) the var is unset and we serve from the root.
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: repo ? `/${repo}/` : "/",

  plugins: [react()],

  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },

  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
    },
  },

  // duckdb-wasm uses top-level await; Vite's default browser target
  // is too conservative and the build will fail without this.
  build: {
    target: "esnext",
  },
  esbuild: {
    target: "esnext",
  },

  // duckdb-wasm ships its own workers and .wasm assets. Dev-server
  // prebundling rewrites those URLs and breaks worker instantiation.
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },

  worker: {
    format: "es",
  },

  test: {
    // core/ is pure TS and must stay that way — running its tests in a
    // node environment means a stray `window` reference fails loudly.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
