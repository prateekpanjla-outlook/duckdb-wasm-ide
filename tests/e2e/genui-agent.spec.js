import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const GENUI_URL = process.env.GENUI_URL || 'https://duckdb-ide-genui-frxi6yk4jq-uc.a.run.app';
const ADMIN_KEY = process.env.ADMIN_KEY || 'prod-admin-secret-2026';

// Open DevTools automatically in headed mode
test.use({
    launchOptions: {
        args: ['--auto-open-devtools-for-tabs'],
    },
    viewport: { width: 1920, height: 1080 },
});

const SCREENSHOT_DIR = path.join('tests', 'e2e', 'screenshots', 'genui');

// Each run gets its own timestamped subdirectory
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_DIR = path.join(SCREENSHOT_DIR, RUN_ID);

test.beforeAll(() => {
    fs.mkdirSync(RUN_DIR, { recursive: true });
});

async function snap(page, label) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(RUN_DIR, `${ts}_${label}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
}

test.describe('GenUI Agent — Full Run', () => {
    test.setTimeout(300_000);

    test('agent run with screenshots every second', async ({ page }) => {
        test.skip(!ADMIN_KEY, 'Set ADMIN_KEY env var to run this test');

        // Collect console logs for overlay
        const consoleLogs = [];
        page.on('console', msg => {
            const entry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
            consoleLogs.push(entry);
            // Keep last 30 lines
            if (consoleLogs.length > 30) consoleLogs.shift();
        });
        page.on('pageerror', err => {
            consoleLogs.push(`[PAGE_ERROR] ${err.message}`);
        });

        // Navigate
        await page.goto(GENUI_URL, { waitUntil: 'domcontentloaded' });
        await snap(page, '00_page_loaded');

        // Auto-scroll agent log when new steps appear
        await page.evaluate(() => {
            const agentLog = document.getElementById('agentLog');
            if (agentLog) {
                new MutationObserver(() => {
                    agentLog.scrollTop = agentLog.scrollHeight;
                }).observe(agentLog, { childList: true, subtree: true });
            }
        });

        // Wait for Pyodide ready
        console.log('[TEST] Waiting for Pyodide warmup...');
        await page.waitForFunction(
            () => {
                const btn = document.getElementById('runBtn');
                return btn && !btn.disabled && btn.textContent.trim() === 'Run Agent';
            },
            { timeout: 180_000 }
        );
        await snap(page, '01_pyodide_ready');
        console.log('[TEST] Pyodide ready');

        // Fill form
        await page.fill('#adminKey', ADMIN_KEY);
        await page.fill('#prompt', 'Add a question about LEFT OUTER JOIN');
        await snap(page, '02_form_filled');

        // Start periodic screenshots
        let snapCounter = 0;
        let stopped = false;
        const snapInterval = setInterval(async () => {
            if (stopped) return;
            snapCounter++;
            const label = String(snapCounter).padStart(3, '0');
            try {
                await snap(page, `run_${label}`);
            } catch (e) {
                stopped = true; // page closed, stop trying
            }
        }, 5000);

        // Click Run Agent
        await page.click('#runBtn');
        console.log('[TEST] Agent started');
        await snap(page, '03_agent_started');

        // Wait for agent complete
        let agentDone = false;
        try {
            await page.waitForFunction(
                () => {
                    const steps = document.querySelectorAll('.step-system');
                    return Array.from(steps).some(s =>
                        s.textContent.includes('Agent complete') || s.textContent.includes('Agent finished')
                    );
                },
                { timeout: 240_000 }
            );
            agentDone = true;
        } catch (e) {
            console.log('[TEST] Agent did not complete within timeout');
        }

        stopped = true;
        clearInterval(snapInterval);

        try {
            await snap(page, '04_agent_done');
            await page.evaluate(() => { document.getElementById('agentLog').scrollTop = 0; });
            await snap(page, '05_log_top');
            await page.evaluate(() => { const l = document.getElementById('agentLog'); l.scrollTop = l.scrollHeight; });
            await snap(page, '06_log_bottom');
        } catch (e) { /* page may be closed */ }

        // === Collect metrics ===

        // Count generate_prefab_ui calls in agent log
        const genuiCount = await page.locator('.step-genui').count();

        // Count tool calls total
        const toolCallCount = await page.locator('.step-tool-call').count();

        // Count errors in agent log
        const errorCount = await page.locator('.step-error').count();

        // Get console logs for Pyodide metrics
        const sectionLogs = consoleLogs.filter(l => l.includes('Section #'));
        const partialLogs = consoleLogs.filter(l => l.includes('Streaming partial'));
        const finalLogs = consoleLogs.filter(l => l.includes('Final render'));
        const errorLogs = consoleLogs.filter(l => l.includes('[ERR]') || l.includes('[PAGE_ERROR]'));

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('TEST RESULTS');
        console.log('='.repeat(60));
        console.log(`Agent completed: ${agentDone}`);
        console.log(`Tool calls (total): ${toolCallCount}`);
        console.log(`generate_prefab_ui calls: ${genuiCount}`);
        console.log(`Pyodide section renders: ${sectionLogs.length}`);
        console.log(`Option C partial streams: ${partialLogs.length}`);
        console.log(`Final renders: ${finalLogs.length}`);
        console.log(`Agent log errors: ${errorCount}`);
        console.log(`Console errors: ${errorLogs.length}`);
        console.log(`Screenshots taken: ${snapCounter + 9}`);
        console.log(`Screenshot dir: ${SCREENSHOT_DIR}`);
        console.log('='.repeat(60));

        if (sectionLogs.length > 0) {
            console.log('\nPyodide sections:');
            sectionLogs.forEach(l => console.log(`  ${l}`));
        }
        if (partialLogs.length > 0) {
            console.log('\nPartial streams:');
            partialLogs.forEach(l => console.log(`  ${l}`));
        }
        if (errorLogs.length > 0) {
            console.log('\nErrors:');
            errorLogs.forEach(l => console.log(`  ${l}`));
        }

        // Print all console logs for debugging
        console.log('\n--- Full console log ---');
        consoleLogs.forEach(l => console.log(l));

        // Assertions
        expect(agentDone).toBeTruthy();
        expect(genuiCount).toBeGreaterThanOrEqual(1);
    });

    test('COOP/COEP headers present', async ({ page }) => {
        const response = await page.goto(GENUI_URL);
        const headers = response.headers();
        console.log(`COOP: ${headers['cross-origin-opener-policy']}`);
        console.log(`COEP: ${headers['cross-origin-embedder-policy']}`);
        expect(headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
    });

    test('zero CDN requests', async ({ page }) => {
        const cdnHits = [];
        page.on('request', req => {
            const u = req.url();
            if (u.includes('cdn.jsdelivr') || u.includes('esm.sh') || u.includes('unpkg.com')) {
                cdnHits.push(u);
            }
        });
        await page.goto(GENUI_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        console.log(`CDN requests: ${cdnHits.length}`);
        cdnHits.forEach(u => console.log(`  ${u}`));
        expect(cdnHits).toEqual([]);
    });

    test('health check', async ({ request }) => {
        const resp = await request.get(`${GENUI_URL}/health`);
        expect(resp.ok()).toBeTruthy();
        const data = await resp.json();
        expect(data.status).toBe('ok');
    });
});
