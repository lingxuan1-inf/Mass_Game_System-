import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './stress-test',
  testMatch: '**/*.spec.js',
  timeout: 120000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npx --yes serve . -p 3000',
    port: 3000,
    reuseExistingServer: true,
  },
});
