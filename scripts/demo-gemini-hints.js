/**
 * Demo: Gemini AI Hints for Question 3 — "Find the average score of all students"
 *
 * Demonstrates 3 AI features:
 *   1. Get Hint — ask Gemini for guidance without revealing the answer
 *   2. Explain Syntax Error — submit a query with a typo, ask Gemini to explain
 *   3. Explain Logical Error — submit a query that runs but gives wrong results
 *
 * Run headed (for screen recording):
 *   node scripts/demo-gemini-hints.js
 *
 * Uses 3 Gemini API calls — be mindful of free tier rate limits.
 */
import { chromium } from 'playwright';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://duckdb-ide-192834930119.us-central1.run.app';
const EMAIL = `demo_ai_${Date.now()}@test.com`;
const PASSWORD = 'demo1234';

const PAUSE = (ms) => new Promise(r => setTimeout(r, ms));

// Smooth scroll an element into view
async function smoothScroll(locator, page) {
    await locator.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await PAUSE(600);
}

// Highlight an element briefly before interacting
async function highlight(locator, page) {
    await smoothScroll(locator, page);
    const box = await locator.boundingBox();
    if (box) {
        await page.evaluate(({ x, y, width, height }) => {
            const ring = document.createElement('div');
            ring.style.cssText = `
                position: fixed; z-index: 99999; pointer-events: none;
                left: ${x - 4}px; top: ${y - 4}px;
                width: ${width + 8}px; height: ${height + 8}px;
                border: 3px solid #ff4444; border-radius: 6px;
                box-shadow: 0 0 12px rgba(255,0,0,0.6);
                transition: opacity 0.8s;
            `;
            document.body.appendChild(ring);
            setTimeout(() => { ring.style.opacity = '0'; }, 1500);
            setTimeout(() => ring.remove(), 2500);
        }, box);
    }
    await PAUSE(800);
}

async function highlightAndClick(locator, page) {
    await highlight(locator, page);
    await locator.click();
}

// Type into CodeMirror editor, clearing first
async function typeInEditor(page, text) {
    const cm = page.locator('.CodeMirror');
    await cm.click();
    // Select all and delete
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await PAUSE(300);
    // Type slowly so it's visible in recording
    for (const char of text) {
        await page.keyboard.type(char, { delay: 40 });
    }
    await PAUSE(500);
}

// Wait for AI panel to show a complete response
async function waitForAIResponse(page) {
    // Wait for "Thinking..." to appear
    await page.waitForFunction(() => {
        const panel = document.getElementById('aiPanelContent');
        return panel && panel.textContent.includes('Thinking');
    }, { timeout: 5000 }).catch(() => {});

    // Wait for actual response (typing animation finishes)
    await page.waitForFunction(() => {
        const panel = document.getElementById('aiPanelContent');
        return panel && !panel.textContent.includes('Thinking') && panel.textContent.length > 20;
    }, { timeout: 60000 });

    // Let the typing animation finish fully
    await PAUSE(3000);
}

