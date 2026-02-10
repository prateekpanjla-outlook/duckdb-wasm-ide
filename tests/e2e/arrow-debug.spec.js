import { test, expect } from '@playwright/test';

/**
 * Arrow Structure Debug Test
 * Captures screenshots and console logs to debug Arrow result formatting
 *
 * Purpose: Investigate why SHOW TABLES returns "115" instead of table names
 */

test('Arrow Debug: Capture structure after data load', async ({ page }) => {
    // Navigate to debug page
    await page.goto('/debug-arrow.html');

    // Wait for page load
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/screenshots/arrow-01-initial-load.png' });

    // Wait for DuckDB initialization (5 seconds)
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-results/screenshots/arrow-02-after-init.png' });

    // Wait for CSV data to load (additional time)
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/screenshots/arrow-03-after-csv-load.png' });

    // Capture console messages
    const consoleMessages = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleMessages.push(text);
        console.log('Browser Console:', text);
    });

    // Click Auto-Run button
    await page.click('button:has-text("Auto-Run All Tests")');

    // Wait for tests to run
    await page.waitForTimeout(8000);
    await page.screenshot({ path: 'test-results/screenshots/arrow-04-after-autorun.png' });

    // Get the progress log content
    const progressLog = await page.locator('#progress-log').textContent();
    console.log('\n=== AUTO-RUN PROGRESS LOG ===');
    console.log(progressLog);
    console.log('=== END PROGRESS LOG ===\n');

    // Get the Arrow structure
    const arrowStructure = await page.locator('#arrow-structure').textContent();
    console.log('\n=== ARROW STRUCTURE (first 2000 chars) ===');
    console.log(arrowStructure.substring(0, 2000));
    console.log('=== END ARROW STRUCTURE ===\n');

    // Get the formatted result
    const formattedResult = await page.locator('#formatted-result').textContent();
    console.log('\n=== FORMATTED RESULT ===');
    console.log(formattedResult);
    console.log('=== END FORMATTED RESULT ===\n');

    // Get schema info
    const schemaInfo = await page.locator('#schema-info').textContent();
    console.log('\n=== SCHEMA INFO ===');
    console.log(schemaInfo.substring(0, 1500));
    console.log('=== END SCHEMA INFO ===\n');

    // Get batches info
    const batchesInfo = await page.locator('#batches-info').textContent();
    console.log('\n=== BATCHES INFO (first 2000 chars) ===');
    console.log(batchesInfo.substring(0, 2000));
    console.log('=== END BATCHES INFO ===\n');

    // Final screenshot
    await page.screenshot({ path: 'test-results/screenshots/arrow-05-final.png', fullPage: true });

    // Save all console messages to a file (for analysis)
    const fs = await import('fs');
    const outputPath = 'test-results/arrow-debug-output.txt';
    fs.writeFileSync(outputPath, `
=== ARROW DEBUG OUTPUT ===
Generated: ${new Date().toISOString()}

=== AUTO-RUN PROGRESS ===
${progressLog}

=== CONSOLE MESSAGES ===
${consoleMessages.join('\n')}

=== FORMATTED RESULT ===
${formattedResult}

=== SCHEMA INFO ===
${schemaInfo}

=== BATCHES INFO ===
${batchesInfo}

=== ARROW STRUCTURE ===
${arrowStructure.substring(0, 5000)}
`);

    console.log(`\n✅ Debug output saved to: ${outputPath}`);
});

test('Arrow Debug: Step by step analysis', async ({ page }) => {
    await page.goto('/debug-arrow.html');
    await page.waitForLoadState('networkidle');

    // Wait for init and CSV load
    await page.waitForTimeout(8000);

    // Test 1: SHOW TABLES specifically
    await page.click('button:has-text("Test SHOW TABLES")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/screenshots/arrow-debug-show-tables.png' });

    // Get the result
    const formattedResult = await page.locator('#formatted-result').textContent();
    console.log('\n=== SHOW TABLES FORMATTED RESULT ===');
    console.log(formattedResult);
    console.log('====================================\n');

    // Get the raw Arrow structure for SHOW TABLES
    const arrowStructure = await page.locator('#arrow-structure').textContent();
    console.log('\n=== SHOW TABLES ARROW STRUCTURE (first 3000 chars) ===');
    console.log(arrowStructure.substring(0, 3000));
    console.log('=====================================================\n');

    // Extract key information
    const result = JSON.parse(formattedResult);
    console.log('\n=== ANALYSIS ===');
    console.log('Columns:', result.columns);
    console.log('Number of rows:', result.rows.length);
    console.log('First row:', result.rows[0]);
    console.log('================\n');
});
