import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: "./data/agentdesk.e2e.sqlite",
    },
  },
});
