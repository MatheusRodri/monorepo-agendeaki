import { defineConfig, devices } from '@playwright/test';

const urlBase = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/acessibilidade',
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: urlBase,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1',
    url: urlBase,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
