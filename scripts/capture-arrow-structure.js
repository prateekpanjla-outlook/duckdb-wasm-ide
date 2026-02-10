/**
 * Standalone script to capture Arrow structure from debug page
 * Usage: node scripts/capture-arrow-structure.js
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function captureArrowStructure() {
    console.log('🚀 Starting Arrow structure capture...\n');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect console messages
    const consoleMessages = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleMessages.push(text);
        console.log('[Browser]', text);
    });

    try {
        // Navigate to debug page
        console.log('📄 Loading debug page...');
        await page.goto('http://localhost:8000/debug-arrow.html', { waitUntil: 'networkidle' });

        // Wait for DuckDB initialization
        console.log('⏳ Waiting for DuckDB initialization (5s)...');
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'test-results/screenshots/arrow-capture-01-init.png' });

        // Wait for CSV data load
        console.log('⏳ Waiting for CSV data load (3s)...');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/screenshots/arrow-capture-02-csv-loaded.png' });

        // Click Auto-Run button
        console.log('🔘 Clicking Auto-Run button...');
        await page.click('button:has-text("Auto-Run All Tests")');

        // Wait for tests to complete
        console.log('⏳ Waiting for tests to complete (8s)...');
        await page.waitForTimeout(8000);
        await page.screenshot({ path: 'test-results/screenshots/arrow-capture-03-after-autorun.png' });

        // Capture all the data
        console.log('\n📊 Capturing results...');

        const progressLog = await page.locator('#progress-log').textContent();
        const arrowStructure = await page.locator('#arrow-structure').textContent();
        const schemaInfo = await page.locator('#schema-info').textContent();
        const batchesInfo = await page.locator('#batches-info').textContent();
        const formattedResult = await page.locator('#formatted-result').textContent();

        // Full page screenshot
        await page.screenshot({
            path: 'test-results/screenshots/arrow-capture-04-full-page.png',
            fullPage: true
        });

        // Save results to file
        const outputPath = 'test-results/arrow-debug-output.txt';
        const output = `
=== ARROW DEBUG OUTPUT ===
Generated: ${new Date().toISOString()}
Browser: Chromium
URL: http://localhost:8000/debug-arrow.html

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

=== ARROW STRUCTURE (first 8000 chars) ===
${arrowStructure.substring(0, 8000)}
`;

        writeFileSync(outputPath, output);
        console.log(`\n✅ Debug output saved to: ${outputPath}`);

        // Parse and display key information
        console.log('\n📋 KEY INFORMATION:');

        try {
            const parsed = JSON.parse(formattedResult);
            console.log(`Columns: ${parsed.columns.join(', ')}`);
            console.log(`Number of rows: ${parsed.rows.length}`);

            if (parsed.rows.length > 0) {
                console.log('\nFirst 3 rows:');
                parsed.rows.slice(0, 3).forEach((row, i) => {
                    console.log(`  Row ${i + 1}:`, JSON.stringify(row));
                });
            }
        } catch (e) {
            console.log('Could not parse formatted result:', e.message);
        }

        console.log('\n🎉 Capture complete!');
        console.log(`📸 Screenshots saved to: test-results/screenshots/`);
        console.log(`📄 Output saved to: ${outputPath}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await browser.close();
    }
}

// Run the capture
captureArrowStructure().catch(console.error);
