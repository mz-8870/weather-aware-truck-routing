/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Pre-bundling moves maplibre-gl away from its worker file, so the worker 404s in dev.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  test: { environment: "jsdom" },
});
