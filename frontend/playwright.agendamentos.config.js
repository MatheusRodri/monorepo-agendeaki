import { defineConfig } from '@playwright/test';
import configuracao from './playwright.config';

export default defineConfig({
  ...configuracao,
  testDir: './tests/agendamentos',
  workers: 2,
  use: { ...configuracao.use, baseURL: 'http://127.0.0.1:3107' },
  webServer: {
    ...configuracao.webServer,
    command: 'npm run start -- --hostname 127.0.0.1 --port 3107',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
  },
});
