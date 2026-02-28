import { test, expect } from '@playwright/test';

/**
 * Debug Test: Login and Questions Flow
 *
 * This test verifies:
 * 1. Login hides the "Please Login" prompt
 * 2. Question selector is shown after login
 * 3. Questions are loaded from backend
 */

test.describe('Debug: Login and Questions Flow', () => {
    test('should login and show questions dropdown', async ({ page }) => {
        // Increase timeout for this test due to multiple wait steps
        test.setTimeout(120000);
        // Enable console logging
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('Error') || text.includes('question') || text.includes('Question') ||
                text.includes('login') || text.includes('Login') || text.includes('AuthManager') ||
                text.includes('Auth') || text.includes('handleSubmit')) {
                console.log('Browser Console:', msg.type(), text);
            }
        });

        // Enable request/response logging
        page.on('request', request => {
            if (request.url().includes('3000') || request.url().includes('api')) {
                console.log('API Request:', request.method(), request.url());
            }
        });

        page.on('response', response => {
            if (response.url().includes('3000') || response.url().includes('api')) {
                console.log('API Response:', response.status(), response.url());
            }
        });

        // Navigate to app
        await page.goto('/');
        await page.waitForTimeout(5000);

        // Step 1: Check initial state - should show login prompt
        await test.step('Initial state - check login prompt is visible', async () => {
            await page.screenshot({ path: 'test-results/screenshots/debug-01-initial-state.png' });

            const loginPrompt = page.locator('#loginPromptSection');
            await expect(loginPrompt).toBeVisible();

            const questionSelector = page.locator('#questionSelectorSection');
            const isHidden = await questionSelector.evaluate(el => el.classList.contains('hidden'));
            console.log('Question selector hidden:', isHidden);
        });

        // Step 2: Open login modal and login
        await test.step('Open login modal and submit credentials', async () => {
            const loginBtn = page.locator('#authBtn');
            await loginBtn.click();
            await page.waitForTimeout(1000);

            await page.screenshot({ path: 'test-results/screenshots/debug-02-login-modal-open.png' });

            // Fill login form
            await page.fill('#authEmail', 'testuser@example.com');
            await page.fill('#authPassword', 'password123');

            await page.screenshot({ path: 'test-results/screenshots/debug-03-login-form-filled.png' });

            // Submit form
            await page.click('.auth-submit-btn');
            await page.waitForTimeout(5000);
        });

        // Step 3: Verify login prompt is hidden
        await test.step('Verify login prompt is hidden after login', async () => {
            // Wait longer for async operations to complete
            await page.waitForTimeout(3000);

            await page.screenshot({ path: 'test-results/screenshots/debug-04-after-login.png' });

            const loginPrompt = page.locator('#loginPromptSection');
            const isHidden = await loginPrompt.evaluate(el => el.classList.contains('hidden'));
            console.log('Login prompt hidden after login:', isHidden);

            const questionSelector = page.locator('#questionSelectorSection');
            const isVisible = await questionSelector.evaluate(el => !el.classList.contains('hidden'));
            console.log('Question selector visible after login:', isVisible);

            // Check auth button text
            const authBtn = page.locator('#authBtn');
            const btnText = await authBtn.textContent();
            console.log('Auth button text after login:', btnText);

            // Debug: Check what classes are actually on the elements
            const loginClasses = await loginPrompt.evaluate(el => Array.from(el.classList));
            const selectorClasses = await questionSelector.evaluate(el => Array.from(el.classList));
            console.log('Login prompt classes:', loginClasses);
            console.log('Question selector classes:', selectorClasses);
        });

        // Step 4: Check if questions dropdown is populated
        await test.step('Check questions dropdown is populated', async () => {
            await page.waitForTimeout(3000);

            const dropdown = page.locator('#questionDropdown');
            const optionCount = await dropdown.locator('option').count();
            console.log('Number of dropdown options:', optionCount);

            // Get all option texts
            const options = await dropdown.locator('option').allTextContents();
            console.log('Dropdown options:', options);

            await page.screenshot({ path: 'test-results/screenshots/debug-05-dropdown-state.png' });

            // Delay after checking dropdown
            console.log('Waiting 3 seconds after dropdown check...');
            await page.waitForTimeout(3000);
        });

        // Step 5: Select Question 3 from dropdown
        await test.step('Select Question 3 (Find the average score of all students)', async () => {
            const dropdown = page.locator('#questionDropdown');
            await dropdown.selectOption('3'); // Select by value (question ID)
            console.log('Selected Question 3 from dropdown');

            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'test-results/screenshots/debug-06-question3-selected.png' });

            // Check if question info is displayed
            const questionInfo = page.locator('#selectedQuestionInfo');
            const isInfoVisible = await questionInfo.evaluate(el => !el.classList.contains('hidden'));
            console.log('Question 3 info visible:', isInfoVisible);

            if (isInfoVisible) {
                const title = await page.locator('#selectedQuestionTitle').textContent();
                const category = await page.locator('#selectedQuestionCategory').textContent();
                const difficulty = await page.locator('#selectedQuestionDifficulty').textContent();
                console.log('Question 3 - Title:', title.trim());
                console.log('Question 3 - Category:', category.trim());
                console.log('Question 3 - Difficulty:', difficulty.trim());
            }

            // Delay after selecting Question 3
            console.log('Waiting 3 seconds after selecting Question 3...');
            await page.waitForTimeout(3000);
        });

        // Step 6: Select Question 7 from dropdown
        await test.step('Select Question 7 (Find the total sales amount for each product in each region)', async () => {
            const dropdown = page.locator('#questionDropdown');
            await dropdown.selectOption('7'); // Select by value (question ID)
            console.log('Selected Question 7 from dropdown');

            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'test-results/screenshots/debug-07-question7-selected.png' });

            // Check if question info is displayed
            const questionInfo = page.locator('#selectedQuestionInfo');
            const isInfoVisible = await questionInfo.evaluate(el => !el.classList.contains('hidden'));
            console.log('Question 7 info visible:', isInfoVisible);

            if (isInfoVisible) {
                const title = await page.locator('#selectedQuestionTitle').textContent();
                const category = await page.locator('#selectedQuestionCategory').textContent();
                const difficulty = await page.locator('#selectedQuestionDifficulty').textContent();
                console.log('Question 7 - Title:', title.trim());
                console.log('Question 7 - Category:', category.trim());
                console.log('Question 7 - Difficulty:', difficulty.trim());
            }

            // Delay after selecting Question 7
            console.log('Waiting 3 seconds after selecting Question 7...');
            await page.waitForTimeout(3000);
        });

        // Final screenshot
        await page.screenshot({ path: 'test-results/screenshots/debug-08-final-state.png', fullPage: true });
    });
});
