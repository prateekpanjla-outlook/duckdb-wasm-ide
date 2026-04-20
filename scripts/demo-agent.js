/**
 * Demo script for recording the Question Authoring Agent flow.
 * Runs in headed (visible) mode with slow actions for screen recording.
 *
 * Usage:
 *   node scripts/demo-agent.js
 *
 * Set environment variables:
 *   PLAYWRIGHT_BASE_URL  (default: https://duckdb-ide-frxi6yk4jq-uc.a.run.app)
 *   ADMIN_SECRET         (default: prod-admin-secret-2026)
 *
 * Start OBS/screen recorder before running this script.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://duckdb-ide-frxi6yk4jq-uc.a.run.app';
const ADMIN_KEY = process.env.ADMIN_SECRET || 'prod-admin-secret-2026';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log(`\n=== Question Authoring Agent Demo ===`);
    console.log(`URL: ${BASE_URL}`);
    console.log(`Start your screen recorder now. Demo begins in 5 seconds...\n`);
    await sleep(5000);

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // --- Step 1: Load the app ---
    console.log('Step 1: Loading app...');
    await page.goto(BASE_URL);
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
    await sleep(2000);

    // --- Step 2: Open Agent panel ---
    console.log('Step 2: Opening Agent panel...');
    await page.click('#adminAgentBtn');
    await sleep(1500);

    // --- Step 3: Enter admin key ---
    console.log('Step 3: Entering admin key...');
    await page.fill('#adminKeyInput', ADMIN_KEY);
    await sleep(1000);

    // --- Step 4: Type the prompt slowly ---
    console.log('Step 4: Typing prompt...');
    const prompt = 'Add a question about RANK() window function';
    await page.click('#agentPrompt');
    for (const char of prompt) {
        await page.keyboard.type(char, { delay: 50 });
    }
    await sleep(1500);

    // --- Step 5: Send and watch reasoning chain ---
    console.log('Step 5: Sending prompt — watch the reasoning chain build...');
    await page.click('#agentSendBtn');

    // Wait for first tool call (SSE streaming)
    await page.waitForSelector('.step-tool-call', { timeout: 30000 });
    console.log('  → First tool call appeared');

    // Wait for question preview card
    try {
        await page.waitForSelector('.question-preview-card', { timeout: 120000 });
        console.log('  → Question preview appeared');
    } catch {
        console.log('  → Timed out waiting for preview. Check the panel for errors.');
    }
    await sleep(3000);

    // --- Step 6: Scroll through the reasoning chain ---
    console.log('Step 6: Scrolling through reasoning chain...');
    const stepsContainer = page.locator('#agentSteps');
    await stepsContainer.evaluate(el => el.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(2000);
    await stepsContainer.evaluate(el => el.scrollTo({ top: el.scrollHeight / 3, behavior: 'smooth' }));
    await sleep(2000);
    await stepsContainer.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    await sleep(3000);

    // --- Step 7: Expand a tool result to show raw JSON ---
    console.log('Step 7: Expanding a tool result...');
    const firstToolResult = page.locator('.step-tool-result .step-tool-header').first();
    if (await firstToolResult.isVisible()) {
        await firstToolResult.click();
        await sleep(3000);
        await firstToolResult.click(); // collapse
        await sleep(1000);
    }

    // --- Step 8: Click Approve ---
    console.log('Step 8: Approving the question...');
    const approveBtn = page.locator('#approveQuestionBtn');
    if (await approveBtn.isVisible()) {
        await approveBtn.scrollIntoViewIfNeeded();
        await sleep(1000);
        await approveBtn.click();
        await sleep(3000);
        console.log('  → Question approved!');
    } else {
        console.log('  → Approve button not found. Skipping.');
    }

    // --- Step 9: Refresh and show new question in dropdown ---
    console.log('Step 9: Refreshing to show new question...');
    await sleep(2000);
    await page.reload();
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
    await sleep(2000);

    // Start as guest to see questions
    await page.click('#guestModeBtn');
    await page.waitForSelector('.status.connected', { timeout: 150000 });
    await page.waitForFunction(() => {
        const dd = document.getElementById('questionDropdown');
        return dd && dd.options.length > 1;
    }, { timeout: 30000 });
    await sleep(2000);

    // Open dropdown to show all questions
    console.log('Step 10: Showing question dropdown...');
    await page.click('#questionDropdown');
    await sleep(5000);

    console.log('\n=== Demo complete! Stop your screen recorder. ===\n');
    await sleep(3000);
    await browser.close();
}

main().catch(err => {
    console.error('Demo failed:', err);
    process.exit(1);
});
