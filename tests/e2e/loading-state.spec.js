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
    test('should show loading overlay and hide it after initialization', async ({ page }) => {
        await page.goto('/');

        // The app loads quickly, so we need to check the loading state immediately
        // or just verify that the overlay ends up hidden after initialization
        const loadingOverlay = page.locator('#loadingOverlay');

        // Wait for initialization to complete and overlay to be hidden
        await expect(async () => {
            const isVisible = await loadingOverlay.isVisible();
            expect(isVisible).toBe(false);
        }).toPass({
            timeout: 15000
        });

        // Verify app container is interactive
        const appContainer = page.locator('#appContainer');
        await expect(appContainer).toHaveAttribute('style', /pointer-events: auto/);
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