async function main() {
    console.log('=== Gemini AI Hints Demo — Question 3 ===\n');

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized', '--window-size=1920,1080']
    });
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);

    try {
        // --- Setup: Register and load question 3 ---

        console.log('1. Opening app...');
        await page.goto(BASE);
        await page.waitForLoadState('networkidle');
        await PAUSE(2000);

        console.log('2. Registering...');
        await highlightAndClick(page.locator('#loginPromptBtn, button:has-text("Login"), button:has-text("Sign")').first(), page);
        await PAUSE(1000);
        await highlightAndClick(page.locator('#authToggleBtn'), page);
        await PAUSE(500);
        await page.locator('#authEmail').fill(EMAIL);
        await PAUSE(300);
        await page.locator('#authPassword').fill(PASSWORD);
        await PAUSE(300);
        await highlightAndClick(page.locator('#authForm button[type="submit"]'), page);
        await PAUSE(3000);

        console.log('3. Waiting for DuckDB WASM to initialize...');
        await page.waitForSelector('.status.connected', { timeout: 150000 });
        await page.waitForFunction(() => {
            const dd = document.getElementById('questionDropdown');
            return dd && dd.options.length > 1;
        }, { timeout: 30000 });
        await PAUSE(1000);

        console.log('4. Selecting Question 3: "Find the average score of all students"');
        await highlightAndClick(page.locator('#questionDropdown'), page);
        await page.locator('#questionDropdown').selectOption({ index: 3 }); // Q3 is index 3
        await PAUSE(1500);

        console.log('5. Loading question...');
        await highlightAndClick(page.locator('#loadQuestionBtn'), page);

        // Wait for practice mode to fully load
        await page.locator('#submitPracticeBtn').waitFor({ state: 'attached', timeout: 120000 });
        await PAUSE(2000);

        // =============================================
        // DEMO 1: Get Hint (0 Gemini API calls so far)
        // =============================================
        console.log('\n--- Demo 1: Get Hint ---');
        console.log('6. Clicking "Get Hint" to ask Gemini for guidance...');

        const hintBtn = page.locator('#getHintBtn');
        await hintBtn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await PAUSE(1000);
        await highlightAndClick(hintBtn, page);

        await waitForAIResponse(page);

        // Scroll to show the AI response
        const aiPanel = page.locator('#aiResponsePanel');
        await aiPanel.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await PAUSE(4000); // Let viewer read the hint

        // Collapse AI panel and wait for Gemini rate limit to reset
        await page.locator('#aiPanelClose').click();
        console.log('   Waiting 60s for Gemini rate limit to reset...');
        await PAUSE(60000);

        // =============================================
        // DEMO 2: Syntax Error (1 Gemini API call used)
        // =============================================
        console.log('\n--- Demo 2: Explain Syntax Error ---');
        console.log('7. Typing a query with a syntax error...');

        // SELEC instead of SELECT — common typo
        await typeInEditor(page, 'SELEC AVG(score) FROM students;');
        await PAUSE(1500);

        // Submit directly — submitSolution() runs the query, catches the DuckDB error,
        // and calls showErrorFeedback() which creates the Explain button
        console.log('8. Submitting the broken query...');
        const submitBtn = page.locator('#submitPracticeBtn');
        await submitBtn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await highlightAndClick(submitBtn, page);

        // Wait for the error feedback panel with explain button to appear
        console.log('9. Waiting for error feedback...');
        const explainErrorBtn = page.locator('#explainErrorBtn');
        await explainErrorBtn.waitFor({ state: 'visible', timeout: 15000 });
        await PAUSE(1500);

        console.log('10. Clicking "Explain This Error" to ask Gemini...');
        await explainErrorBtn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await PAUSE(500);
        await highlightAndClick(explainErrorBtn, page);

        await waitForAIResponse(page);
        await aiPanel.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await PAUSE(4000); // Let viewer read the explanation

        // Collapse AI panel and wait for Gemini rate limit to reset
        await page.locator('#aiPanelClose').click();
        console.log('   Waiting 60s for Gemini rate limit to reset...');
        await PAUSE(60000);

        // =============================================
        // DEMO 3: Logical Error (2 Gemini API calls used)
        // =============================================
        console.log('\n--- Demo 3: Explain Logical Error ---');
        console.log('11. Typing a query that runs but gives wrong results...');

        // SUM instead of AVG — runs fine but wrong answer
        await typeInEditor(page, 'SELECT SUM(score) FROM students;');
        await PAUSE(1000);

        console.log('12. Running the query (will succeed but wrong results)...');
        await highlightAndClick(page.locator('button:has-text("Run")').first(), page);
        await PAUSE(2000);

        console.log('13. Submitting wrong answer...');
        await submitBtn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await highlightAndClick(submitBtn, page);
        await PAUSE(2000);

        console.log('14. Clicking "Explain What\'s Wrong" to ask Gemini...');
        const explainWrongBtn = page.locator('#explainErrorBtn');
        await explainWrongBtn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await PAUSE(500);
        await highlightAndClick(explainWrongBtn, page);

        await waitForAIResponse(page);
        await aiPanel.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await PAUSE(5000); // Let viewer read the explanation

        console.log('\n=== Demo complete! 3 Gemini API calls used ===');
        console.log('Press Ctrl+C to close the browser.\n');

        // Keep browser open for manual inspection / screen recording stop
        await PAUSE(300000); // 5 minutes

    } catch (error) {
        console.error('Demo failed:', error.message);
        await page.screenshot({ path: 'test-results/demo-gemini-error.png', fullPage: true });
    } finally {
        await browser.close();
    }
}

main();
