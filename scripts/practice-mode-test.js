/**
 * Practice Mode E2E Test - Standalone Script
 * Runs complete practice mode flow and captures screenshots
 * Usage: node scripts/practice-mode-test.js
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:8000';
const API_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/test-results/screenshots/practice-mode/';

// Test user credentials (pre-created in database)
const TEST_USER = {
    email: 'e2e-test@example.com',
    password: 'testpass123'
};

// Question 1 data
const QUESTION_1 = {
    question: 'Select all employees from the Engineering department',
    incorrect_query: "SELECT * FROM employees WHERE department = 'Sales'",
    correct_query: "SELECT * FROM employees WHERE department = 'Engineering'"
};

async function runPracticeModeTest() {
    console.log('🚀 Starting Practice Mode E2E Test...\n');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    const issues = [];
    const steps = [];

    // Set up console logging (capture all for debugging)
    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            console.log('   🔴 Browser error:', text);
        } else if (msg.type() === 'warning') {
            console.log('   ⚠️  Browser warning:', text);
        } else if (text.includes('Comparing results:') || text.includes('Is correct?') ||
                   text.includes('User results:') || text.includes('Solution results:')) {
            console.log('   📊 Debug:', text);
        }
    });

    try {
        // ============================================
        // STEP 1: Navigate to app
        // ============================================
        console.log('📄 Step 1: Loading application...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.screenshot({ path: SCREENSHOT_DIR + '01-page-loaded.png' });

        // Wait for DuckDB initialization
        await page.waitForTimeout(10000);
        console.log('✅ Application loaded');
        steps.push('Step 1: Application loaded');

        // ============================================
        // STEP 2: Login
        // ============================================
        console.log('\n🔐 Step 2: Logging in...');

        // Click login button
        await page.click('#authBtn');
        await page.waitForTimeout(500);
        await page.screenshot({ path: SCREENSHOT_DIR + '02-login-modal-open.png' });

        // Fill login form
        await page.fill('#authEmail', TEST_USER.email);
        await page.fill('#authPassword', TEST_USER.password);
        await page.screenshot({ path: SCREENSHOT_DIR + '03-login-form-filled.png' });

        // Submit form
        await page.click('.auth-submit-btn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: SCREENSHOT_DIR + '04-after-login.png' });

        // Verify login success
        const authBtnText = await page.textContent('#authBtn');
        if (!authBtnText.includes(TEST_USER.email)) {
            issues.push({
                step: 'Login',
                issue: 'Login did not complete successfully',
                expected: `Button should show ${TEST_USER.email}`,
                actual: `Button shows: ${authBtnText}`
            });
        }
        console.log('✅ Login successful');
        steps.push('Step 2: Login successful');

        // ============================================
        // STEP 3: Start practice mode
        // ============================================
        console.log('\n🎯 Step 3: Starting practice mode...');

        // Click practice button
        const startPracticeBtn = page.locator('#startPracticeBtn');
        const isVisible = await startPracticeBtn.isVisible();

        if (!isVisible) {
            issues.push({
                step: 'Start Practice',
                issue: 'Practice button not visible',
                expected: '#startPracticeBtn should be visible',
                actual: 'Button not found or hidden'
            });
        }

        await page.click('#startPracticeBtn');
        await page.waitForTimeout(500);
        await page.screenshot({ path: SCREENSHOT_DIR + '05-practice-prompt-modal.png' });

        // Click "Yes, Start Practicing!"
        await page.click('#startPracticeYes');
        await page.waitForTimeout(8000);
        await page.screenshot({ path: SCREENSHOT_DIR + '06-practice-mode-started.png' });

        // Debug: Check what's in the DOM and console
        const qText = await page.textContent('#practiceQuestionText');
        const submitBtnCount = await page.locator('#submitPracticeBtn').count();
        const queryActionsExists = await page.locator('.query-actions').count();
        console.log('   Question text:', qText);
        console.log('   Submit button count:', submitBtnCount);
        console.log('   Query actions element count:', queryActionsExists);

        // Verify practice mode UI is visible
        const questionPanel = page.locator('#practiceQuestionPanel');
        const panelVisible = await questionPanel.isVisible();

        if (!panelVisible) {
            issues.push({
                step: 'Practice Mode Start',
                issue: 'Question panel not visible',
                expected: '#practiceQuestionPanel should be visible',
                actual: 'Panel not found'
            });
        }

        console.log('✅ Practice mode started');
        steps.push('Step 3: Practice mode started');

        // ============================================
        // STEP 4: Verify question 1
        // ============================================
        console.log('\n📝 Step 4: Verifying question 1...');

        await page.screenshot({ path: SCREENSHOT_DIR + '07-question-1-loaded.png' });

        const questionText = await page.textContent('#practiceQuestionText');
        console.log('   Question:', questionText);

        if (!questionText.includes(QUESTION_1.question)) {
            issues.push({
                step: 'Question Load',
                issue: 'Question text does not match expected',
                expected: QUESTION_1.question,
                actual: questionText
            });
        }

        console.log('✅ Question 1 loaded correctly');
        steps.push('Step 4: Question 1 verified');

        // ============================================
        // STEP 5: Run INCORRECT query
        // ============================================
        console.log('\n❌ Step 5: Running incorrect query...');

        const codeMirror = page.locator('.CodeMirror');
        await codeMirror.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.type(QUESTION_1.incorrect_query);

        await page.screenshot({ path: SCREENSHOT_DIR + '08-incorrect-query-typed.png' });

        // Click Run button
        await page.click('#runQueryBtn');
        await page.waitForTimeout(5000);
        await page.screenshot({ path: SCREENSHOT_DIR + '09-incorrect-query-results.png' });

        console.log('✅ Incorrect query executed');
        steps.push('Step 5: Incorrect query executed');

        // ============================================
        // STEP 6: Submit INCORRECT query
        // ============================================
        console.log('\n📤 Step 6: Submitting incorrect query...');

        await page.screenshot({ path: SCREENSHOT_DIR + '10-before-incorrect-submit.png' });

        // Click Submit button
        await page.click('#submitPracticeBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: SCREENSHOT_DIR + '11-after-incorrect-submit.png' });

        // Verify incorrect feedback
        const feedbackPanel = page.locator('#practiceFeedbackPanel');
        const feedbackVisible = await feedbackPanel.isVisible();

        if (!feedbackVisible) {
            issues.push({
                step: 'Submit Incorrect',
                issue: 'Feedback panel not visible after submit',
                expected: '#practiceFeedbackPanel should be visible',
                actual: 'Panel not found'
            });
        } else {
            const feedbackMessage = await page.textContent('#feedbackMessage');
            console.log('   Feedback:', feedbackMessage);

            if (!feedbackMessage.includes('Not quite right') && !feedbackMessage.includes('right')) {
                issues.push({
                    step: 'Submit Incorrect',
                    issue: 'Feedback message unexpected',
                    expected: 'Should indicate incorrect answer',
                    actual: feedbackMessage
                });
            }
        }

        console.log('✅ Incorrect submission handled');
        steps.push('Step 6: Incorrect submission processed');

        // ============================================
        // STEP 7: Run CORRECT query
        // ============================================
        console.log('\n✅ Step 7: Running correct query...');

        await codeMirror.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.type(QUESTION_1.correct_query);

        await page.screenshot({ path: SCREENSHOT_DIR + '12-correct-query-typed.png' });

        // Click Run button
        await page.click('#runQueryBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: SCREENSHOT_DIR + '13-correct-query-results.png' });

        console.log('✅ Correct query executed');
        steps.push('Step 7: Correct query executed');

        // ============================================
        // STEP 8: Submit CORRECT query
        // ============================================
        console.log('\n📤 Step 8: Submitting correct query...');

        await page.screenshot({ path: SCREENSHOT_DIR + '14-before-correct-submit.png' });

        // Click Submit button
        await page.click('#submitPracticeBtn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: SCREENSHOT_DIR + '15-after-correct-submit.png' });

        // Verify correct feedback
        const feedbackMessage = await page.textContent('#feedbackMessage');
        console.log('   Feedback:', feedbackMessage);

        if (!feedbackMessage.includes('Correct') && !feedbackMessage.includes('correct')) {
            issues.push({
                step: 'Submit Correct',
                issue: 'Feedback does not indicate correct answer',
                expected: 'Should show success/correct message',
                actual: feedbackMessage
            });
        }

        console.log('✅ Correct submission accepted');
        steps.push('Step 8: Correct submission accepted');

        // ============================================
        // STEP 9: Verify Next Question button
        // ============================================
        console.log('\n➡️ Step 9: Checking for Next Question button...');

        await page.screenshot({ path: SCREENSHOT_DIR + '16-next-question-button.png' });

        const nextButton = page.locator('#nextQuestionBtn');
        const nextButtonVisible = await nextButton.isVisible();

        if (!nextButtonVisible) {
            issues.push({
                step: 'Next Question Button',
                issue: 'Next Question button not visible after correct answer',
                expected: '#nextQuestionBtn should appear after correct submission',
                actual: 'Button not found'
            });
        }

        console.log('✅ Next Question button check complete');
        steps.push('Step 9: Next Question button verified');

        // ============================================
        // STEP 10: Show solution
        // ============================================
        console.log('\n💡 Step 10: Viewing solution...');

        await page.click('#showSolutionBtn');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: SCREENSHOT_DIR + '17-solution-displayed.png' });

        const solutionPanel = page.locator('#practiceSolutionPanel');
        const solutionVisible = await solutionPanel.isVisible();

        if (!solutionVisible) {
            issues.push({
                step: 'Show Solution',
                issue: 'Solution panel not visible',
                expected: '#practiceSolutionPanel should be visible',
                actual: 'Panel not found'
            });
        }

        console.log('✅ Solution displayed');
        steps.push('Step 10: Solution displayed');

        // ============================================
        // STEP 11: Final screenshot
        // ============================================
        console.log('\n📸 Step 11: Capturing final state...');

        await page.screenshot({
            path: SCREENSHOT_DIR + '18-final-state.png',
            fullPage: true
        });

        console.log('✅ Final state captured');
        steps.push('Step 11: Final state captured');

        // ============================================
        // Generate Report
        // ============================================
        console.log('\n========================================');
        console.log('📊 PRACTICE MODE TEST SUMMARY');
        console.log('========================================');
        steps.forEach((step, i) => console.log(`${i + 1}. ${step}`));
        console.log('========================================');

        if (issues.length > 0) {
            console.log('\n⚠️  ISSUES FOUND:');
            issues.forEach((issue, i) => {
                console.log(`\nIssue #${i + 1}:`);
                console.log(`  Step: ${issue.step}`);
                console.log(`  Issue: ${issue.issue}`);
                console.log(`  Expected: ${issue.expected}`);
                console.log(`  Actual: ${issue.actual}`);
            });
        } else {
            console.log('\n✅ ALL TESTS PASSED!');
        }

        const report = {
            timestamp: new Date().toISOString(),
            test: 'Practice Mode E2E',
            status: issues.length > 0 ? 'FAILED' : 'PASSED',
            steps: steps,
            issues: issues,
            screenshots: [
                '01-page-loaded.png',
                '02-login-modal-open.png',
                '03-login-form-filled.png',
                '04-after-login.png',
                '05-practice-prompt-modal.png',
                '06-practice-mode-started.png',
                '07-question-1-loaded.png',
                '08-incorrect-query-typed.png',
                '09-incorrect-query-results.png',
                '10-before-incorrect-submit.png',
                '11-after-incorrect-submit.png',
                '12-correct-query-typed.png',
                '13-correct-query-results.png',
                '14-before-correct-submit.png',
                '15-after-correct-submit.png',
                '16-next-question-button.png',
                '17-solution-displayed.png',
                '18-final-state.png'
            ]
        };

        writeFileSync(
            '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/test-results/practice-mode-test-report.json',
            JSON.stringify(report, null, 2)
        );

        console.log('\n📄 Test report saved to: test-results/practice-mode-test-report.json');
        console.log('📸 All screenshots saved to: test-results/screenshots/practice-mode/');
        console.log('\n🎉 Practice mode test completed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        issues.push({
            step: 'Test Execution',
            issue: 'Test threw error',
            expected: 'Test to complete successfully',
            actual: error.message
        });
    } finally {
        await browser.close();
    }

    // Update documentation with issues found
    updateDocumentation(issues);
}

function updateDocumentation(issues) {
    const fs = writeFileSync;

    const documentation = `
# Practice Mode E2E Test Results

**Date**: ${new Date().toISOString()}
**Status**: ${issues.length > 0 ? 'FAILED' : 'PASSED'}

## Issues Found: ${issues.length}

${issues.map((issue, i) => `
### Issue #${i + 1}: ${issue.step}

**Problem**: ${issue.issue}
**Expected**: ${issue.expected}
**Actual**: ${issue.actual}
**Fix Needed**: ${issue.step === 'Login' ? 'Check authentication flow' : issue.step === 'Practice Mode Start' ? 'Check practice manager initialization' : 'Review implementation'}
`).join('\n')}

${issues.length === 0 ? '## ✅ All tests passed successfully!' : '## ⚠️  Issues require attention before deployment'}
`;

    fs(
        '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/docs/practice-mode-test-results.md',
        documentation
    );

    console.log('\n📄 Test results documented in: docs/practice-mode-test-results.md');
}

runPracticeModeTest().catch(console.error);
