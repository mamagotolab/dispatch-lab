import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:43176",
    video: "on",
  },
  webServer: {
    command: "npm run dev -- --port 43176 --strictPort",
    url: "http://127.0.0.1:43176/dispatch-lab/",
    reuseExistingServer: false,
  },
});
