import { test, expect } from '@playwright/test';

/**
 * E2E Tests for DuckDB WASM IDE
 * Tests basic workflow: login, select question, run queries, verify results
 *
 * Run with: npm run test:e2e
 * Debug with: npm run test:e2e:debug
 * UI mode: npm run test:e2e:ui
 */

test.describe('DuckDB WASM IDE - Basic Workflow', () => {
    test('should load the application', async ({ page }) => {
        await page.goto('/');

        // Take screenshot of initial load
        await page.screenshot({ path: 'test-results/screenshots/01-initial-load.png' });

        // Wait for page title
        await expect(page.locator('text=DuckDB WebAssembly IDE')).toBeVisible();

        // Check for database status element
        const statusElement = page.locator('#dbStatus');
        await expect(statusElement).toBeVisible();

        // Wait for DuckDB to initialize (status changes)
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'test-results/screenshots/01b-after-init.png' });
    });

    /**
     * Helper function to mock user login
     * Sets localStorage items to simulate an authenticated user
     */
    async function mockLogin(page) {
        await page.goto('/');
        await page.waitForTimeout(3000);

        // Set mock authentication in localStorage
        await page.evaluate(() => {
            localStorage.setItem('auth_token', 'mock-token-12345');
            localStorage.setItem('user_data', JSON.stringify({
                id: 'test-user-123',
                email: 'test@example.com',
                name: 'Test User'
            }));
        });

        // Reload to trigger login detection
        await page.reload();
        await page.waitForTimeout(5000);

        // Wait for appContainer to be interactive
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 10000 });
    }

    test('should login and see question selector', async ({ page }) => {
        await mockLogin(page);

        await page.screenshot({ path: 'test-results/screenshots/02-after-login.png' });

        // Check that login prompt is hidden
        const loginPrompt = page.locator('#loginPromptSection');
        await expect(loginPrompt).toHaveClass(/hidden/);

        // Check that question selector is visible
        const questionSelector = page.locator('#questionSelectorSection');
        await expect(questionSelector).toBeVisible();

        // Check for question dropdown
        const dropdown = page.locator('#questionDropdown');
        await expect(dropdown).toBeVisible();
    });

    test('should load a question and run query', async ({ page }) => {
        await mockLogin(page);

        // Wait for questions to be loaded in dropdown
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/03-before-select-question.png' });

        // Select the first question (index 1, since 0 is the placeholder)
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        await page.screenshot({ path: 'test-results/screenshots/04-question-selected.png' });

        // Click Load Question button
        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();

        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/screenshots/05-question-loaded.png' });

        // Verify question info is displayed
        const questionInfo = page.locator('#selectedQuestionInfo');
        await expect(questionInfo).toBeVisible();

        // Verify query is in editor (check CodeMirror)
        await page.screenshot({ path: 'test-results/screenshots/06-query-in-editor.png' });

        // Run the query
        const runButton = page.locator('#runQueryBtn');
        await runButton.click();

        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/07-query-executed.png' });

        // Check if results container has content
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should execute SHOW TABLES query after loading question', async ({ page }) => {
        await mockLogin(page);

        // Load a question first
        await page.waitForTimeout(3000);
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/screenshots/08-before-show-tables.png' });

        // Clear editor and type SHOW TABLES
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('SHOW TABLES');
        await page.screenshot({ path: 'test-results/screenshots/09-show-tables-typed.png' });

        // Run query
        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/10-show-tables-results.png' });

        // Verify results
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();

        // Check for table in results
        const resultsText = await resultsContainer.textContent();
        expect(resultsText).toBeTruthy();
    });

    test('should execute SELECT query with LIMIT', async ({ page }) => {
        await mockLogin(page);

        // Load a question
        await page.waitForTimeout(3000);
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/screenshots/11-question-loaded.png' });

        // Execute SELECT query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('SELECT * FROM sample_employees LIMIT 5');
        await page.screenshot({ path: 'test-results/screenshots/12-select-typed.png' });

        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/13-select-results.png' });

        // Verify results
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should execute DESCRIBE query', async ({ page }) => {
        await mockLogin(page);

        // Load a question
        await page.waitForTimeout(3000);
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(2000);

        // Execute DESCRIBE query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('DESCRIBE sample_employees');
        await page.screenshot({ path: 'test-results/screenshots/14-describe-typed.png' });

        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/15-describe-results.png' });

        // Verify results
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should execute COUNT query', async ({ page }) => {
        await mockLogin(page);

        // Load a question
        await page.waitForTimeout(3000);
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(2000);

        // Execute COUNT query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('SELECT COUNT(*) as total_employees FROM sample_employees');
        await page.screenshot({ path: 'test-results/screenshots/16-count-typed.png' });

        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/17-count-results.png' });

        // Verify results
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should export query results', async ({ page }) => {
        await mockLogin(page);

        // Load a question and run query
        await page.waitForTimeout(3000);
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(2000);

        // Execute query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('SELECT * FROM sample_employees LIMIT 5');

        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'test-results/screenshots/18-before-export.png' });

        // Click export button
        const exportButton = page.locator('#exportResultsBtn');
        await expect(exportButton).toBeVisible();
        await exportButton.click();

        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/screenshots/19-after-export.png' });
    });
});

test.describe('DuckDB WASM IDE - Arrow Debugging', () => {
    test('should debug Arrow result structure', async ({ page }) => {
        // Navigate to debug page
        await page.goto('/debug-arrow.html');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: 'test-results/screenshots/debug-01-initial.png' });

        // Wait for DuckDB initialization
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'test-results/screenshots/debug-02-after-init.png' });

        // Click SHOW TABLES button
        await page.click('button:has-text("Test SHOW TABLES")');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/debug-03-show-tables.png' });

        // Capture console logs for Arrow structure
        page.on('console', msg => {
            if (msg.text().includes('Column') || msg.text().includes('Schema')) {
                console.log('Browser Console:', msg.text());
            }
        });
    });
});
