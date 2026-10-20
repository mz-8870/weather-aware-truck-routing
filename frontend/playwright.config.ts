import { defineConfig } from "@playwright/test";

// Default (CI): smoke + user journeys against the production build, /api answered by fixtures (no backend, no upstreams).
// LIVE_URL=https://… runs e2e/live.spec.ts against that deployment and the real APIs instead.
const live = process.env.LIVE_URL;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: live ?? "http://localhost:4173",
    // MapLibre needs WebGL; headless Chromium only has it through SwiftShader.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: live
    ? [{ name: "live", testMatch: "live.spec.ts", timeout: 150_000, use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } }]
    : [
        { name: "desktop", testIgnore: "live.spec.ts", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
        { name: "phone", testIgnore: "live.spec.ts", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
      ],
  webServer: live
    ? undefined
    : {
        command: "npm run build && npx vite preview --port 4173 --strictPort",
        url: "http://localhost:4173",
        // Never reuse a server already on 4173: another run's preview would silently test a different build.
    reuseExistingServer: false,
        timeout: 180_000,
      },
});
