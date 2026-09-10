import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: 'chrome'
  },
  webServer: {
    command: 'vite preview --host 127.0.0.1 --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: !process.env.CI
  }
});
