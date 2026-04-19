import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api`;

// Helper: wait for app to finish initializing
async function waitForAppReady(page) {
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
}

// Helper: wait for DuckDB to connect and questions to load
async function waitForDuckDBAndQuestions(page) {
    await page.waitForSelector('.status.connected', { timeout: 150000 });
    await page.waitForFunction(() => {
        const dd = document.getElementById('questionDropdown');
        return dd && dd.options.length > 1;
    }, { timeout: 30000 });
}

test.describe('Guest User Access', () => {

    test('landing page shows Start Practicing and Login buttons', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await expect(page.locator('#guestModeBtn')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#guestModeBtn')).toHaveText('Start Practicing');
        await expect(page.locator('#loginPromptBtn')).toBeVisible();
        await expect(page.locator('#loginPromptBtn')).toHaveText('Login / Register');
    });

    test('clicking Start Practicing creates guest session and loads questions', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await page.click('#guestModeBtn');

        // Header should show "Guest"
        await expect(page.locator('#authBtn')).toHaveText('Guest', { timeout: 30000 });

        // Question selector should be visible
        await expect(page.locator('#questionSelectorSection')).toBeVisible({ timeout: 30000 });

        // DuckDB should connect and questions should load
        await waitForDuckDBAndQuestions(page);

        const count = await page.locator('#questionDropdown option').count();
        expect(count).toBeGreaterThan(1);
    });

    test('guest can select and load a question', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await page.click('#guestModeBtn');
        await waitForDuckDBAndQuestions(page);

        // Select first question
        await page.locator('#questionDropdown').selectOption({ index: 1 });

        // Load question button should work
        const loadBtn = page.locator('#loadQuestionBtn');
        if (await loadBtn.isVisible()) {
            await loadBtn.click();
        }

        // Practice UI should appear (question text visible)
        await expect(page.locator('#practiceQuestionText')).toBeVisible({ timeout: 15000 });
    });

    test('guest options modal shows when clicking Guest in header', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await page.click('#guestModeBtn');
        await expect(page.locator('#authBtn')).toHaveText('Guest', { timeout: 30000 });

        // Click guest button in header
        await page.click('#authBtn');

        // Guest options modal should appear
        await expect(page.locator('#guestOptionsModal')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#upgradeAccountBtn')).toBeVisible();
        await expect(page.locator('#guestLogoutBtn')).toBeVisible();
    });

    test('guest can upgrade to registered account', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await page.click('#guestModeBtn');
        await expect(page.locator('#authBtn')).toHaveText('Guest', { timeout: 30000 });

        // Open guest options
        await page.click('#authBtn');
        await expect(page.locator('#guestOptionsModal')).toBeVisible({ timeout: 5000 });

        // Click upgrade
        await page.click('#upgradeAccountBtn');

        // Auth modal should open with "Create Account" title
        await expect(page.locator('#authModal')).toHaveClass(/visible/, { timeout: 5000 });
        await expect(page.locator('#authTitle')).toHaveText('Create Account');

        // Fill in credentials
        const email = `upgrade_${Date.now()}@test.com`;
        await page.fill('#authEmail', email);
        await page.fill('#authPassword', 'password123');
        await page.click('.auth-submit-btn');

        // Modal should close and header should show the email
        await expect(page.locator('#authModal')).not.toHaveClass(/visible/, { timeout: 30000 });
        await expect(page.locator('#authBtn')).toContainText(email, { timeout: 10000 });
    });

    test('guest can logout', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await page.click('#guestModeBtn');
        await expect(page.locator('#authBtn')).toHaveText('Guest', { timeout: 30000 });

        // Open guest options and logout
        await page.click('#authBtn');
        await expect(page.locator('#guestOptionsModal')).toBeVisible({ timeout: 5000 });

        // Handle confirm dialog
        page.on('dialog', dialog => dialog.accept());
        await page.click('#guestLogoutBtn');

        // Should return to login prompt
        await expect(page.locator('#loginPromptSection')).toBeVisible({ timeout: 10000 });
    });

    test('guest session persists on page refresh', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await page.click('#guestModeBtn');
        await expect(page.locator('#authBtn')).toHaveText('Guest', { timeout: 30000 });

        // Refresh
        await page.reload();
        await waitForAppReady(page);

        // Should still be guest
        await expect(page.locator('#authBtn')).toHaveText('Guest', { timeout: 10000 });
        await expect(page.locator('#questionSelectorSection')).toBeVisible({ timeout: 30000 });
    });

    test('Login/Register button still works for regular auth', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        await page.click('#loginPromptBtn');
        await expect(page.locator('#authModal')).toHaveClass(/visible/, { timeout: 10000 });
        await expect(page.locator('#authTitle')).toHaveText('Login');
    });
});
