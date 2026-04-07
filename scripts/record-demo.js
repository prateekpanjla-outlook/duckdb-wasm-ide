/**
 * Record a demo video of the app using Playwright.
 * Run inside the Vagrant VM:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/record-demo.js
 *
 * Output: demo-recording/demo.webm
 */
import { chromium } from 'playwright';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://duckdb-ide-frxi6yk4jq-uc.a.run.app';
const EMAIL = `demo${Math.random().toString(36).slice(2, 6)}@test.com`;
const PASSWORD = 'demo1234';

// Slow down actions so the video is readable
const PAUSE = (ms) => new Promise(r => setTimeout(r, ms));

// Highlight an element briefly before clicking it
async function highlightAndClick(locator, page) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (box) {
        await page.evaluate(({ x, y, width, height }) => {
            const ring = document.createElement('div');
            ring.style.cssText = `
                position: fixed; z-index: 99999; pointer-events: none;
                left: ${x - 4}px; top: ${y - 4}px;
                width: ${width + 8}px; height: ${height + 8}px;
                border: 3px solid red; border-radius: 6px;
                box-shadow: 0 0 12px rgba(255,0,0,0.6);
                transition: opacity 0.5s;
            `;
            document.body.appendChild(ring);
            setTimeout(() => { ring.style.opacity = '0'; }, 1200);
            setTimeout(() => ring.remove(), 1800);
        }, box);
    }
    await PAUSE(800);
    await locator.click();
}

async function main() {
    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized', '--window-size=1920,1080']
    });
    const context = await browser.newContext({
        viewport: null
    });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);

    try {
        // 1. Navigate to app
        console.log('1. Opening app...');
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await PAUSE(2000);

        // 2. Click login button to open modal
        console.log('2. Opening login modal...');
        await highlightAndClick(page.locator('#loginPromptBtn, #authButton, button:has-text("Login"), button:has-text("Sign")').first(), page);
        await PAUSE(1500);

        // 3. Click "Register" toggle to switch from login to register mode
        console.log('3. Switching to register...');
        await highlightAndClick(page.locator('#authToggleBtn'), page);
        await PAUSE(1000);

        // 4. Fill registration form and submit
        console.log('4. Registering new user...');
        await page.locator('#authEmail').fill(EMAIL);
        await PAUSE(500);
        await page.locator('#authPassword').fill(PASSWORD);
        await PAUSE(500);
        await highlightAndClick(page.locator('#authForm button[type="submit"]'), page);
        await PAUSE(3000);

        // 5. Wait for question selector to become visible (DuckDB init can take 60-90s)
        console.log('5. Waiting for question selector (DuckDB WASM init may take up to 90s)...');
        await page.waitForFunction(() => {
            const el = document.getElementById('questionSelectorSection');
            return el && !el.classList.contains('hidden');
        }, { timeout: 120000 });
        await PAUSE(2000);

        // 6. Select a question from dropdown
        console.log('6. Selecting a question...');
        const dropdown = page.locator('#questionDropdown, select').first();
        await dropdown.selectOption({ index: 1 });
        await PAUSE(2000);

        // 7. Click Load Question
        console.log('7. Loading question...');
        const loadBtn = page.locator('button:has-text("Load"), #loadQuestionBtn').first();
        if (await loadBtn.isVisible()) {
            await highlightAndClick(loadBtn, page);
            await PAUSE(3000);
        }

        // 8. Wait for DuckDB to be ready and editor to appear
        console.log('8. Waiting for editor...');
        await page.waitForSelector('.CodeMirror', { timeout: 120000 });
        await PAUSE(2000);

        // 9. Type a SQL query in CodeMirror
        console.log('9. Writing SQL query...');
        const cm = page.locator('.CodeMirror');
        await cm.click();
        await PAUSE(500);

        // Type slowly for the video
        const query = 'SELECT * FROM employees WHERE department = \'Engineering\';';
        for (const char of query) {
            await page.keyboard.type(char, { delay: 80 });
        }
        await PAUSE(1500);

        // 10. Click Run
        console.log('10. Running query...');
        const runBtn = page.locator('button:has-text("Run"), #runButton').first();
        await highlightAndClick(runBtn, page);
        await PAUSE(2000);

        // 11. Scroll down to show query results table
        console.log('11. Scrolling to results...');
        await page.evaluate(() => {
            const results = document.getElementById('resultsPanel') || document.getElementById('results');
            if (results) results.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
        await PAUSE(3000);

        // 12. Scroll back to top before submit
        console.log('12. Scrolling to top...');
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await PAUSE(2000);

        // 13. Click Submit
        console.log('13. Submitting solution...');
        const submitBtn = page.locator('button:has-text("Submit"), #submitCodeBtn').first();
        if (await submitBtn.isVisible()) {
            await highlightAndClick(submitBtn, page);
            await PAUSE(5000);
        }

        // 14. Scroll to feedback panel and hold
        console.log('14. Showing feedback...');
        await page.evaluate(() => {
            const feedback = document.getElementById('practiceFeedbackPanel');
            if (feedback) feedback.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        await PAUSE(6000);

        // 15. Scroll to Next Question button if visible
        console.log('15. Checking for Next Question...');
        const nextBtn = page.locator('button:has-text("Next Question")').first();
        if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await page.evaluate(() => {
                const btn = document.querySelector('button:has-text("Next Question")') ||
                    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Next'));
                if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            await PAUSE(2000);
            await highlightAndClick(nextBtn, page);
            await PAUSE(3000);
        }

        // 16. Final scroll — show full page from top to bottom slowly
        console.log('16. Final overview...');
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await PAUSE(2000);
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
        await PAUSE(3000);

        console.log('Done! Closing browser...');

    } catch (err) {
        console.error('Error during recording:', err.message);
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }

    console.log('\nDone. Use OBS or Win+Alt+R to capture the recording.');
}

main();
