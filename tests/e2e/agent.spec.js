import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_SECRET || 'dev-admin-secret-2026';

async function waitForAppReady(page) {
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
}

test.describe('Question Authoring Agent', () => {

    test('agent generates a RANK() question with full reasoning chain', async ({ page }) => {
        // This test takes ~60s due to rate limiting between Gemini calls
        test.setTimeout(180000);

        await page.goto('/');
        await waitForAppReady(page);

        // Open agent panel
        await page.click('#adminAgentBtn');
        await expect(page.locator('#agentPanel')).toBeVisible({ timeout: 5000 });

        // Enter admin key and prompt
        await page.fill('#adminKeyInput', ADMIN_KEY);
        await page.fill('#agentPrompt', 'Add a question about RANK() window function');
        await page.click('#agentSendBtn');

        // Wait for first tool call to appear (SSE streaming)
        await expect(page.locator('.step-tool-call').first()).toBeVisible({ timeout: 30000 });

        // Wait for tool result
        await expect(page.locator('.step-tool-result').first()).toBeVisible({ timeout: 15000 });

        // Wait for the question preview card to appear (agent finished)
        await expect(page.locator('.question-preview-card')).toBeVisible({ timeout: 120000 });

        // Verify preview card has all sections
        await expect(page.locator('.question-preview-card h4:has-text("Question")')).toBeVisible();
        await expect(page.locator('.question-preview-card h4:has-text("Schema")')).toBeVisible();
        await expect(page.locator('.question-preview-card h4:has-text("Solution")')).toBeVisible();
        await expect(page.locator('.question-preview-card h4:has-text("Explanation")')).toBeVisible();
        await expect(page.locator('.question-preview-card h4:has-text("Concepts")')).toBeVisible();

        // Verify approve/reject buttons exist
        await expect(page.locator('#approveQuestionBtn')).toBeVisible();
        await expect(page.locator('#rejectQuestionBtn')).toBeVisible();
    });

    test('newly inserted question appears in dropdown after refresh', async ({ page }) => {
        test.setTimeout(30000);

        await page.goto('/');
        await waitForAppReady(page);

        // Login as guest to see questions
        await page.click('#guestModeBtn');
        await page.waitForSelector('.status.connected', { timeout: 150000 });
        await page.waitForFunction(() => {
            const dd = document.getElementById('questionDropdown');
            return dd && dd.options.length > 1;
        }, { timeout: 30000 });

        // Check that we have more than the original 7 questions
        const count = await page.locator('#questionDropdown option').count();
        expect(count).toBeGreaterThan(8); // 7 original + placeholder + at least 1 agent-generated
    });
});
