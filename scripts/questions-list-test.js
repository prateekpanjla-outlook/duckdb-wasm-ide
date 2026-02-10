/**
 * Questions List E2E Test
 * Tests the Questions List modal functionality
 * Usage: node scripts/questions-list-test.js
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

const BASE_URL = 'http://localhost:8000';
const SCREENSHOT_DIR = '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/test-results/screenshots/questions-list/';

// Test user credentials
const TEST_USER = {
    email: 'e2e-test@example.com',
    password: 'testpass123'
};

// Expected questions
const EXPECTED_QUESTIONS = [
    { id: 1, title: 'Select all employees from the Engineering department', category: 'SELECT queries', difficulty: 'beginner' },
    { id: 2, title: 'Find all products that cost more than $100', category: 'WHERE clause', difficulty: 'beginner' },
    { id: 3, title: 'Find the average score of all students', category: 'Aggregate functions', difficulty: 'beginner' },
    { id: 4, title: 'Find the total amount spent by each customer', category: 'GROUP BY', difficulty: 'intermediate' },
    { id: 5, title: 'Find all employees who earn more than their department average salary', category: 'Subqueries', difficulty: 'advanced' },
    { id: 6, title: 'Find books published after 1950, ordered by price (most expensive first)', category: 'ORDER BY', difficulty: 'beginner' },
    { id: 7, title: 'Find the total sales amount for each product in each region', category: 'GROUP BY', difficulty: 'intermediate' }
];

async function runQuestionsListTest() {
    console.log('🚀 Starting Questions List E2E Test...\n');

    // Create screenshot directory if it doesn't exist
    if (!existsSync(SCREENSHOT_DIR)) {
        mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    const allIssues = [];
    const allSteps = [];

    // Set up console logging
    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            console.log('   🔴 Browser error:', text);
        } else if (msg.type() === 'warning') {
            console.log('   ⚠️  Browser warning:', text);
        }
    });

    try {
        // ============================================
        // STEP 1: Navigate and Login
        // ============================================
        console.log('📄 Step 1: Loading application and logging in...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.screenshot({ path: SCREENSHOT_DIR + '01-page-loaded.png' });

        // Wait for DuckDB initialization
        await page.waitForTimeout(10000);

        // Login
        await page.click('#authBtn');
        await page.waitForTimeout(500);
        await page.fill('#authEmail', TEST_USER.email);
        await page.fill('#authPassword', TEST_USER.password);
        await page.screenshot({ path: SCREENSHOT_DIR + '02-login-form-filled.png' });
        await page.click('.auth-submit-btn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: SCREENSHOT_DIR + '03-after-login.png' });

        // Verify login
        const authBtnText = await page.textContent('#authBtn');
        if (!authBtnText.includes(TEST_USER.email)) {
            allIssues.push({
                step: 'Login',
                issue: 'Login failed',
                expected: `Button should show ${TEST_USER.email}`,
                actual: `Button shows: ${authBtnText}`
            });
        }

        // Verify Questions button is visible
        const questionsBtnVisible = await page.locator('#viewQuestionsBtn').isVisible();
        if (!questionsBtnVisible) {
            allIssues.push({
                step: 'Questions Button Visibility',
                issue: 'Questions button not visible after login',
                expected: '#viewQuestionsBtn should be visible',
                actual: 'Button not found or hidden'
            });
        }

        allSteps.push('Application loaded and logged in');
        console.log('✅ Step 1 complete\n');

        // ============================================
        // STEP 2: Open Questions Modal
        // ============================================
        console.log('📋 Step 2: Opening Questions modal...');
        await page.click('#viewQuestionsBtn');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: SCREENSHOT_DIR + '04-questions-modal-open.png' });

        // Verify modal is visible
        const modalVisible = await page.locator('#questionsModal').isVisible();
        if (!modalVisible) {
            allIssues.push({
                step: 'Open Questions Modal',
                issue: 'Questions modal did not open',
                expected: '#questionsModal should be visible',
                actual: 'Modal not found'
            });
        }

        allSteps.push('Questions modal opened');
        console.log('✅ Step 2 complete\n');

        // ============================================
        // STEP 3: Verify All Questions Are Displayed
        // ============================================
        console.log('📊 Step 3: Verifying all questions are displayed...');
        await page.screenshot({ path: SCREENSHOT_DIR + '05-questions-list.png' });

        const questionCards = await page.locator('.question-card').count();
        if (questionCards !== EXPECTED_QUESTIONS.length) {
            allIssues.push({
                step: 'Questions Count',
                issue: 'Incorrect number of questions displayed',
                expected: `${EXPECTED_QUESTIONS.length} questions`,
                actual: `${questionCards} questions`
            });
        }

        // Verify each question
        for (let i = 0; i < EXPECTED_QUESTIONS.length; i++) {
            const expected = EXPECTED_QUESTIONS[i];
            const questionNum = i + 1;

            // Check if question card exists
            const cardExists = await page.locator(`.question-card:nth-child(${questionNum})`).isVisible();
            if (!cardExists) {
                allIssues.push({
                    step: `Question ${questionNum}`,
                    issue: `Question card not found`,
                    expected: `Question ${questionNum} should be displayed`,
                    actual: `Card not found`
                });
                continue;
            }

            // Check question number
            const questionNumber = await page.locator(`.question-card:nth-child(${questionNum}) .question-number`).textContent();
            if (!questionNumber.includes(`Q${questionNum}`)) {
                allIssues.push({
                    step: `Question ${questionNum} Number`,
                    issue: 'Question number incorrect',
                    expected: `Q${questionNum}`,
                    actual: questionNumber
                });
            }

            // Check question title contains expected text
            const questionTitle = await page.locator(`.question-card:nth-child(${questionNum}) .question-title`).textContent();
            if (!questionTitle.toLowerCase().includes(expected.title.toLowerCase().substring(0, 20))) {
                allIssues.push({
                    step: `Question ${questionNum} Title`,
                    issue: 'Question title does not match expected',
                    expected: expected.title.substring(0, 50),
                    actual: questionTitle.substring(0, 50)
                });
            }

            // Check category badge
            const categoryBadges = await page.locator(`.question-card:nth-child(${questionNum}) .badge-category`).allTextContents();
            const categoryExists = categoryBadges.some(badge => badge.includes(expected.category));
            if (!categoryExists) {
                allIssues.push({
                    step: `Question ${questionNum} Category`,
                    issue: 'Category badge incorrect or missing',
                    expected: expected.category,
                    actual: categoryBadges.join(', ')
                });
            }

            // Check difficulty badge
            const difficultyBadges = await page.locator(`.question-card:nth-child(${questionNum}) .badge-difficulty`).allTextContents();
            const difficultyExists = difficultyBadges.some(badge => badge.toLowerCase().includes(expected.difficulty));
            if (!difficultyExists) {
                allIssues.push({
                    step: `Question ${questionNum} Difficulty`,
                    issue: 'Difficulty badge incorrect or missing',
                    expected: expected.difficulty,
                    actual: difficultyBadges.join(', ')
                });
            }

            // Check status indicator
            const statusExists = await page.locator(`.question-card:nth-child(${questionNum}) .question-status`).isVisible();
            if (!statusExists) {
                allIssues.push({
                    step: `Question ${questionNum} Status`,
                    issue: 'Status indicator not found',
                    expected: 'Status should be displayed',
                    actual: 'Status element not found'
                });
            }

            // Check start/retry button
            const buttonExists = await page.locator(`.question-card:nth-child(${questionNum}) .start-question-btn`).isVisible();
            if (!buttonExists) {
                allIssues.push({
                    step: `Question ${questionNum} Button`,
                    issue: 'Start/Retry button not found',
                    expected: 'Button should be displayed',
                    actual: 'Button element not found'
                });
            }
        }

        allSteps.push(`Verified all ${EXPECTED_QUESTIONS.length} questions`);
        console.log('✅ Step 3 complete\n');

        // ============================================
        // STEP 4: Close Modal
        // ============================================
        console.log('❌ Step 4: Closing modal with X button...');
        await page.click('#closeQuestionsModal');
        await page.waitForTimeout(500);
        await page.screenshot({ path: SCREENSHOT_DIR + '06-modal-closed.png' });

        const modalHidden = await page.locator('#questionsModal').isHidden();
        if (!modalHidden) {
            allIssues.push({
                step: 'Close Modal',
                issue: 'Modal did not close when X button clicked',
                expected: 'Modal should be hidden',
                actual: 'Modal still visible'
            });
        }

        allSteps.push('Modal closed successfully');
        console.log('✅ Step 4 complete\n');

        // ============================================
        // STEP 5: Reopen Modal and Test Outside Click
        // ============================================
        console.log('🔄 Step 5: Reopening modal and testing outside click...');
        await page.click('#viewQuestionsBtn');
        await page.waitForTimeout(500);
        await page.screenshot({ path: SCREENSHOT_DIR + '07-modal-reopened.png' });

        // Click outside modal (on the overlay)
        const modalBox = await page.locator('#questionsModal').boundingBox();
        await page.mouse.click(modalBox.x - 10, modalBox.y);
        await page.waitForTimeout(500);

        const modalHiddenAfterClick = await page.locator('#questionsModal').isHidden();
        if (!modalHiddenAfterClick) {
            allIssues.push({
                step: 'Close Modal on Outside Click',
                issue: 'Modal did not close when clicking outside',
                expected: 'Modal should be hidden',
                actual: 'Modal still visible'
            });
        }

        allSteps.push('Modal closed on outside click');
        console.log('✅ Step 5 complete\n');

        // ============================================
        // STEP 6: Test Selecting a Question
        // ============================================
        console.log('▶️ Step 6: Testing question selection...');
        await page.click('#viewQuestionsBtn');
        await page.waitForTimeout(500);
        await page.screenshot({ path: SCREENSHOT_DIR + '08-before-question-select.png' });

        // Click on Question 1's start button
        await page.locator('.question-card:nth-child(1) .start-question-btn').click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: SCREENSHOT_DIR + '09-after-question-select.png' });

        // Verify practice mode started
        const practicePanelVisible = await page.locator('#practicePanel').isVisible();
        if (!practicePanelVisible) {
            allIssues.push({
                step: 'Start Question from List',
                issue: 'Practice panel did not appear after selecting question',
                expected: '#practicePanel should be visible',
                actual: 'Practice panel not found'
            });
        }

        // Verify correct question is loaded
        const practiceQuestionText = await page.locator('#practiceQuestionText').textContent();
        if (!practiceQuestionText.toLowerCase().includes(EXPECTED_QUESTIONS[0].title.toLowerCase().substring(0, 20))) {
            allIssues.push({
                step: 'Question Content',
                issue: 'Incorrect question loaded',
                expected: EXPECTED_QUESTIONS[0].title.substring(0, 50),
                actual: practiceQuestionText.substring(0, 50)
            });
        }

        allSteps.push('Question selected and practice mode started');
        console.log('✅ Step 6 complete\n');

        // ============================================
        // STEP 7: Final Screenshot
        // ============================================
        console.log('📸 Step 7: Capturing final state...');
        await page.screenshot({
            path: SCREENSHOT_DIR + '10-final-state.png',
            fullPage: true
        });
        allSteps.push('Final state captured');
        console.log('✅ Step 7 complete\n');

        // ============================================
        // TEST SUMMARY
        // ============================================
        console.log('========================================');
        console.log('📊 QUESTIONS LIST TEST SUMMARY');
        console.log('========================================');
        console.log(`Total Steps Completed: ${allSteps.length}`);
        console.log(`Total Issues Found: ${allIssues.length}`);
        console.log('========================================');

        if (allIssues.length > 0) {
            console.log('\n⚠️  ISSUES FOUND:');
            allIssues.forEach((issue, i) => {
                console.log(`\nIssue #${i + 1}:`);
                console.log(`  Step: ${issue.step}`);
                console.log(`  Issue: ${issue.issue}`);
                console.log(`  Expected: ${issue.expected}`);
                console.log(`  Actual: ${issue.actual}`);
            });
        } else {
            console.log('\n✅ ALL TESTS PASSED!');
        }

        // Generate report
        const report = {
            timestamp: new Date().toISOString(),
            test: 'Questions List E2E',
            status: allIssues.length > 0 ? 'FAILED' : 'PASSED',
            steps: allSteps,
            issues: allIssues,
            totalScreenshots: 10
        };

        writeFileSync(
            '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/test-results/questions-list-test-report.json',
            JSON.stringify(report, null, 2)
        );

        console.log('\n📄 Test report saved to: test-results/questions-list-test-report.json');
        console.log('📸 All screenshots saved to: test-results/screenshots/questions-list/');
        console.log('\n🎉 Questions list test completed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        allIssues.push({
            step: 'Test Execution',
            issue: 'Test threw error',
            expected: 'Test to complete successfully',
            actual: error.message
        });
    } finally {
        await browser.close();
    }

    // Return exit code based on test results
    process.exit(allIssues.length > 0 ? 1 : 0);
}

// Run the test
runQuestionsListTest().catch(console.error);
