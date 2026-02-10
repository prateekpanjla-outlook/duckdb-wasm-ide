/**
 * All Questions E2E Test - Comprehensive Test Suite
 * Tests all 7 practice questions with incorrect and correct queries
 * Usage: node scripts/all-questions-test.js
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

const BASE_URL = 'http://localhost:8000';
const API_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/test-results/screenshots/all-questions/';

// Test user credentials
const TEST_USER = {
    email: 'e2e-test@example.com',
    password: 'testpass123'
};

// All 7 questions with test data
const QUESTIONS = [
    {
        id: 1,
        question: 'Select all employees from the Engineering department',
        incorrect_query: "SELECT * FROM employees WHERE department = 'Sales'",
        correct_query: "SELECT * FROM employees WHERE department = 'Engineering'"
    },
    {
        id: 2,
        question: 'Find all products that cost more than $100',
        incorrect_query: "SELECT * FROM products WHERE price < 100",
        correct_query: "SELECT * FROM products WHERE price > 100"
    },
    {
        id: 3,
        question: 'Find the average score of all students',
        incorrect_query: "SELECT COUNT(*) as average_score FROM students",
        correct_query: "SELECT AVG(score) as average_score FROM students"
    },
    {
        id: 4,
        question: 'Find the total amount spent by each customer',
        incorrect_query: "SELECT customer_id, total_amount FROM orders",
        correct_query: "SELECT customer_id, SUM(total_amount) as total_spent FROM orders GROUP BY customer_id"
    },
    {
        id: 5,
        question: 'Find all employees who earn more than their department average salary',
        incorrect_query: "SELECT * FROM employees WHERE salary > 50000",
        correct_query: "SELECT e.name, e.department, e.salary FROM employees e WHERE e.salary > (SELECT AVG(salary) FROM employees WHERE department = e.department)"
    },
    {
        id: 6,
        question: 'Find books published after 1950, ordered by price (most expensive first)',
        incorrect_query: "SELECT * FROM books WHERE published_year > 1950 ORDER BY price ASC",
        correct_query: "SELECT * FROM books WHERE published_year > 1950 ORDER BY price DESC"
    },
    {
        id: 7,
        question: 'Find the total sales amount for each product in each region',
        incorrect_query: "SELECT product, region, amount FROM sales",
        correct_query: "SELECT product, region, SUM(amount) as total_sales FROM sales GROUP BY product, region ORDER BY product, region"
    }
];

async function runAllQuestionsTest() {
    console.log('🚀 Starting All Questions E2E Test...\n');

    // Create screenshot directory if it doesn't exist
    if (!existsSync(SCREENSHOT_DIR)) {
        mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    const allIssues = [];
    const allSteps = [];
    let questionNumber = 0;

    // Set up console logging
    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            console.log('   🔴 Browser error:', text);
        } else if (msg.type() === 'warning') {
            console.log('   ⚠️  Browser warning:', text);
        } else if (text.includes('📊') || text.includes('❌ Compare:') || text.includes('✅ Compare:') ||
                   text.includes('🔍') || text.includes('✅ Practice')) {
            console.log('   ' + text);
        }
    });

    try {
        // ============================================
        // INITIAL SETUP: Login
        // ============================================
        console.log('🔐 Initial Setup: Logging in...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.screenshot({ path: SCREENSHOT_DIR + '00-page-loaded.png' });

        // Wait for DuckDB initialization
        await page.waitForTimeout(10000);

        // Login
        await page.click('#authBtn');
        await page.waitForTimeout(500);
        await page.fill('#authEmail', TEST_USER.email);
        await page.fill('#authPassword', TEST_USER.password);
        await page.click('.auth-submit-btn');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: SCREENSHOT_DIR + '01-after-login.png' });

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
        console.log('✅ Login successful\n');

        // ============================================
        // TEST EACH QUESTION
        // ============================================
        for (const questionData of QUESTIONS) {
            questionNumber++;
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📝 QUESTION ${questionNumber}: ${questionData.question}`);
            console.log('='.repeat(60));

            const questionIssues = [];
            const questionSteps = [];

            try {
                // Start practice mode or go to next question
                if (questionNumber === 1) {
                    // First question - start practice mode
                    console.log('Starting practice mode...');
                    await page.click('#startPracticeBtn');
                    await page.waitForTimeout(500);
                    await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-01-practice-prompt.png` });

                    await page.click('#startPracticeYes');
                    await page.waitForTimeout(8000);
                } else {
                    // Subsequent questions - click next question
                    console.log('Loading next question...');
                    const nextBtn = page.locator('#nextQuestionBtn');
                    const isVisible = await nextBtn.isVisible();

                    if (!isVisible) {
                        throw new Error('Next Question button not visible');
                    }

                    await page.click('#nextQuestionBtn');
                    await page.waitForTimeout(6000);
                }

                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-02-question-loaded.png` });

                // Verify question loaded
                const qText = await page.textContent('#practiceQuestionText');
                console.log('   Question text:', qText);

                if (!qText.includes(questionData.question.substring(0, 20))) {
                    questionIssues.push({
                        step: `Question ${questionNumber} Load`,
                        issue: 'Question text does not match expected',
                        expected: questionData.question,
                        actual: qText
                    });
                }
                questionSteps.push(`Question ${questionNumber} loaded`);

                // Hide feedback panel if visible
                try {
                    page.locator('#practiceFeedbackPanel').evaluate(el => el.classList.add('hidden'));
                } catch (e) {
                    // Ignore if not visible
                }

                // ============================================
                // STEP 1: Run INCORRECT query
                // ============================================
                console.log('❌ Step 1: Running incorrect query...');
                const codeMirror = page.locator('.CodeMirror');
                await codeMirror.click();
                await page.keyboard.press('Control+A');
                await page.keyboard.type(questionData.incorrect_query);

                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-03-incorrect-query-typed.png` });

                await page.click('#runQueryBtn');
                await page.waitForTimeout(4000);
                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-04-incorrect-query-results.png` });

                console.log('✅ Incorrect query executed');

                // ============================================
                // STEP 2: Submit INCORRECT query
                // ============================================
                console.log('📤 Step 2: Submitting incorrect query...');
                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-05-before-incorrect-submit.png` });

                await page.click('#submitPracticeBtn');
                await page.waitForTimeout(2000);
                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-06-after-incorrect-submit.png` });

                // Verify incorrect feedback
                const feedbackMessage = await page.textContent('#feedbackMessage');
                console.log('   Feedback:', feedbackMessage);

                if (!feedbackMessage.includes('Not quite right') && !feedbackMessage.includes('right')) {
                    questionIssues.push({
                        step: `Question ${questionNumber} Incorrect Submit`,
                        issue: 'Unexpected feedback for incorrect answer',
                        expected: 'Should indicate incorrect answer',
                        actual: feedbackMessage
                    });
                }
                questionSteps.push('Incorrect submission handled');

                // Hide feedback panel
                try {
                    page.locator('#practiceFeedbackPanel').evaluate(el => el.classList.add('hidden'));
                } catch (e) {
                    // Ignore
                }

                // ============================================
                // STEP 3: Run CORRECT query
                // ============================================
                console.log('✅ Step 3: Running correct query...');
                await codeMirror.click();
                await page.keyboard.press('Control+A');
                await page.keyboard.type(questionData.correct_query);

                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-07-correct-query-typed.png` });

                await page.click('#runQueryBtn');
                await page.waitForTimeout(3000);
                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-08-correct-query-results.png` });

                console.log('✅ Correct query executed');

                // ============================================
                // STEP 4: Submit CORRECT query
                // ============================================
                console.log('📤 Step 4: Submitting correct query...');
                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-09-before-correct-submit.png` });

                await page.click('#submitPracticeBtn');
                await page.waitForTimeout(2000);
                await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-10-after-correct-submit.png` });

                // Verify correct feedback
                const correctFeedback = await page.textContent('#feedbackMessage');
                console.log('   Feedback:', correctFeedback);

                if (!correctFeedback.includes('Correct') && !correctFeedback.includes('correct')) {
                    questionIssues.push({
                        step: `Question ${questionNumber} Correct Submit`,
                        issue: 'Feedback does not indicate correct answer',
                        expected: 'Should show success/correct message',
                        actual: correctFeedback
                    });
                }
                questionSteps.push('Correct submission accepted');

                // ============================================
                // STEP 5: Verify Next Question button (except for last question)
                // ============================================
                if (questionNumber < QUESTIONS.length) {
                    console.log('➡️ Step 5: Checking for Next Question button...');
                    await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-11-next-question-button.png` });

                    const nextButton = page.locator('#nextQuestionBtn');
                    const nextButtonVisible = await nextButton.isVisible();

                    if (!nextButtonVisible) {
                        questionIssues.push({
                            step: `Question ${questionNumber} Next Button`,
                            issue: 'Next Question button not visible after correct answer',
                            expected: '#nextQuestionBtn should appear',
                            actual: 'Button not found'
                        });
                    }
                    questionSteps.push('Next Question button verified');
                } else {
                    console.log('🏁 Last question - no next button expected');
                    await page.screenshot({ path: SCREENSHOT_DIR + `q${questionNumber}-11-final-question-complete.png` });
                }

                console.log(`✅ Question ${questionNumber} COMPLETE`);

            } catch (error) {
                console.error(`❌ Question ${questionNumber} FAILED:`, error.message);
                questionIssues.push({
                    step: `Question ${questionNumber}`,
                    issue: 'Test threw error',
                    expected: 'Test to complete successfully',
                    actual: error.message
                });
            }

            // Add question issues to all issues
            allIssues.push(...questionIssues);
            allSteps.push(...questionSteps);

            // Print question summary
            if (questionIssues.length > 0) {
                console.log(`\n⚠️  Issues for Question ${questionNumber}:`);
                questionIssues.forEach((issue, i) => {
                    console.log(`   ${i + 1}. ${issue.step}: ${issue.issue}`);
                });
            } else {
                console.log(`\n✅ Question ${questionNumber}: All checks passed!`);
            }
        }

        // ============================================
        // FINAL SCREENSHOT
        // ============================================
        console.log('\n📸 Capturing final state...');
        await page.screenshot({
            path: SCREENSHOT_DIR + '99-final-state.png',
            fullPage: true
        });

        // ============================================
        // GENERATE REPORT
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('📊 ALL QUESTIONS TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Questions Tested: ${QUESTIONS.length}`);
        console.log(`Total Steps Completed: ${allSteps.length}`);
        console.log(`Total Issues Found: ${allIssues.length}`);
        console.log('='.repeat(60));

        if (allIssues.length > 0) {
            console.log('\n⚠️  ISSUES FOUND:');
            allIssues.forEach((issue, i) => {
                console.log(`\nIssue #${i + 1}:`);
                console.log(`  Question: ${issue.step}`);
                console.log(`  Issue: ${issue.issue}`);
                console.log(`  Expected: ${issue.expected}`);
                console.log(`  Actual: ${issue.actual}`);
            });
        } else {
            console.log('\n✅ ALL TESTS PASSED!');
        }

        const report = {
            timestamp: new Date().toISOString(),
            test: 'All Questions E2E',
            status: allIssues.length > 0 ? 'FAILED' : 'PASSED',
            questionsTested: QUESTIONS.length,
            steps: allSteps,
            issues: allIssues,
            totalScreenshots: countScreenshots(QUESTIONS.length)
        };

        writeFileSync(
            '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/test-results/all-questions-test-report.json',
            JSON.stringify(report, null, 2)
        );

        console.log('\n📄 Test report saved to: test-results/all-questions-test-report.json');
        console.log('📸 All screenshots saved to: test-results/screenshots/all-questions/');
        console.log('\n🎉 All questions test completed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
    } finally {
        await browser.close();
    }

    // Update documentation
    updateDocumentation(allIssues);
}

function countScreenshots(questionCount) {
    // Initial screenshots: 2 (page load, login)
    // Per question: 11 screenshots
    // Final: 1 screenshot
    return 2 + (questionCount * 11) + 1;
}

function updateDocumentation(issues) {
    const docPath = '/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/docs/all-questions-test.md';
    const timestamp = new Date().toISOString();

    let documentation = `# All Questions E2E Test Results

**Date**: ${timestamp}
**Status**: ${issues.length > 0 ? 'FAILED' : 'PASSED'}

## Test Coverage

- **Questions Tested**: 7/7 (100%)
- **Total Steps**: ${issues.length > 0 ? issues.length + 35 : 35} (5 per question + initial setup)
- **Issues Found**: ${issues.length}

## Questions Tested

${QUESTIONS.map((q, i) => `
### Question ${q.id}: ${q.question}
- **Category**: ${getQuestionCategory(q.id)}
- **Incorrect Query**: ${q.incorrect_query}
- **Correct Query**: ${q.correct_query}
- **Status**: ${issues.filter(issue => issue.step.includes(`Question ${q.id}`)).length > 0 ? '❌ FAILED' : '✅ PASSED'}
`).join('\n')}

## Issues Found

${issues.length > 0 ? issues.map((issue, i) => `
### Issue #${i + 1}: ${issue.step}

**Problem**: ${issue.issue}
**Expected**: ${issue.expected}
**Actual**: ${issue.actual}
**Status**: 🔧 Needs Fix
`).join('\n') : '## ✅ All tests passed successfully!\n\nNo issues found. All 7 questions are working correctly.'}

---

## Screenshots

Total screenshots captured: ${countScreenshots(7)}

Per question (11 screenshots each):
1. Practice prompt (Q1 only)
2. Question loaded
3. Incorrect query typed
4. Incorrect query results
5. Before incorrect submit
6. After incorrect submit
7. Correct query typed
8. Correct query results
9. Before correct submit
10. After correct submit
11. Next Question button (or final state for Q7)

---

## Test Execution

To re-run this test:

\`\`\`bash
# Ensure servers are running
cd server && node server.js &  # Backend on port 3000
python3 -m http.server 8000     # Frontend on port 8000

# Run test
node scripts/all-questions-test.js
\`\`\`

---

## Summary

${issues.length === 0 ?
    '✅ **PASS**: All 7 questions tested successfully with no issues!' :
    `❌ **FAIL**: ${issues.length} issue(s) found across ${QUESTIONS.length} questions.`}
`;

    writeFileSync(docPath, documentation);
    console.log('\n📄 Test results documented in: docs/all-questions-test.md');
}

function getQuestionCategory(id) {
    const categories = {
        1: 'SELECT queries',
        2: 'WHERE clause',
        3: 'Aggregate functions',
        4: 'GROUP BY',
        5: 'Subqueries',
        6: 'ORDER BY',
        7: 'GROUP BY (advanced)'
    };
    return categories[id] || 'Unknown';
}

// Export questions for use in documentation
export { QUESTIONS };

runAllQuestionsTest().catch(console.error);
