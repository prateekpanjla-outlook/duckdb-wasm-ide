import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3015';

test.describe('Cache-busting — stale UI prevention (#24)', () => {

    test('index.html has no-cache header', async ({ page }) => {
        const response = await page.goto('/');
        const cacheControl = response.headers()['cache-control'];
        expect(cacheControl).toContain('no-cache');
        expect(cacheControl).toContain('must-revalidate');
    });

    test('index.html injects version query strings into CSS links', async ({ page }) => {
        await page.goto('/');
        const html = await page.content();
        const cssMatch = html.match(/style\.css\?v=([a-z0-9]+)/);
        expect(cssMatch).toBeTruthy();
        expect(cssMatch[1].length).toBeGreaterThan(0);
    });

    test('index.html injects version query strings into JS scripts', async ({ page }) => {
        await page.goto('/');
        const html = await page.content();
        const jsMatch = html.match(/app\.js\?v=([a-z0-9]+)/);
        expect(jsMatch).toBeTruthy();
        expect(jsMatch[1].length).toBeGreaterThan(0);
    });

    test('CSS and JS version strings match each other', async ({ page }) => {
        await page.goto('/');
        const html = await page.content();
        const cssVersion = html.match(/style\.css\?v=([a-z0-9]+)/)?.[1];
        const jsVersion = html.match(/app\.js\?v=([a-z0-9]+)/)?.[1];
        expect(cssVersion).toBe(jsVersion);
    });

    test('static assets have immutable cache headers', async ({ page }) => {
        const response = await page.goto('/css/style.css');
        const cacheControl = response.headers()['cache-control'];
        expect(cacheControl).toContain('max-age=31536000');
        expect(cacheControl).toContain('immutable');
    });

    test('WASM files have immutable cache headers', async ({ request }) => {
        const response = await request.head(`${BASE}/libs/duckdb-wasm/duckdb-eh.wasm`);
        const cacheControl = response.headers()['cache-control'];
        expect(cacheControl).toContain('max-age=31536000');
        expect(cacheControl).toContain('immutable');
    });

    test('/api/version returns a version string', async ({ request }) => {
        const response = await request.get(`${BASE}/api/version`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.version).toBeTruthy();
        expect(typeof data.version).toBe('string');
    });

    test('version in HTML matches /api/version', async ({ page, request }) => {
        await page.goto('/');
        const html = await page.content();
        const htmlVersion = html.match(/\.css\?v=([a-z0-9]+)/)?.[1];

        const apiResp = await request.get(`${BASE}/api/version`);
        const { version } = await apiResp.json();

        expect(htmlVersion).toBe(version);
    });

    test('non-existent routes still return versioned index.html', async ({ page }) => {
        const response = await page.goto('/some/random/path');
        const cacheControl = response.headers()['cache-control'];
        expect(cacheControl).toContain('no-cache');
        const html = await page.content();
        expect(html).toContain('?v=');
    });

    test('API routes are not affected by SPA fallback', async ({ request }) => {
        const response = await request.get(`${BASE}/api/version`);
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');
    });

    test('health endpoint is not affected by SPA fallback', async ({ request }) => {
        const response = await request.get(`${BASE}/health`);
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');
    });
});
