import { test, expect } from '@playwright/test';

/**
 * Debug Test - App Initialization
 * This test captures the state of the app when it first loads
 */

test('debug: capture initial app state', async ({ page }) => {
    // Collect all console messages and errors
    const consoleMessages = [];
    const errors = [];

    page.on('console', msg => {
        consoleMessages.push({
            type: msg.type(),
            text: msg.text()
        });
    });

    page.on('pageerror', error => {
        errors.push({
            message: error.message,
            stack: error.stack
        });
    });

    page.on('requestfailed', request => {
        console.log(`[FAILED REQUEST] ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Navigate to the app
    await page.goto('/');

    // Wait a bit for initialization
    await page.waitForTimeout(5000);

    // Take a screenshot
    await page.screenshot({ path: 'test-results/screenshots/debug-01-initial-state.png', fullPage: true });

    // Check console messages
    console.log('\n=== Console Messages ===');
    consoleMessages.forEach(msg => {
        console.log(`[${msg.type}] ${msg.text}`);
    });

    // Check for errors
    console.log('\n=== Page Errors ===');
    if (errors.length > 0) {
        errors.forEach(err => {
            console.log(`ERROR: ${err.message}`);
            if (err.stack) console.log(`Stack: ${err.stack}`);
        });
    } else {
        console.log('No errors detected');
    }

    // Check the state of key elements
    const loadingOverlayVisible = await page.locator('#loadingOverlay.visible').count() > 0;
    const appContainer = page.locator('#appContainer');
    const appOpacity = await appContainer.evaluate(el => el.style.opacity);
    const appPointerEvents = await appContainer.evaluate(el => el.style.pointerEvents);

    console.log('\n=== Element States ===');
    console.log(`Loading Overlay Visible: ${loadingOverlayVisible}`);
    console.log(`App Container Opacity: ${appOpacity}`);
    console.log(`App Container Pointer Events: ${appPointerEvents}`);

    // Check if AuthManager modal was created
    const authModalExists = await page.locator('#authModal').count() > 0;
    console.log(`Auth Modal Exists: ${authModalExists}`);

    // Check if login button is visible
    const authBtnVisible = await page.locator('#authBtn').isVisible();
    console.log(`Auth Button Visible: ${authBtnVisible}`);

    // Try to manually hide loading overlay (workaround)
    console.log('\n=== Attempting Manual Fix ===');
    await page.evaluate(() => {
        const overlay = document.getElementById('loadingOverlay');
        const appContainer = document.getElementById('appContainer');
        if (overlay) overlay.classList.remove('visible');
        if (appContainer) {
            appContainer.style.opacity = '1';
            appContainer.style.pointerEvents = 'auto';
        }
    });

    // Take another screenshot after manual fix
    await page.screenshot({ path: 'test-results/screenshots/debug-02-after-manual-fix.png' });

    // Now try to click the login button
    try {
        await page.click('#authBtn', { timeout: 5000 });
        console.log('✅ Successfully clicked login button after manual fix');

        // Wait and take screenshot
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/screenshots/debug-03-modal-open.png' });

        // Check if modal is visible
        const modalVisible = await page.locator('#authModal.visible').count() > 0;
        console.log(`Modal Visible: ${modalVisible}`);
    } catch (error) {
        console.log(`❌ Failed to click login button: ${error.message}`);
    }
});
