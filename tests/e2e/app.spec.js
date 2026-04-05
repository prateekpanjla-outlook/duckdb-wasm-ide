import { test, expect } from '@playwright/test';

const API = `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3015'}/api`;
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

test.describe('SQL Practice Project — E2E', () => {

    test.describe('Auth flow', () => {

        test('shows login prompt when not authenticated', async ({ page }) => {
            await page.goto('/');
            await waitForAppReady(page);
            await expect(page.locator('#loginPromptSection')).toBeVisible({ timeout: 10000 });
            await expect(page.locator('#questionSelectorSection')).toBeHidden();
        });

        test('register via UI opens modal and submits', async ({ page }) => {
            await page.goto('/');
            await waitForAppReady(page);

            // Open auth modal
            await page.click('#loginPromptBtn', { force: true });
            await expect(page.locator('#authModal')).toHaveClass(/visible/, { timeout: 10000 });

            // Switch to register
            await page.click('#authToggleBtn');
            await expect(page.locator('#authTitle')).toHaveText('Register');

            // Fill and submit
            const email = `reg_${Date.now()}@test.com`;
            await page.fill('#authEmail', email);
            await page.fill('#authPassword', TEST_PASSWORD);
            await page.click('.auth-submit-btn');

            // Modal should close after successful registration
            await expect(page.locator('#authModal')).not.toHaveClass(/visible/, { timeout: 30000 });

            // Auth button should show the user's email (logged in state)
            await expect(page.locator('#authBtn')).toContainText(email, { timeout: 10000 });
        });
    });

    test.describe('Question selector', () => {

        test('loads questions into dropdown after login', async ({ page }) => {
            await page.goto('/');
            await loginViaAPI(page);

            await expect(page.locator('#questionSelectorSection')).toBeVisible({ timeout: 30000 });

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

            await expect(page.locator('#questionSelectorSection')).toBeVisible({ timeout: 30000 });

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
            test.setTimeout(180000); // 3 minutes — DuckDB WASM init is slow without COI

            await page.goto('/');
            await loginViaAPI(page);

            // Wait for DuckDB to connect (can take 60-90s without SharedArrayBuffer)
            await page.waitForSelector('.status.connected', { timeout: 150000 });

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
