import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'cloud.spec.js',
    fullyParallel: false,
    retries: 1,
    workers: 1,
    timeout: 120000,
    reporter: [['list']],
    use: {
        baseURL: process.env.CLOUD_URL || 'https://duckdb-ide-192834930119.us-central1.run.app',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        }
    ],
});
