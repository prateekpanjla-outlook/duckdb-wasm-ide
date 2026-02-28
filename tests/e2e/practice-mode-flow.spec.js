import { test, expect } from '@playwright/test';

/**
 * End-to-End Test: Practice Mode Complete Flow
 *
 * This test:
 * 1. Registers/logs in a user
 * 2. Starts practice mode
 * 3. Loads question 1
 * 4. Runs incorrect query
 * 5. Submits incorrect query (should fail)
 * 6. Runs correct query
 * 7. Submits correct query (should pass)
 * 8. Validates next question button appears
 *
 * Screenshots captured at each step
 */

const BASE_URL = 'http://localhost:8888';
const API_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = 'test-results/screenshots/practice-mode/';

// Test user credentials
const TEST_USER = {
    email: `testuser${Date.now()}@example.com`,
    password: 'testpass123'
};

// Question 1 expected data
const QUESTION_1 = {
    question: 'Select all employees from the Engineering department',
    incorrect_query: 'SELECT * FROM employees WHERE department = \'Sales\'',
    correct_query: 'SELECT * FROM employees WHERE department = \'Engineering\''
};

test.describe('Practice Mode E2E - Question 1', () => {
        test.describe.configure({ timeout: 300000 }); // 5 minutes timeout
    let apiToken;

    test.beforeAll(async () => {
        // Setup: Ensure backend is running and create test user via API
        console.log('🔧 Setup: Creating test user...');

        try {
            const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: TEST_USER.email,
                    password: TEST_USER.password
                })
            });

            if (registerResponse.ok) {
                const data = await registerResponse.json();
                apiToken = data.token;
                console.log('✅ Test user created:', TEST_USER.email);
            } else {
                // User might already exist, try login
                const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: TEST_USER.email,
                        password: TEST_USER.password
                    })
                });

                if (loginResponse.ok) {
                    const data = await loginResponse.json();
                    apiToken = data.token;
                    console.log('✅ Test user logged in:', TEST_USER.email);
                }
            }
        } catch (error) {
            console.error('❌ Failed to setup test user:', error.message);
        }
    });

    test('should complete practice mode flow for question 1', async ({ page }) => {
        await test.step('Step 1: Navigate to application and wait for initialization', async () => {
            console.log('\n📄 Step 1: Loading application...');
            await page.goto(BASE_URL);
            await page.screenshot({ path: `${SCREENSHOT_DIR}01-page-loaded.png` });

            // Wait for DuckDB to initialize
            await page.waitForTimeout(10000);
            console.log('✅ Application loaded');
        });

        await test.step('Step 2: Login with test user', async () => {
            console.log('\n🔐 Step 2: Logging in...');

            // Click login button
            await page.click('#authBtn');
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${SCREENSHOT_DIR}02-login-modal-open.png` });

            // Fill login form
            await page.fill('#authEmail', TEST_USER.email);
            await page.fill('#authPassword', TEST_USER.password);
            await page.screenshot({ path: `${SCREENSHOT_DIR}03-login-form-filled.png` });

            // Submit form
            await page.click('.auth-submit-btn');
            await page.waitForTimeout(2000);
            await page.screenshot({ path: `${SCREENSHOT_DIR}04-after-login.png` });

            // Verify login success - button should show email
            const authBtnText = await page.textContent('#authBtn');
            expect(authBtnText).toContain(TEST_USER.email);

            console.log('✅ Login successful');
        });

        await test.step('Step 3: Load question from dropdown', async () => {
            console.log('\n🎯 Step 3: Loading question from dropdown...');

            // Select first question from dropdown
            await page.selectOption('#questionDropdown', { index: 1 });
            await page.screenshot({ path: `${SCREENSHOT_DIR}05-question-selected.png` });

            // Click "Load Question" button
            await page.click('#loadQuestionBtn');
            await page.waitForTimeout(3000);
            await page.screenshot({ path: `${SCREENSHOT_DIR}06-question-loaded.png` });

            // Verify practice mode UI is visible
            const questionPanel = page.locator('#practiceQuestionPanel');
            await expect(questionPanel).toBeVisible();

            console.log('✅ Question loaded');
        });

        await test.step('Step 4: Verify question 1 is loaded', async () => {
            console.log('\n📝 Step 4: Verifying question 1...');

            await page.screenshot({ path: `${SCREENSHOT_DIR}07-question-1-loaded.png` });

            // Get question text
            const questionText = await page.textContent('#practiceQuestionText');
            console.log('   Question:', questionText);

            expect(questionText).toContain(QUESTION_1.question);

            // Verify difficulty badge
            const difficulty = await page.textContent('#practiceDifficulty');
            console.log('   Difficulty:', difficulty);

            console.log('✅ Question 1 loaded correctly');
        });

        await test.step('Step 5: Run INCORRECT query', async () => {
            console.log('\n❌ Step 5: Running incorrect query...');

            // Type incorrect query using CodeMirror API
            await page.evaluate((query) => {
                const editor = document.querySelector('.CodeMirror');
                if (editor && editor.CodeMirror) {
                    editor.CodeMirror.setValue(query);
                }
            }, QUESTION_1.incorrect_query);

            await page.screenshot({ path: `${SCREENSHOT_DIR}08-incorrect-query-typed.png` });

            // Click Run button
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);
            await page.screenshot({ path: `${SCREENSHOT_DIR}09-incorrect-query-results.png` });

            console.log('✅ Incorrect query executed (showing Sales employees)');
        });

        await test.step('Step 6: Submit INCORRECT query', async () => {
            console.log('\n📤 Step 6: Submitting incorrect query...');

            await page.screenshot({ path: `${SCREENSHOT_DIR}10-before-incorrect-submit.png` });

            // Click Submit button
            await page.click('#submitPracticeBtn');
            await page.waitForTimeout(2000);
            await page.screenshot({ path: `${SCREENSHOT_DIR}11-after-incorrect-submit.png` });

            // Verify incorrect feedback
            const feedbackPanel = page.locator('#practiceFeedbackPanel');
            await expect(feedbackPanel).toBeVisible();

            const feedbackMessage = await page.textContent('#feedbackMessage');
            console.log('   Feedback:', feedbackMessage);

            expect(feedbackMessage).toContain('Not quite right');

            console.log('✅ Incorrect submission rejected as expected');
        });

        await test.step('Step 7: Clear and type CORRECT query', async () => {
            console.log('\n✅ Step 7: Running correct query...');

            // Type correct query using CodeMirror API
            await page.evaluate((query) => {
                const editor = document.querySelector('.CodeMirror');
                if (editor && editor.CodeMirror) {
                    editor.CodeMirror.setValue(query);
                }
            }, QUESTION_1.correct_query);

            await page.screenshot({ path: `${SCREENSHOT_DIR}12-correct-query-typed.png` });

            // Click Run button
            await page.click('#runQueryBtn');
            await page.waitForTimeout(3000);
            await page.screenshot({ path: `${SCREENSHOT_DIR}13-correct-query-results.png` });

            console.log('✅ Correct query executed (showing Engineering employees)');
        });

        await test.step('Step 8: Submit CORRECT query', async () => {
            console.log('\n📤 Step 8: Submitting correct query...');

            await page.screenshot({ path: `${SCREENSHOT_DIR}14-before-correct-submit.png` });

            // Click Submit button
            await page.click('#submitPracticeBtn');
            await page.waitForTimeout(2000);
            await page.screenshot({ path: `${SCREENSHOT_DIR}15-after-correct-submit.png` });

            // Verify correct feedback
            const feedbackPanel = page.locator('#practiceFeedbackPanel');
            await expect(feedbackPanel).toBeVisible();

            const feedbackMessage = await page.textContent('#feedbackMessage');
            console.log('   Feedback:', feedbackMessage);

            expect(feedbackMessage).toContain('Correct');

            console.log('✅ Correct submission accepted');
        });

        await test.step('Step 9: Verify Next Question button appears', async () => {
            console.log('\n➡️ Step 9: Checking for Next Question button...');

            await page.screenshot({ path: `${SCREENSHOT_DIR}16-next-question-button.png` });

            // Check if next question button exists
            const nextButton = page.locator('#nextQuestionBtn');
            await expect(nextButton).toBeVisible();

            console.log('✅ Next Question button appeared as expected');
        });

        await test.step('Step 10: Show solution (optional)', async () => {
            console.log('\n💡 Step 10: Viewing solution...');

            // Click show solution button
            await page.click('#showSolutionBtn');
            await page.waitForTimeout(1000);
            await page.screenshot({ path: `${SCREENSHOT_DIR}17-solution-displayed.png` });

            // Verify solution panel is visible
            const solutionPanel = page.locator('#practiceSolutionPanel');
            await expect(solutionPanel).toBeVisible();

            console.log('✅ Solution displayed with explanation');
        });

        await test.step('Step 11: Final state screenshot', async () => {
            console.log('\n📸 Step 11: Capturing final state...');

            await page.screenshot({
                path: `${SCREENSHOT_DIR}18-final-state.png`,
                fullPage: true
            });

            console.log('✅ Final state captured');
        });

        // Generate test report
        console.log('\n========================================');
        console.log('📊 PRACTICE MODE TEST SUMMARY');
        console.log('========================================');
        console.log('✅ User Login/Registration: PASS');
        console.log('✅ Practice Mode Start: PASS');
        console.log('✅ Question 1 Load: PASS');
        console.log('✅ Incorrect Query Run: PASS');
        console.log('✅ Incorrect Query Submit: PASS (Rejected)');
        console.log('✅ Correct Query Run: PASS');
        console.log('✅ Correct Query Submit: PASS (Accepted)');
        console.log('✅ Next Question Button: PASS');
        console.log('✅ Solution Display: PASS');
        console.log('========================================\n');
    });
});

/**
 * Test Cleanup
 */
test.afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...');

    try {
        // Logout test user via API
        await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            }
        });
        console.log('✅ Test user logged out');
    } catch (error) {
        console.error('⚠️  Cleanup warning:', error.message);
    }
});
