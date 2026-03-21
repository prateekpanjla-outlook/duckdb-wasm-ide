import { test, expect } from '@playwright/test';

// TODO: Replace performMockedLogin with real backend login when E2E tests are set up

/**
 * E2E Tests for DuckDB WASM IDE
 * Tests basic workflow: login, select question, run queries, verify results
 *
 * Run with: npm run test:e2e
 * Debug with: npm run test:e2e:debug
 * UI mode: npm run test:e2e:ui
 */

test.describe('DuckDB WASM IDE - Basic Workflow', () => {
    test.describe.configure({ timeout: 120000 });

    test('should load the application', async ({ page }) => {
        await page.goto('/');

        // Take screenshot of initial load
        await page.screenshot({ path: 'test-results/screenshots/01-initial-load.png' });

        // Wait for page title
        await expect(page.locator('text=DuckDB WebAssembly IDE')).toBeVisible();

        // Check for database status element
        const statusElement = page.locator('#dbStatus');
        await expect(statusElement).toBeVisible();

        // Wait for app to initialize
        await page.waitForFunction(() => !!window.app, { timeout: 15000 });
        await page.screenshot({ path: 'test-results/screenshots/01b-after-init.png' });
    });

    test('should login and see question selector', async ({ page }) => {
        await performMockedLogin(page);

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
        await performMockedLogin(page);

        await page.screenshot({ path: 'test-results/screenshots/03-before-select-question.png' });

        // Select the first question (index 1, since 0 is the placeholder)
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        await page.screenshot({ path: 'test-results/screenshots/04-question-selected.png' });

        // Click Load Question button
        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();

        // Wait for practice mode to initialize (DuckDB data loading)
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/05-question-loaded.png' });

        // Verify question info is displayed
        const questionInfo = page.locator('#selectedQuestionInfo');
        await expect(questionInfo).toBeVisible();

        // Type the query using CodeMirror API
        // Table is "sample_employees" as defined in mock question sql_data
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue("SELECT * FROM sample_employees WHERE department = 'Engineering'");
            }
        });
        await page.screenshot({ path: 'test-results/screenshots/06-query-typed.png' });

        // Run the query
        const runButton = page.locator('#runQueryBtn');
        await runButton.click();

        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'test-results/screenshots/07-query-executed.png' });

        // Check if results container has content
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should execute SHOW TABLES query after loading question', async ({ page }) => {
        await performMockedLogin(page);

        // Load a question first
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'test-results/screenshots/08-before-show-tables.png' });

        // Clear editor and type SHOW TABLES using CodeMirror API
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue('SHOW TABLES');
            }
        });
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
        await performMockedLogin(page);

        // Load a question
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'test-results/screenshots/11-question-loaded.png' });

        // Execute SELECT query — table is "sample_employees" from mock data
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue('SELECT * FROM sample_employees LIMIT 5');
            }
        });
        await page.screenshot({ path: 'test-results/screenshots/12-select-typed.png' });

        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/13-select-results.png' });

        // Verify results
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should execute DESCRIBE query', async ({ page }) => {
        await performMockedLogin(page);

        // Load a question
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(3000);

        // Execute DESCRIBE query — table is "sample_employees" from mock data
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue('DESCRIBE sample_employees');
            }
        });
        await page.screenshot({ path: 'test-results/screenshots/14-describe-typed.png' });

        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/15-describe-results.png' });

        // Verify results
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should execute COUNT query', async ({ page }) => {
        await performMockedLogin(page);

        // Load a question
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(3000);

        // Execute COUNT query — table is "sample_employees" from mock data
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue('SELECT COUNT(*) as total_employees FROM sample_employees');
            }
        });
        await page.screenshot({ path: 'test-results/screenshots/16-count-typed.png' });

        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/17-count-results.png' });

        // Verify results
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    test('should export query results', async ({ page }) => {
        await performMockedLogin(page);

        // Load a question and run query
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();
        await page.waitForTimeout(3000);

        // Execute query — table is "sample_employees" from mock data
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue('SELECT * FROM sample_employees LIMIT 5');
            }
        });

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
        // Capture console logs for Arrow structure (register BEFORE actions)
        page.on('console', msg => {
            if (msg.text().includes('Column') || msg.text().includes('Schema')) {
                console.log('Browser Console:', msg.text());
            }
        });

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
    });
});
