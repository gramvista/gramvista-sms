import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175", trace: "retain-on-failure" },
  webServer: {
    command: process.platform==='win32'?"npm.cmd run dev:demo":"npm run dev:demo",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    env: { LOCAL_DATABASE_PATH: "memory://" },
  },
  timeout: 60000,
});
