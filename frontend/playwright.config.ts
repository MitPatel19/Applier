import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the critical journeys. They expect the API on :8000 and the web app on
 * :3000 (`scripts/dev.sh`), or start them when not already running.
 * Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled Chromium.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: "cd ../backend && APPLIER_SCHEDULER_ENABLED=false .venv/bin/uvicorn app.main:app --port 8000",
      url: "http://localhost:8000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  ],
});
