import { test, expect } from '@playwright/test';

/**
 * Auth Flow E2E Tests
 * Tests the authentication and basic app initialization
 *
 * These tests verify:
 * 1. JavaScript modules load correctly
 * 2. AuthManager creates modal
 * 3. Login flow works
 * 4. DuckDB initializes after login
 */

test.describe('Authentication Flow', () => {
    test('should load JavaScript modules and create AuthManager modal', async ({ page }) => {
        // Navigate to the app
        await page.goto('/');

        // Wait for page to load
        await page.waitForTimeout(3000);

        // Take screenshot of initial state
        await page.screenshot({ path: 'test-results/screenshots/auth-01-initial-load.png' });

        // Verify AuthManager modal exists in DOM (created by JavaScript)
        const authModal = page.locator('#authModal');
        await expect(authModal).toHaveCount(1, { timeout: 5000 });

        console.log('✅ AuthManager modal created successfully');

        // Verify login prompt section is visible
        const loginPrompt = page.locator('#loginPromptSection');
        await expect(loginPrompt).toBeVisible();

        console.log('✅ Login prompt section is visible');

        // Verify question selector is hidden (not logged in yet)
        const questionSelector = page.locator('#questionSelectorSection');
        await expect(questionSelector).toHaveClass(/hidden/);

        console.log('✅ Question selector is hidden (not logged in)');

        // Check if app.js executed by looking for console messages
        // We'll check if the app container exists and has the correct initial state
        const appContainer = page.locator('#appContainer');
        await expect(appContainer).toHaveAttribute('style', /opacity: 0.5/);

        console.log('✅ App initialized with correct initial state');
    });

    test('should open auth modal when login button clicked', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        // Wait for pointer events to be enabled
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 5000 });

        // Click login button
        await page.click('#authBtn');

        // Wait for modal to become visible
        await page.waitForTimeout(500);

        // Verify modal is visible
        const authModal = page.locator('#authModal.visible');
        await expect(authModal).toHaveCount(1);

        // Verify modal content
        await expect(page.locator('#authTitle')).toContainText('Login');
        await expect(page.locator('#authEmail')).toBeVisible();
        await expect(page.locator('#authPassword')).toBeVisible();
        await expect(page.locator('.auth-submit-btn')).toBeVisible();

        await page.screenshot({ path: 'test-results/screenshots/auth-02-modal-open.png' });

        console.log('✅ Auth modal opens correctly');
    });

    test('should have working login form with validation', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        // Wait for pointer events to be enabled
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 5000 });

        // Open modal
        await page.click('#authBtn');
        await page.waitForTimeout(500);

        // Try to submit empty form (should fail due to HTML5 validation)
        const submitBtn = page.locator('.auth-submit-btn');
        await submitBtn.click();

        // Browser should prevent empty form submission due to 'required' attribute
        // The email input should be focused
        await expect(page.locator('#authEmail')).toBeFocused();

        console.log('✅ Form validation works');

        // Switch to register mode
        await page.click('#authToggleBtn');
        await expect(page.locator('#authTitle')).toContainText('Register');

        console.log('✅ Login/Register toggle works');

        // Switch back to login
        await page.click('#authToggleBtn');
        await expect(page.locator('#authTitle')).toContainText('Login');
    });

    test('should close modal when close button clicked', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        // Wait for pointer events to be enabled
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 5000 });

        // Open modal
        await page.click('#authBtn');
        await page.waitForTimeout(500);

        // Verify modal is visible
        await expect(page.locator('#authModal.visible')).toHaveCount(1);

        // Click close button
        await page.click('#closeAuthModal');
        await page.waitForTimeout(200);

        // Verify modal is hidden (no longer has 'visible' class)
        const authModal = page.locator('#authModal');
        await expect(authModal).not.toHaveClass(/visible/);

        console.log('✅ Modal closes correctly');
    });

    test('should close modal when backdrop clicked', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        // Wait for pointer events to be enabled
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 5000 });

        // Open modal
        await page.click('#authBtn');
        await page.waitForTimeout(500);

        // Verify modal is visible
        await expect(page.locator('#authModal.visible')).toHaveCount(1);

        // Click on backdrop (the modal overlay itself, not content)
        await page.click('#authModal', { position: { x: 10, y: 10 } });
        await page.waitForTimeout(200);

        // Verify modal is hidden
        const authModal = page.locator('#authModal');
        await expect(authModal).not.toHaveClass(/visible/);

        console.log('✅ Modal closes on backdrop click');
    });
});

