import { test, expect } from '@playwright/test';

const API = 'http://localhost:3015/api';
const TEST_PASSWORD = 'test1234';

// Helper: wait for app to finish initializing
async function waitForAppReady(page) {
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
}

// Helper: login via API and inject tokens into page
async function loginViaAPI(page) {
    const email = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
    const resp = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: TEST_PASSWORD })
    });
    const data = await resp.json();

    await page.evaluate((authData) => {
        localStorage.setItem('auth_token', authData.token);
        localStorage.setItem('user_data', JSON.stringify(authData.user));
    }, data);
    await page.reload();
    await waitForAppReady(page);
    return data;
}

test.describe('DuckDB WASM IDE — E2E', () => {

    test.describe('Auth flow', () => {

        test('shows login prompt when not authenticated', async ({ page }) => {
            await page.goto('/');
            await waitForAppReady(page);
            await expect(page.locator('#loginPromptSection')).toBeVisible({ timeout: 10000 });
            await expect(page.locator('#questionSelectorSection')).toBeHidden();
        });

        test('register via UI and see question selector', async ({ page }) => {
            await page.goto('/');
            await waitForAppReady(page);

            // Open auth modal
            await page.click('#loginPromptBtn', { force: true });
            await expect(page.locator('#authModal')).toHaveClass(/visible/, { timeout: 10000 });

            // Switch to register
            await page.click('#authToggleBtn');

            // Fill and submit
            const email = `reg_${Date.now()}@test.com`;
            await page.fill('#authEmail', email);
            await page.fill('#authPassword', TEST_PASSWORD);
            await page.click('.auth-submit-btn');

            // Modal should close and question selector should appear (DuckDB init takes time)
            await expect(page.locator('#authModal')).not.toHaveClass(/visible/, { timeout: 90000 });
            await expect(page.locator('#questionSelectorSection')).toBeVisible({ timeout: 90000 });
        });
    });

    test('DEBUG: localStorage persists after reload', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        page.on('pageerror', err => errors.push('PAGE_ERROR: ' + err.message));

        await page.goto('/');
        await page.evaluate(() => {
            localStorage.setItem('auth_token', 'fake_token');
            localStorage.setItem('user_data', JSON.stringify({ id: 1, email: 'x@x.com' }));
        });
        await page.reload();
        await page.waitForTimeout(10000);

        const token = await page.evaluate(() => localStorage.getItem('auth_token'));
        const hasLoginPrompt = await page.locator('#loginPromptSection').isVisible().catch(() => false);
        const hasQuestionSelector = await page.locator('#questionSelectorSection:not(.hidden)').isVisible().catch(() => false);
        const appPointerEvents = await page.evaluate(() => document.getElementById('appContainer')?.style.pointerEvents);
        const appOpacity = await page.evaluate(() => document.getElementById('appContainer')?.style.opacity);
        console.log('token after reload:', token);
        console.log('loginPrompt visible:', hasLoginPrompt);
        console.log('questionSelector visible:', hasQuestionSelector);
        console.log('appContainer pointer-events:', appPointerEvents);
        console.log('appContainer opacity:', appOpacity);
        console.log('console errors:', JSON.stringify(errors));
    });

    test.describe('Question selector', () => {

        test('loads questions into dropdown after login', async ({ page }) => {
            await page.goto('/');
            await loginViaAPI(page);

            await expect(page.locator('#questionSelectorSection')).toBeVisible({ timeout: 90000 });

            // Wait for questions to populate
            await page.waitForFunction(() => {
                const dd = document.getElementById('questionDropdown');
                return dd && dd.options.length > 1;
            }, { timeout: 30000 });

            const count = await page.locator('#questionDropdown option').count();
            expect(count).toBeGreaterThan(1);
        });

        test('selecting a question shows info panel', async ({ page }) => {
            await page.goto('/');
            await loginViaAPI(page);

            await expect(page.locator('#questionSelectorSection')).toBeVisible({ timeout: 90000 });

            await page.waitForFunction(() => {
                const dd = document.getElementById('questionDropdown');
                return dd && dd.options.length > 1;
            }, { timeout: 30000 });

            await page.locator('#questionDropdown').selectOption({ index: 1 });
            await expect(page.locator('#selectedQuestionInfo')).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('DuckDB query execution', () => {

        test('executes SELECT 1 and shows result', async ({ page }) => {
            await page.goto('/');
            await loginViaAPI(page);

            // Wait for DuckDB to connect
            await page.waitForSelector('.status.connected', { timeout: 90000 });

            // Set query
            await page.evaluate(() => {
                const cm = document.querySelector('.CodeMirror');
                if (cm && cm.CodeMirror) {
                    cm.CodeMirror.setValue('SELECT 1 as test_value');
                } else {
                    document.getElementById('sqlEditor').value = 'SELECT 1 as test_value';
                }
            });

            await page.click('#runQueryBtn');

            // Wait for result table
            await page.waitForSelector('#resultsContainer table', { timeout: 30000 });
            const cellText = await page.locator('#resultsContainer table td').first().textContent();
            expect(cellText.trim()).toBe('1');
        });
    });
});
