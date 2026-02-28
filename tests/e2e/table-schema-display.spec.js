import { test, expect } from '@playwright/test';

/**
 * E2E Test: Table Schema Display
 *
 * This test verifies that when loading a question:
 * 1. The table schema is extracted from sql_data
 * 2. The schema is displayed in a user-friendly format
 * 3. Table name and columns are shown correctly
 */

const BASE_URL = 'http://localhost:8888';
const TEST_USER = {
    email: 'testuser@example.com',
    password: 'password123'
};

test.describe('Table Schema Display', () => {
    test.describe.configure({ timeout: 120000 });

    test('should display table schema when loading a question', async ({ page }) => {
        await test.step('Step 1: Navigate and login', async () => {
            console.log('\n📄 Step 1: Navigating to application...');
            await page.goto(BASE_URL);
            await page.waitForTimeout(5000);

            // Wait for app to be interactive
            await page.waitForFunction(() => {
                const container = document.getElementById('appContainer');
                return container && container.style.pointerEvents === 'auto';
            }, { timeout: 15000 });

            // Click login button
            await page.click('#authBtn');
            await page.waitForTimeout(1000);

            // Fill login form
            await page.fill('#authEmail', TEST_USER.email);
            await page.fill('#authPassword', TEST_USER.password);

            // Submit
            await page.click('.auth-submit-btn');
            await page.waitForTimeout(8000);

            // Verify login success
            const authBtnText = await page.textContent('#authBtn');
            expect(authBtnText).toContain(TEST_USER.email);

            console.log('✅ Login successful');
        });

        await test.step('Step 2: Select a question from dropdown', async () => {
            console.log('\n📝 Step 2: Selecting question...');

            // Wait for questions to load
            await page.waitForTimeout(3000);

            // Select first question
            const dropdown = page.locator('#questionDropdown');
            await dropdown.selectOption({ index: 1 });

            const selectedText = await dropdown.inputValue();
            console.log(`   Selected: ${selectedText}`);

            // Wait for the question info section to appear with schema
            await page.waitForFunction(() => {
                const schemaContainer = document.querySelector('#selectedQuestionInfo .table-schema-container');
                return schemaContainer !== null;
            }, { timeout: 5000 });

            await page.screenshot({ path: 'test-results/screenshots/schema-01-question-selected.png' });
            console.log('✅ Question selected');
        });

        await test.step('Step 3: Verify table schema is displayed in question selector', async () => {
            console.log('\n📋 Step 3: Verifying table schema in question selector...');

            // Check for table schema container in question selector section
            const schemaContainer = page.locator('#selectedQuestionInfo .table-schema-container');
            await expect(schemaContainer).toBeVisible();

            // Check for schema heading
            const schemaHeading = page.locator('#selectedQuestionInfo .table-schema-container h5');
            await expect(schemaHeading).toContainText('Table Schema');

            // Get the full schema text
            const schemaText = await page.locator('#selectedQuestionInfo .table-schema-container').textContent();
            console.log('   Schema text:', schemaText);

            // Verify table name is shown
            expect(schemaText).toMatch(/employees/i);

            // Verify columns are shown
            expect(schemaText).toMatch(/id/i);
            expect(schemaText).toMatch(/name/i);
            expect(schemaText).toMatch(/department/i);
            expect(schemaText).toMatch(/salary/i);
            expect(schemaText).toMatch(/hire_date/i);

            await page.screenshot({ path: 'test-results/screenshots/schema-02-schema-displayed.png' });

            console.log('✅ Table schema displayed correctly in question selector');
        });

        await test.step('Step 4: Click Load Question button', async () => {
            console.log('\n📊 Step 4: Loading question...');

            await page.click('#loadQuestionBtn');
            await page.waitForTimeout(5000);

            await page.screenshot({ path: 'test-results/screenshots/schema-03-question-loaded.png' });

            // Verify practice mode panel is visible
            const questionPanel = page.locator('#practiceQuestionPanel');
            await expect(questionPanel).toBeVisible();

            console.log('✅ Question loaded');
        });

        await test.step('Step 5: Verify schema styling', async () => {
            console.log('\n🎨 Step 5: Verifying schema styling...');

            const schemaContainer = page.locator('#selectedQuestionInfo .table-schema-container');

            // Check if container has proper styling (border-left color)
            const style = await schemaContainer.evaluate(el => {
                const computed = window.getComputedStyle(el);
                return {
                    borderLeftWidth: computed.borderLeftWidth,
                    borderLeftColor: computed.borderLeftColor,
                    backgroundColor: computed.backgroundColor
                };
            });

            console.log('   Schema container style:', style);
            expect(style.borderLeftWidth).not.toBe('0px');

            await page.screenshot({ path: 'test-results/screenshots/schema-04-final-state.png', fullPage: true });

            console.log('✅ Schema styling verified');
        });

        // Generate test report
        console.log('\n========================================');
        console.log('📊 TABLE SCHEMA DISPLAY TEST SUMMARY');
        console.log('========================================');
        console.log('✅ Login: PASS');
        console.log('✅ Question Selection: PASS');
        console.log('✅ Question Loading: PASS');
        console.log('✅ Schema Display: PASS');
        console.log('✅ Schema Styling: PASS');
        console.log('========================================\n');
    });

    test('should display schema for multiple tables if present', async ({ page }) => {
        // This test checks if multiple tables would be displayed correctly
        // (when a question has data for multiple tables)

        await test.step('Load question with single table schema', async () => {
            await page.goto(BASE_URL);
            await page.waitForTimeout(5000);

            // Login
            await page.waitForFunction(() => {
                const container = document.getElementById('appContainer');
                return container && container.style.pointerEvents === 'auto';
            }, { timeout: 15000 });

            await page.click('#authBtn');
            await page.waitForTimeout(1000);
            await page.fill('#authEmail', TEST_USER.email);
            await page.fill('#authPassword', TEST_USER.password);
            await page.click('.auth-submit-btn');
            await page.waitForTimeout(8000);

            // Select a question (schema should show immediately)
            await page.waitForTimeout(3000);
            await page.selectOption('#questionDropdown', { index: 1 });
            await page.waitForTimeout(2000);

            // Count how many tables are shown in schema
            const tableNames = await page.locator('#selectedQuestionInfo .table-schema-container span[style*="color: #61dafb"]').allTextContents();
            console.log(`   Tables in schema: ${tableNames.join(', ')}`);

            expect(tableNames.length).toBeGreaterThan(0);

            console.log(`✅ Schema displays ${tableNames.length} table(s)`);
        });
    });
});