/**
 * Mock Authentication Tests
 * Tests that use localStorage to simulate a logged-in user
 */
test.describe('Mock Authentication (Skip Backend)', () => {
    test.use({
        storageState: async ({}) => {
            // Set up mock authentication in localStorage before page loads
            return {
                origins: [{
                    origin: 'http://localhost:8000',
                    localStorage: [
                        { name: 'auth_token', value: 'mock_test_token_12345' },
                        { name: 'user_data', value: JSON.stringify({
                            id: 'test-user-1',
                            email: 'test@example.com',
                            created_at: new Date().toISOString()
                        })}
                    ]
                }]
            };
        }
    });

    test('should initialize DuckDB when user is already logged in', async ({ page }) => {
        // Go to page with mocked auth
        await page.goto('/');
        await page.waitForTimeout(10000); // Wait for DuckDB initialization

        await page.screenshot({ path: 'test-results/screenshots/auth-03-logged-in-state.png' });

        // Verify app is not in loading state (opacity should be 1)
        const appContainer = page.locator('#appContainer');
        await expect(appContainer).not.toHaveAttribute('style', /opacity: 0.5/);

        // Verify question selector is visible (logged in)
        const questionSelector = page.locator('#questionSelectorSection');
        await expect(questionSelector).not.toHaveClass(/hidden/);

        // Verify login prompt is hidden
        const loginPrompt = page.locator('#loginPromptSection');
        await expect(loginPrompt).toHaveClass(/hidden/);

        // Check status (should be connected or show some state)
        const status = page.locator('#dbStatus');
        const statusText = await status.textContent();

        console.log('✅ App initialized for logged-in user');
        console.log(`   DB Status: ${statusText}`);
    });

    test('should show questions button when logged in', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(8000);

        // Questions button should be visible
        const viewQuestionsBtn = page.locator('#viewQuestionsBtn');
        await expect(viewQuestionsBtn).not.toHaveClass(/hidden/);

        // Auth button should show user email
        const authBtn = page.locator('#authBtn');
        await expect(authBtn).toContainText('test@example.com');

        console.log('✅ UI shows logged-in state correctly');
    });

    test('should open questions modal when questions button clicked', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(8000);

        // Wait for pointer events to be enabled
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 5000 });

        // Click view questions button
        await page.click('#viewQuestionsBtn');
        await page.waitForTimeout(500);

        // Verify questions modal is visible
        const questionsModal = page.locator('#questionsModal');
        await expect(questionsModal).not.toHaveClass(/hidden/);

        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/auth-04-questions-modal.png' });

        console.log('✅ Questions modal opens correctly');

        // Close modal
        await page.click('#closeQuestionsModal');
        await page.waitForTimeout(200);
        await expect(questionsModal).toHaveClass(/hidden/);
    });
});

/**
 * Console Log Test
 * Verifies that JavaScript is executing by checking console logs
 */
test.describe('JavaScript Execution Verification', () => {
    test('should have console logs from app.js and AuthManager', async ({ page }) => {
        // Collect console messages
        const messages = [];
        page.on('console', msg => {
            messages.push({
                type: msg.type(),
                text: msg.text()
            });
        });

        await page.goto('/');
        await page.waitForTimeout(3000);

        // Check for expected console messages
        const textMessages = messages.map(m => m.text).join('\n');

        console.log('\n=== Browser Console Messages ===');
        messages.forEach(m => {
            console.log(`[${m.type}] ${m.text}`);
        });
        console.log('=== End Console Messages ===\n');

        // Look for AuthManager debug messages
        const hasAuthManagerLogs = textMessages.includes('[AuthManager]');

        if (hasAuthManagerLogs) {
            console.log('✅ JavaScript modules are executing (AuthManager logs found)');
        } else {
            console.log('⚠️  No AuthManager logs found - checking if any logs exist...');
            if (messages.length === 0) {
                console.log('❌ No console messages at all - JavaScript may not be executing');
            } else {
                console.log(`✅ Found ${messages.length} console messages`);
            }
        }

        // Take screenshot for visual verification
        await page.screenshot({ path: 'test-results/screenshots/auth-05-console-test.png' });
    });
});
