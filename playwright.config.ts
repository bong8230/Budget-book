import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// .env.local (Supabase 키) 을 테스트 프로세스에도 읽어온다
loadEnvConfig(process.cwd());

const PORT = 3100;
// E2E_BASE_URL 을 주면 이미 배포된 주소를 대상으로 돌린다 (로컬 서버를 띄우지 않음)
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 같은 가계부를 순서대로 다루는 시나리오
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: remote ?? `http://localhost:${PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: remote
    ? undefined
    : {
        command: `npm run build && npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
