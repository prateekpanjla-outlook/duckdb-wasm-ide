import { test, expect } from '@playwright/test';

/**
 * E2E Tests for DuckDB WASM IDE
 * Tests basic workflow: upload CSV, run queries, verify results
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

    // TODO: REWRITE FOR NEW QUESTION SELECTOR UI
    // The dropZone (#dropZone) has been removed. New flow:
    // 1. User logs in
    // 2. Questions dropdown appears (#questionDropdown)
    // 3. User selects a question and clicks #loadQuestionBtn
    // 4. Query is pre-populated in editor
    // 5. User runs query
    test.skip('should upload CSV file', async ({ page }) => {
        await page.goto('/');

        // Wait for page to be ready and DuckDB initialized
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000);

        await page.screenshot({ path: 'test-results/screenshots/02-before-upload.png' });

        // Click on drop zone to trigger file input
        await page.click('#dropZone');

        // Upload the CSV file
        const fileInput = page.locator('#fileInput');
        await fileInput.setInputFiles('./sample-employees.csv');

        // Screenshot after file selection
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/screenshots/03-file-selected.png' });

        // Check file info is visible
        const fileInfo = page.locator('#fileInfo');
        await expect(fileInfo).toBeVisible();
    });

    // TODO: REWRITE FOR NEW QUESTION SELECTOR UI
    // The dropZone (#dropZone) has been removed. New flow:
    // 1. User logs in
    // 2. Questions dropdown appears (#questionDropdown)
    // 3. User selects a question and clicks #loadQuestionBtn
    // 4. Query is pre-populated in editor
    // 5. User runs query
    test.skip('should execute SHOW TABLES query', async ({ page }) => {
        await page.goto('/');

        // Wait for initialization
        await page.waitForTimeout(5000);

        // Upload CSV first
        await page.click('#dropZone');
        await page.locator('#fileInput').setInputFiles('./sample-employees.csv');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/screenshots/04-before-show-tables.png' });

        // Type query in CodeMirror editor
        await page.click('.CodeMirror');
        await page.keyboard.type('SHOW TABLES');
        await page.screenshot({ path: 'test-results/screenshots/05-show-tables-typed.png' });

        // Click run button
        const runButton = page.locator('#runQueryBtn');
        await runButton.click();
        await page.screenshot({ path: 'test-results/screenshots/06-show-tables-executed.png' });

        // Wait for results
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/07-show-tables-results.png' });

        // Check if results container is visible
        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toBeVisible();
    });

    // TODO: REWRITE FOR NEW QUESTION SELECTOR UI
    // The dropZone (#dropZone) has been removed. New flow:
    // 1. User logs in
    // 2. Questions dropdown appears (#questionDropdown)
    // 3. User selects a question and clicks #loadQuestionBtn
    // 4. Query is pre-populated in editor
    // 5. User runs query
    test.skip('should execute SELECT query with LIMIT', async ({ page }) => {
        await page.goto('/');

        // Wait for initialization
        await page.waitForTimeout(5000);

        // Upload CSV first
        await page.click('#dropZone');
        await page.locator('#fileInput').setInputFiles('./sample-employees.csv');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/screenshots/08-csv-loaded.png' });

        // Execute SELECT query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.type('SELECT * FROM sample_employees LIMIT 5');
        await page.screenshot({ path: 'test-results/screenshots/09-select-query-typed.png' });

        // Click run button
        const runButton = page.locator('#runQueryBtn');
        await runButton.click();
        await page.screenshot({ path: 'test-results/screenshots/10-select-query-executed.png' });

        // Wait for results
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/11-select-query-results.png' });
    });

    // TODO: REWRITE FOR NEW QUESTION SELECTOR UI
    // The dropZone (#dropZone) has been removed. New flow:
    // 1. User logs in
    // 2. Questions dropdown appears (#questionDropdown)
    // 3. User selects a question and clicks #loadQuestionBtn
    // 4. Query is pre-populated in editor
    // 5. User runs query
    test.skip('should execute DESCRIBE query', async ({ page }) => {
        await page.goto('/');

        // Wait for initialization
        await page.waitForTimeout(5000);

        // Upload CSV first
        await page.click('#dropZone');
        await page.locator('#fileInput').setInputFiles('./sample-employees.csv');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/screenshots/12-before-describe.png' });

        // Execute DESCRIBE query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.type('DESCRIBE sample_employees');
        await page.screenshot({ path: 'test-results/screenshots/13-describe-typed.png' });

        // Click run button
        const runButton = page.locator('#runQueryBtn');
        await runButton.click();
        await page.screenshot({ path: 'test-results/screenshots/14-describe-executed.png' });

        // Wait for results
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/15-describe-results.png' });
    });

    // TODO: REWRITE FOR NEW QUESTION SELECTOR UI
    // The dropZone (#dropZone) has been removed. New flow:
    // 1. User logs in
    // 2. Questions dropdown appears (#questionDropdown)
    // 3. User selects a question and clicks #loadQuestionBtn
    // 4. Query is pre-populated in editor
    // 5. User runs query
    test.skip('should execute COUNT query', async ({ page }) => {
        await page.goto('/');

        // Wait for initialization
        await page.waitForTimeout(5000);

        // Upload CSV first
        await page.click('#dropZone');
        await page.locator('#fileInput').setInputFiles('./sample-employees.csv');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/screenshots/16-before-count.png' });

        // Execute COUNT query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.type('SELECT COUNT(*) as total_employees FROM sample_employees');
        await page.screenshot({ path: 'test-results/screenshots/17-count-typed.png' });

        // Click run button
        const runButton = page.locator('#runQueryBtn');
        await runButton.click();
        await page.screenshot({ path: 'test-results/screenshots/18-count-executed.png' });

        // Wait for results
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/19-count-results.png' });
    });

    // TODO: REWRITE FOR NEW QUESTION SELECTOR UI
    // The dropZone (#dropZone) has been removed. New flow:
    // 1. User logs in
    // 2. Questions dropdown appears (#questionDropdown)
    // 3. User selects a question and clicks #loadQuestionBtn
    // 4. Query is pre-populated in editor
    // 5. User runs query
    test.skip('should export query results', async ({ page }) => {
        await page.goto('/');

        // Wait for initialization
        await page.waitForTimeout(5000);

        // Upload CSV
        await page.click('#dropZone');
        await page.locator('#fileInput').setInputFiles('./sample-employees.csv');
        await page.waitForTimeout(2000);

        // Execute query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.type('SELECT * FROM sample_employees LIMIT 5');

        const runButton = page.locator('#runQueryBtn');
        await runButton.click();
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'test-results/screenshots/20-before-export.png' });

        // Try to click export button
        const exportButton = page.locator('#exportResultsBtn');
        const exportExists = await exportButton.count();

        if (exportExists > 0) {
            await exportButton.click();
            await page.screenshot({ path: 'test-results/screenshots/21-after-export.png' });
        } else {
            console.log('Export button not found');
        }
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
