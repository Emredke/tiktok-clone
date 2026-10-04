import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3101",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    actionTimeout: 10000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: { ...devices["iPhone 16 Pro"], defaultBrowserType: "chromium" },
    },
    {
      name: "android",
      testMatch: "**/club.spec.js",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
    {
      name: "safari",
      testMatch: "**/club.spec.js",
      use: {
        ...devices["iPhone 16 Pro"],
        defaultBrowserType: "webkit",
        launchOptions: { args: [] },
      },
    },
  ],
  webServer: {
    command: "node tests/prepare-e2e.js && node server/index.js",
    url: "http://localhost:3101/api/health",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      PORT: "3101",
      APP_ORIGIN: "http://localhost:3101",
      DATABASE_PATH: "./data/e2e.sqlite",
      NODE_ENV: "test",
      MAIL_MODE: "development",
      STORAGE_DRIVER: "local",
    },
  },
});
