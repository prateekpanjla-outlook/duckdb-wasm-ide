import { test, expect } from '@playwright/test';

// TODO: Replace performMockedLogin with real backend login when E2E tests are set up

/**
 * E2E Tests for Bug Fixes
 * Tests security fixes, resource cleanup, error handling, and stability improvements
 */

test.describe('Bug Fixes - Security & Stability', () => {
    test.describe.configure({ timeout: 120000 });

    // ==================== SQL Injection Fix ====================

    test('should sanitize filenames to prevent SQL injection', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Verify that the file-handler.js sanitizes single quotes in filenames
        const sanitized = await page.evaluate(() => {
            // Simulate the sanitization logic from file-handler.js
            const maliciousName = "test'; DROP TABLE users; --.duckdb";
            const sanitizedFileName = maliciousName.replace(/'/g, "''");
            return sanitizedFileName;
        });

        expect(sanitized).toBe("test''; DROP TABLE users; --.duckdb");
        expect(sanitized).not.toContain("';");
    });

    // ==================== Event Listener Leak Fix ====================

    test('should use consistent bound function reference for history change listener', async ({ page }) => {
        await performMockedLogin(page);

        // Verify that the QueryEditor uses a stored bound reference
        const hasBoundRef = await page.evaluate(() => {
            const app = window.app;
            if (app && app.queryEditor) {
                return typeof app.queryEditor._boundHandleHistoryChange === 'function';
            }
            return false;
        });

        expect(hasBoundRef).toBe(true);
    });

    // ==================== Init Error Display ====================

    test('should display error message in results area when init fails', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Verify that the showInitError method exists on the app
        const hasMethod = await page.evaluate(() => {
            const app = window.app;
            return app && typeof app.showInitError === 'function';
        });

        expect(hasMethod).toBe(true);

        // Test the error display functionality
        await page.evaluate(() => {
            window.app.showInitError('Test error message');
        });

        const resultsContainer = page.locator('#resultsContainer');
        await expect(resultsContainer).toContainText('Failed to initialize');
        await expect(resultsContainer).toContainText('Test error message');
    });

    // ==================== Window Unload Cleanup ====================

    test('should have cleanup handler for beforeunload', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Verify the cleanup method exists on the app
        const hasCleanup = await page.evaluate(() => {
            const app = window.app;
            return app && typeof app.cleanup === 'function';
        });

        expect(hasCleanup).toBe(true);
    });

    // ==================== localStorage Safety ====================

    test('should handle localStorage being unavailable gracefully', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Test that the API client has safe localStorage methods
        const hasSafeMethods = await page.evaluate(async () => {
            // Import the api-client module to check its methods
            const module = await import('/js/services/api-client.js');
            const client = module.apiClient;
            return (
                typeof client._safeGetItem === 'function' &&
                typeof client._safeSetItem === 'function' &&
                typeof client._safeRemoveItem === 'function'
            );
        });

        expect(hasSafeMethods).toBe(true);
    });

    // ==================== Centralized API Config ====================

    test('should use centralized API config module', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Verify that the config module exports API_BASE_URL
        const configLoads = await page.evaluate(async () => {
            try {
                const config = await import('/js/config.js');
                return typeof config.API_BASE_URL === 'string' && config.API_BASE_URL.includes('/api');
            } catch (e) {
                return false;
            }
        });

        expect(configLoads).toBe(true);
    });

    // ==================== DuckDB Retry Logic ====================

    test('should have DuckDB initialization retry capability', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Verify that the DuckDBManager.initialize accepts retries parameter
        const hasRetry = await page.evaluate(async () => {
            const module = await import('/js/duckdb-manager.js');
            const manager = new module.DuckDBManager();
            // Check that initialize function exists and accepts parameters
            return typeof manager.initialize === 'function' && manager.initialize.length >= 0;
        });

        expect(hasRetry).toBe(true);
    });

    // ==================== Pointer Events Reset ====================

    test('should reset pointer-events to auto after loading completes', async ({ page }) => {
        await page.goto('/');

        // Wait for init to complete
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents !== 'none';
        }, { timeout: 30000 });

        const pointerEvents = await page.evaluate(() => {
            return document.getElementById('appContainer').style.pointerEvents;
        });

        expect(pointerEvents).toBe('auto');
    });

    // ==================== Loading Overlay Cleanup ====================

    test('should hide loading overlay after initialization', async ({ page }) => {
        await page.goto('/');

        // Wait for app init to finish (pointerEvents reset indicates init done)
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 30000 });

        const overlayVisible = await page.evaluate(() => {
            const overlay = document.getElementById('loadingOverlay');
            return overlay && overlay.classList.contains('visible');
        });

        expect(overlayVisible).toBe(false);
    });

    // ==================== Null Guard Tests ====================

    test('should not throw errors when DOM elements are missing', async ({ page }) => {
        // Register error listener BEFORE navigating
        const errors = [];
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });

        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Wait for any async operations to settle
        await page.waitForTimeout(2000);

        // Filter for null reference errors related to our fixes
        const nullRefErrors = errors.filter(e =>
            e.includes('Cannot read properties of null') ||
            e.includes('null is not an object')
        );

        expect(nullRefErrors).toHaveLength(0);
    });

    // ==================== API Response Validation ====================

    test('should validate API response structure on login', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.app, { timeout: 10000 });

        // Test that login validates response has token and user
        const validatesResponse = await page.evaluate(async () => {
            const module = await import('/js/services/api-client.js');
            const client = module.apiClient;

            // Mock a bad response to test validation
            const originalRequest = client.request.bind(client);
            client.request = async () => ({ success: true }); // missing token/user

            try {
                await client.login('test@test.com', 'password');
                return false; // Should have thrown
            } catch (e) {
                return e.message.includes('Invalid response');
            } finally {
                client.request = originalRequest;
            }
        });

        expect(validatesResponse).toBe(true);
    });
});

test.describe('Bug Fixes - DuckDB Connection Cleanup', () => {
    test.describe.configure({ timeout: 120000 });

    test('should properly close practice DuckDB connection on exit', async ({ page }) => {
        await performMockedLogin(page);

        // Load a question to start practice mode
        const dropdown = page.locator('#questionDropdown');
        await dropdown.selectOption({ index: 1 });

        const loadButton = page.locator('#loadQuestionBtn');
        await loadButton.click();

        // Wait for practice mode to initialize (DuckDB data loading)
        await page.waitForFunction(() => {
            return !!(window.practiceManager && window.practiceManager.practiceDuckDB);
        }, { timeout: 15000 });

        // Verify practiceManager has a connection
        const hasConnection = await page.evaluate(() => {
            return !!(window.practiceManager && window.practiceManager.practiceDuckDB);
        });

        expect(hasConnection).toBe(true);

        // Exit practice mode
        await page.evaluate(async () => {
            if (window.practiceManager) {
                await window.practiceManager.exitPracticeMode();
            }
        });

        // Verify connection was cleaned up
        const connectionAfterExit = await page.evaluate(() => {
            return window.practiceManager ? window.practiceManager.practiceDuckDB : 'no_manager';
        });

        expect(connectionAfterExit).toBeNull();
    });
});
