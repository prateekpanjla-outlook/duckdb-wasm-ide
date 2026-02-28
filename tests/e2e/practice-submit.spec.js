/**
 * E2E Test for Practice Mode Submit Functionality
 * Tests the complete flow of loading a question, submitting code, and receiving feedback
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8888';
const TEST_USER = {
    email: 'testuser@example.com',
    password: 'password123'
};

test.describe('Practice Mode Submit', () => {
    test.describe.configure({ timeout: 180000 }); // 3 minutes timeout
    test.beforeEach(async ({ page }) => {
        // Navigate to app
        await page.goto(BASE_URL);
        await page.waitForTimeout(5000);

        // Wait for app to be interactive
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 15000 });

        // Login
        await page.click('#authBtn');
        await page.waitForTimeout(1000);
        await page.fill('#authEmail', TEST_USER.email);
        await page.fill('#authPassword', TEST_USER.password);
        await page.click('.auth-submit-btn');
        await page.waitForTimeout(8000);
    });

    test('should show submit button when practice mode is active', async ({ page }) => {
        console.log('\n📝 Step 1: Loading a question to activate practice mode...');

        // Select and load a question
        await page.selectOption('#questionDropdown', { index: 1 });
        await page.click('#loadQuestionBtn');

        // Wait for practice mode to initialize and submit button to appear
        await page.waitForFunction(() => {
            const submitBtn = document.getElementById('submitPracticeBtn');
            return submitBtn !== null;
        }, { timeout: 10000 });

        // Verify submit button exists and is visible
        const submitBtn = page.locator('#submitPracticeBtn');
        await expect(submitBtn).toBeVisible();
        await expect(submitBtn).toHaveText(/✓ Submit Code/);

        // Verify show solution button also exists
        const solutionBtn = page.locator('#showSolutionBtn');
        await expect(solutionBtn).toBeVisible();

        console.log('✅ Submit button visible:', await submitBtn.textContent());

        await page.screenshot({ path: 'test-results/screenshots/submit-01-buttons-visible.png' });
    });

    test('should submit correct query and show success feedback', async ({ page }) => {
        console.log('\n📝 Step 2: Loading question and submitting correct solution...');

        // Select and load a question
        await page.selectOption('#questionDropdown', { index: 1 });
        await page.click('#loadQuestionBtn');
        await page.waitForTimeout(3000);

        // Question 1 is "Select all employees from the Engineering department"
        // Correct query: SELECT * FROM employees WHERE department = 'Engineering'
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue("SELECT * FROM employees WHERE department = 'Engineering'");
            }
        });

        await page.screenshot({ path: 'test-results/screenshots/submit-02-correct-query-typed.png' });

        // Submit the solution
        await page.click('#submitPracticeBtn');

        // Wait for feedback panel to be visible
        await page.waitForFunction(() => {
            const panel = document.getElementById('practiceFeedbackPanel');
            return panel && !panel.classList.contains('hidden');
        }, { timeout: 10000 });

        // Verify feedback panel is shown
        const feedbackPanel = page.locator('#practiceFeedbackPanel');
        await expect(feedbackPanel).toBeVisible();

        // Verify correct feedback is shown
        const feedbackMessage = page.locator('#feedbackMessage');
        await expect(feedbackMessage).toContainText('Correct');

        // Verify feedback panel has correct styling
        await expect(feedbackPanel).toHaveClass(/feedback-correct/);

        // Verify feedback icon
        const feedbackIcon = page.locator('#feedbackIcon');
        await expect(feedbackIcon).toContainText('✅');

        console.log('✅ Feedback shown for correct submission');

        await page.screenshot({ path: 'test-results/screenshots/submit-03-correct-feedback.png' });
    });

    test('should show next question button after correct submission', async ({ page }) => {
        console.log('\n📝 Step 3: Verifying next question button appears...');

        // Load and submit correct answer
        await page.selectOption('#questionDropdown', { index: 1 });
        await page.click('#loadQuestionBtn');
        await page.waitForTimeout(3000);

        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue("SELECT * FROM employees WHERE department = 'Engineering'");
            }
        });

        await page.click('#submitPracticeBtn');

        // Wait for feedback panel to be visible
        await page.waitForFunction(() => {
            const panel = document.getElementById('practiceFeedbackPanel');
            return panel && !panel.classList.contains('hidden');
        }, { timeout: 10000 });

        // Check for next question button
        const nextBtn = page.locator('#nextQuestionBtn');
        await expect(nextBtn).toBeVisible();
        await expect(nextBtn).toHaveText(/Next Question/);

        console.log('✅ Next Question button appeared');

        await page.screenshot({ path: 'test-results/screenshots/submit-04-next-question-button.png' });
    });

    test('should submit incorrect query and show error feedback', async ({ page }) => {
        console.log('\n📝 Step 4: Testing incorrect query submission...');

        // Load a question
        await page.selectOption('#questionDropdown', { index: 1 });
        await page.click('#loadQuestionBtn');
        await page.waitForTimeout(3000);

        // Type an incorrect query (wrong department)
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue("SELECT * FROM employees WHERE department = 'Sales'");
            }
        });

        await page.screenshot({ path: 'test-results/screenshots/submit-05-incorrect-query-typed.png' });

        // Submit the solution
        await page.click('#submitPracticeBtn');

        // Wait for feedback panel to be visible
        await page.waitForFunction(() => {
            const panel = document.getElementById('practiceFeedbackPanel');
            return panel && !panel.classList.contains('hidden');
        }, { timeout: 10000 });

        // Verify feedback panel is shown
        const feedbackPanel = page.locator('#practiceFeedbackPanel');
        await expect(feedbackPanel).toBeVisible();

        // Verify incorrect feedback is shown
        const feedbackMessage = page.locator('#feedbackMessage');
        await expect(feedbackMessage).toContainText(/Not quite right|Incorrect/);

        // Verify feedback panel has error styling
        await expect(feedbackPanel).toHaveClass(/feedback-incorrect/);

        // Verify error icon
        const feedbackIcon = page.locator('#feedbackIcon');
        await expect(feedbackIcon).toContainText('❌');

        console.log('✅ Incorrect feedback shown as expected');

        await page.screenshot({ path: 'test-results/screenshots/submit-06-incorrect-feedback.png' });
    });

    test('should show solution when requested', async ({ page }) => {
        console.log('\n💡 Step 5: Testing show solution functionality...');

        // Load a question
        await page.selectOption('#questionDropdown', { index: 1 });
        await page.click('#loadQuestionBtn');
        await page.waitForTimeout(3000);

        // Click show solution button
        await page.click('#showSolutionBtn');

        // Wait for solution panel to be visible
        await page.waitForFunction(() => {
            const panel = document.getElementById('practiceSolutionPanel');
            return panel && !panel.classList.contains('hidden');
        }, { timeout: 5000 });

        // Verify solution panel is shown
        const solutionPanel = page.locator('#practiceSolutionPanel');
        await expect(solutionPanel).toBeVisible();

        // Verify solution contains SQL code
        const solutionContent = page.locator('#practiceSolutionContent');
        await expect(solutionContent).toContainText(/SELECT/i);

        console.log('✅ Solution panel displayed');

        await page.screenshot({ path: 'test-results/screenshots/submit-07-solution-panel.png' });
    });

    test('should close solution panel when close button clicked', async ({ page }) => {
        console.log('\n📌 Step 6: Testing solution panel close functionality...');

        // Load a question and show solution
        await page.selectOption('#questionDropdown', { index: 1 });
        await page.click('#loadQuestionBtn');
        await page.waitForTimeout(3000);

        await page.click('#showSolutionBtn');

        // Wait for solution panel to be visible
        await page.waitForFunction(() => {
            const panel = document.getElementById('practiceSolutionPanel');
            return panel && !panel.classList.contains('hidden');
        }, { timeout: 5000 });

        // Click close button
        await page.click('.close-btn');

        // Wait for solution panel to be hidden
        await page.waitForFunction(() => {
            const panel = document.getElementById('practiceSolutionPanel');
            return panel && panel.classList.contains('hidden');
        }, { timeout: 3000 });

        // Verify solution panel is hidden
        const solutionPanel = page.locator('#practiceSolutionPanel');
        await expect(solutionPanel).toBeHidden();

        console.log('✅ Solution panel closed successfully');
    });

    test('should complete full practice workflow: load, solve, submit, next', async ({ page }) => {
        console.log('\n🎯 Step 7: Complete end-to-end practice workflow...');

        // Step 1: Load first question
        await page.selectOption('#questionDropdown', { index: 1 });
        await page.click('#loadQuestionBtn');
        await page.waitForTimeout(3000);
        console.log('   ✓ Question 1 loaded');

        // Step 2: Submit correct answer
        await page.evaluate(() => {
            const editor = document.querySelector('.CodeMirror');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue("SELECT * FROM employees WHERE department = 'Engineering'");
            }
        });

        await page.click('#submitPracticeBtn');

        // Wait for feedback
        await page.waitForFunction(() => {
            const panel = document.getElementById('practiceFeedbackPanel');
            return panel && !panel.classList.contains('hidden');
        }, { timeout: 10000 });

        // Verify success feedback
        const feedbackPanel = page.locator('#practiceFeedbackPanel');
        await expect(feedbackPanel).toBeVisible();
        await expect(feedbackPanel).toHaveClass(/feedback-correct/);
        console.log('   ✓ Correct answer submitted');

        // Step 3: Go to next question
        const nextBtn = page.locator('#nextQuestionBtn');
        await nextBtn.click();
        await page.waitForTimeout(5000);

        // Verify new question is loaded
        const questionText = page.locator('#practiceQuestionText');
        await expect(questionText).not.toBeEmpty();
        console.log('   ✓ Next question loaded');

        await page.screenshot({ path: 'test-results/screenshots/submit-08-workflow-complete.png', fullPage: true });
    });
});
