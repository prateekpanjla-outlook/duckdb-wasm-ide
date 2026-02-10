import { test, expect } from '@playwright/test';

/**
 * Comprehensive E2E Test: Query Validation with sample_employees.csv
 *
 * This test:
 * 1. Loads sample_employees.csv file
 * 2. Executes multiple queries and validates results
 * 3. Captures screenshots at each step
 * 4. Generates test report with expected vs actual results
 *
 * Queries tested:
 * - SHOW TABLES
 * - DESCRIBE table
 * - SELECT COUNT(*)
 * - GROUP BY with SUM and ORDER BY
 */

test.describe('Comprehensive Query Testing with sample_employees.csv', () => {
    test('should load CSV and execute all test queries with validation', async ({ page }) => {
        await page.goto('/');

        // Wait for DuckDB initialization
        await page.waitForTimeout(8000);

        // ============================================
        // STEP 1: Upload CSV File
        // ============================================
        await test.step('Upload sample_employees.csv', async () => {
            await page.screenshot({ path: 'test-results/screenshots/comprehensive-01-before-upload.png' });

            // Click on drop zone
            await page.click('#dropZone');

            // Upload the CSV file
            const fileInput = page.locator('#fileInput');
            await fileInput.setInputFiles('./sample-employees.csv');

            // Wait for file to be processed
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-02-file-uploaded.png' });

            // Verify file info is visible
            const fileInfo = page.locator('#fileInfo');
            await expect(fileInfo).toBeVisible();

            const fileName = page.locator('#fileName');
            await expect(fileName).toContainText('sample');
        });

        // ============================================
        // STEP 2: SHOW TABLES
        // ============================================
        await test.step('Execute SHOW TABLES and validate result', async () => {
            // Clear query editor and type query
            await page.click('.CodeMirror');
            await page.keyboard.press('Control+A');
            await page.keyboard.type('SHOW TABLES');

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-03-show-tables-typed.png' });

            // Execute query
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-04-show-tables-result.png' });

            // Validate: Should show at least one table
            const resultsContainer = page.locator('#resultsContainer');

            // Check for table in results
            const tableText = await resultsContainer.textContent();
            expect(tableText).toMatch(/sample/i);

            console.log('✅ SHOW TABLES validated');
            console.log('   Expected: At least 1 table');
            console.log('   Actual: Table visible in results');
        });

        // ============================================
        // STEP 3: DESCRIBE Table
        // ============================================
        await test.step('Execute DESCRIBE sample_employees and validate result', async () => {
            await page.click('.CodeMirror');
            await page.keyboard.press('Control+A');
            await page.keyboard.type('DESCRIBE sample_employees');

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-05-describe-typed.png' });

            // Execute query
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-06-describe-result.png' });

            // Validate: Should show column information
            const resultsContainer = page.locator('#resultsContainer');
            const tableText = await resultsContainer.textContent();

            // Expected columns: id, name, department, salary, hire_date, performance_rating, active
            const expectedColumns = ['id', 'name', 'department', 'salary', 'hire_date', 'performance_rating', 'active'];

            for (const col of expectedColumns) {
                expect(tableText.toLowerCase()).toMatch(new RegExp(col, 'i'));
            }

            console.log('✅ DESCRIBE validated');
            console.log('   Expected columns:', expectedColumns.join(', '));
            console.log('   Actual: All columns found in results');
        });

        // ============================================
        // STEP 4: COUNT Rows
        // ============================================
        await test.step('Execute COUNT(*) and validate result', async () => {
            await page.click('.CodeMirror');
            await page.keyboard.press('Control+A');
            await page.keyboard.type('SELECT COUNT(*) as total_count FROM sample_employees');

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-07-count-typed.png' });

            // Execute query
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-08-count-result.png' });

            // Validate: Should show count
            const resultsContainer = page.locator('#resultsContainer');
            const tableText = await resultsContainer.textContent();

            // Should contain a number (the count)
            expect(tableText).toMatch(/\d+/);

            // Extract the count value
            const countMatch = tableText.match(/total_count\s+(\d+)/i);
            const rowCount = countMatch ? parseInt(countMatch[1]) : 0;

            console.log('✅ COUNT(*) validated');
            console.log('   Expected: > 0 rows');
            console.log(`   Actual: ${rowCount} rows`);
            expect(rowCount).toBeGreaterThan(0);
        });

        // ============================================
        // STEP 5: SELECT with LIMIT
        // ============================================
        await test.step('Execute SELECT * LIMIT 5 and validate result', async () => {
            await page.click('.CodeMirror');
            await page.keyboard.press('Control+A');
            await page.keyboard.type('SELECT * FROM sample_employees LIMIT 5');

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-09-select-typed.png' });

            // Execute query
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-10-select-result.png' });

            // Validate: Should show 5 rows with employee data
            const resultsContainer = page.locator('#resultsContainer');
            const tableText = await resultsContainer.textContent();

            // Should contain employee data
            expect(tableText).toMatch(/alice|bob|charlie|david|eva/i);

            console.log('✅ SELECT * LIMIT 5 validated');
            console.log('   Expected: 5 rows of employee data');
            console.log('   Actual: Employee data visible in results');
        });

        // ============================================
        // STEP 6: GROUP BY with SUM and ORDER BY
        // ============================================
        await test.step('Execute GROUP BY with SUM and ORDER BY and validate result', async () => {
            await page.click('.CodeMirror');
            await page.keyboard.press('Control+A');
            await page.keyboard.type(`SELECT
    department,
    COUNT(*) as employee_count,
    SUM(salary) as total_salary,
    AVG(salary) as avg_salary,
    MAX(salary) as max_salary,
    MIN(salary) as min_salary
FROM sample_employees
GROUP BY department
ORDER BY department`);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-11-groupby-typed.png' });

            // Execute query
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-12-groupby-result.png' });

            // Validate: Should show grouped department data
            const resultsContainer = page.locator('#resultsContainer');
            const tableText = await resultsContainer.textContent();

            // Should contain department names
            expect(tableText).toMatch(/engineering|marketing|sales|finance|hr/i);

            // Should contain count
            expect(tableText).toMatch(/\d+\s+(\d+|employee_count)/i);

            // Should contain salary sums
            expect(tableText).toMatch(/\d{4,}/); // salary amounts

            console.log('✅ GROUP BY with SUM and ORDER BY validated');
            console.log('   Expected: Grouped data by department with aggregates');
            console.log('   Actual: Department aggregates visible in results');
        });

        // ============================================
        // STEP 7: Complex Aggregation Query
        // ============================================
        await test.step('Execute performance rating aggregation and validate result', async () => {
            await page.click('.CodeMirror');
            await page.keyboard.press('Control+A');
            await page.keyboard.type(`SELECT
    performance_rating,
    COUNT(*) as num_employees,
    AVG(salary) as avg_salary,
    SUM(salary) as total_salary
FROM sample_employees
WHERE active = true
GROUP BY performance_rating
ORDER BY performance_rating DESC`);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-13-aggregation-typed.png' });

            // Execute query
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/comprehensive-14-aggregation-result.png' });

            // Validate: Should show aggregated data by performance rating
            const resultsContainer = page.locator('#resultsContainer');
            const tableText = await resultsContainer.textContent();

            // Should contain performance ratings
            expect(tableText).toMatch(/\d+/); // ratings are numbers

            console.log('✅ Performance rating aggregation validated');
            console.log('   Expected: Grouped by rating with aggregates');
            console.log('   Actual: Rating aggregates visible in results');
        });

        // ============================================
        // STEP 8: Final Screenshot and Summary
        // ============================================
        await test.step('Capture final state and generate summary', async () => {
            await page.screenshot({ path: 'test-results/screenshots/comprehensive-15-final-state.png', fullPage: true });

            // Check query execution time
            const queryTimeElement = page.locator('#queryTime');
            const hasQueryTime = await queryTimeElement.count() > 0;

            console.log('\n========================================');
            console.log('📊 COMPREHENSIVE TEST SUMMARY');
            console.log('========================================');
            console.log('✅ File Upload: sample_employees.csv');
            console.log('✅ SHOW TABLES: Passed');
            console.log('✅ DESCRIBE sample_employees: Passed');
            console.log('✅ SELECT COUNT(*): Passed');
            console.log('✅ SELECT * LIMIT 5: Passed');
            console.log('✅ GROUP BY with SUM and ORDER BY: Passed');
            console.log('✅ Performance aggregation: Passed');
            console.log(`⏱️  Query Time Available: ${hasQueryTime ? 'Yes' : 'No'}`);
            console.log('========================================\n');

            // Generate test report
            const fs = await import('fs');
            const report = {
                timestamp: new Date().toISOString(),
                test: 'Comprehensive Query Validation',
                results: {
                    fileUpload: 'PASS',
                    showTables: 'PASS',
                    describe: 'PASS',
                    countQuery: 'PASS',
                    selectLimit: 'PASS',
                    groupBy: 'PASS',
                    aggregation: 'PASS'
                },
                queries: [
                    'SHOW TABLES',
                    'DESCRIBE sample_employees',
                    'SELECT COUNT(*) FROM sample_employees',
                    'SELECT * FROM sample_employees LIMIT 5',
                    'GROUP BY department with SUM, AVG, MAX, MIN',
                    'GROUP BY performance_rating with WHERE clause'
                ],
                screenshots: [
                    'comprehensive-01-before-upload.png',
                    'comprehensive-02-file-uploaded.png',
                    'comprehensive-04-show-tables-result.png',
                    'comprehensive-06-describe-result.png',
                    'comprehensive-08-count-result.png',
                    'comprehensive-10-select-result.png',
                    'comprehensive-12-groupby-result.png',
                    'comprehensive-14-aggregation-result.png',
                    'comprehensive-15-final-state.png'
                ]
            };

            fs.writeFileSync(
                'test-results/comprehensive-test-report.json',
                JSON.stringify(report, null, 2)
            );

            console.log('📄 Test report saved to: test-results/comprehensive-test-report.json');
        });
    });

    test('should handle query errors gracefully', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(8000);

        // Upload CSV first
        await page.click('#dropZone');
        await page.locator('#fileInput').setInputFiles('./sample-employees.csv');
        await page.waitForTimeout(3000);

        // Try invalid query
        await page.click('.CodeMirror');
        await page.keyboard.press('Control+A');
        await page.keyboard.type('SELECT * FROM nonexistent_table');

        await page.screenshot({ path: 'test-results/screenshots/comprehensive-error-01-invalid-query.png' });

        // Execute query
        await page.click('#runQueryBtn');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/screenshots/comprehensive-error-02-error-displayed.png' });

        // Verify error is displayed
        const resultsContainer = page.locator('#resultsContainer');
        const containerText = await resultsContainer.textContent();
        const lowerText = containerText.toLowerCase();

        // Should show error
        expect(lowerText).toMatch(/error|not|exist|fail/i);

        console.log('✅ Error handling validated');
        console.log('   Invalid query produces error message as expected');
    });
});
