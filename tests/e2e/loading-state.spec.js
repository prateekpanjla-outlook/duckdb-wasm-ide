import { test, expect } from '@playwright/test';

/**
 * E2E Test: Loading State During DuckDB Initialization
 *
 * This test verifies that:
 * 1. The loading overlay is visible on page load
 * 2. The UI is blocked (disabled) during initialization
 * 3. The loading overlay disappears after DuckDB initializes
 * 4. The UI becomes interactive after initialization
 */

test.describe('DuckDB Loading State', () => {
    test('should show loading overlay and block UI during initialization', async ({ page }) => {
        // Navigate to app
        await page.goto('/');

        // Step 1: Verify loading overlay is visible initially
        await test.step('Loading overlay should be visible on page load', async () => {
            const loadingOverlay = page.locator('#loadingOverlay');
            await expect(loadingOverlay).toBeVisible();
            await page.screenshot({ path: 'test-results/screenshots/loading-01-overlay-visible.png' });
        });

        // Step 2: Verify UI is disabled during loading
        await test.step('UI should be disabled during loading', async () => {
            const appContainer = page.locator('#appContainer');

            // Check that container has reduced opacity
            const opacity = await appContainer.evaluate(el =>
                window.getComputedStyle(el).opacity
            );
            expect(opacity).toBe('0.5');

            // Check that pointer events are disabled
            const pointerEvents = await appContainer.evaluate(el =>
                window.getComputedStyle(el).pointerEvents
            );
            expect(pointerEvents).toBe('none');

            await page.screenshot({ path: 'test-results/screenshots/loading-02-ui-disabled.png' });
        });

        // Step 3: Verify loading message is displayed
        await test.step('Loading message should be displayed', async () => {
            const loadingMessage = page.locator('#loadingMessage');
            await expect(loadingMessage).toBeVisible();

            const messageText = await loadingMessage.textContent();
            expect(messageText).toContain('Initializing');

            await page.screenshot({ path: 'test-results/screenshots/loading-03-message.png' });
        });

        // Step 4: Wait for initialization to complete
        await test.step('Loading overlay should disappear after initialization', async () => {
            // Wait up to 10 seconds for loading to complete
            const loadingOverlay = page.locator('#loadingOverlay');

            await expect(async () => {
                const isVisible = await loadingOverlay.isVisible();
                expect(isVisible).toBe(false);
            }).toPass({
                timeout: 10000,
                intervals: [500, 1000]
            });

            await page.screenshot({ path: 'test-results/screenshots/loading-04-overlay-hidden.png' });
        });

        // Step 5: Verify UI is enabled after initialization
        await test.step('UI should be enabled after initialization', async () => {
            const appContainer = page.locator('#appContainer');

            // Check that container has full opacity
            const opacity = await appContainer.evaluate(el =>
                window.getComputedStyle(el).opacity
            );
            expect(opacity).toBe('1');

            // Check that pointer events are enabled
            const pointerEvents = await appContainer.evaluate(el =>
                window.getComputedStyle(el).pointerEvents
            );
            expect(pointerEvents).toBe('auto');

            // Verify interactive elements are enabled
            const runButton = page.locator('#runQueryBtn');
            await expect(runButton).toBeEnabled();

            await page.screenshot({ path: 'test-results/screenshots/loading-05-ui-enabled.png' });
        });

        // Step 6: Verify database status shows connected
        await test.step('Database status should show connected', async () => {
            const status = page.locator('#dbStatus');
            await expect(status).toContainText('Connected');
            await expect(status).toHaveClass(/connected/);

            await page.screenshot({ path: 'test-results/screenshots/loading-06-status-connected.png' });
        });

        // Step 7: Verify UI is fully interactive
        await test.step('UI should be fully interactive', async () => {
            // Try to click on file upload zone
            const dropZone = page.locator('#dropZone');
            await expect(dropZone).toBeVisible();
            await dropZone.click();

            // File input should be accessible
            const fileInput = page.locator('#fileInput');
            await expect(fileInput).toBeAttached();

            // Query editor should be visible
            const queryEditor = page.locator('#queryEditor');
            await expect(queryEditor).toBeVisible();

            await page.screenshot({ path: 'test-results/screenshots/loading-07-fully-interactive.png' });
        });
    });

    test('should complete initialization within reasonable time', async ({ page }) => {
        const startTime = Date.now();

        await page.goto('/');

        // Wait for loading overlay to disappear
        const loadingOverlay = page.locator('#loadingOverlay');
        await expect(async () => {
            const isVisible = await loadingOverlay.isVisible();
            expect(isVisible).toBe(false);
        }).toPass({
            timeout: 15000 // Should complete within 15 seconds
        });

        const endTime = Date.now();
        const initializationTime = endTime - startTime;

        console.log(`✅ Initialization completed in ${initializationTime}ms`);

        // Initialization should complete in reasonable time
        expect(initializationTime).toBeLessThan(15000);

        // Save timing information
        const fs = await import('fs');
        const timingData = {
            timestamp: new Date().toISOString(),
            initializationTimeMs: initializationTime,
            initializationTimeSeconds: (initializationTime / 1000).toFixed(2)
        };
        fs.writeFileSync(
            'test-results/loading-performance.json',
            JSON.stringify(timingData, null, 2)
        );
    });

    test('should show correct loading messages', async ({ page }) => {
        await page.goto('/');

        // Capture initial loading message
        const loadingMessage = page.locator('#loadingMessage');
        const initialMessage = await loadingMessage.textContent();

        expect(initialMessage).toMatch(/initializing|loading|duckdb/i);
        console.log(`Loading message: "${initialMessage}"`);

        await page.screenshot({ path: 'test-results/screenshots/loading-message.png' });
    });
});
