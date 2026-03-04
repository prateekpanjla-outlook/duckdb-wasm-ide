import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('User Registration Flow', () => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'testpass123';

    test.afterEach(async ({}) => {
        try {
            execSync(`sudo -u postgres psql -d duckdb_ide -c "DELETE FROM users WHERE email = '${testEmail}';"`, { stdio: 'ignore' });
            console.log(`✅ Cleaned up test user: ${testEmail}`);
        } catch (e) {
            console.log(`⚠️  Cleanup failed: ${testEmail}`);
        }
    });

    test('should register a new user and verify in database', async ({ page }) => {
        page.on('console', msg => {
            if (msg.text().includes('[APIClient]') || msg.text().includes('[AuthManager]')) {
                console.log('BROWSER:', msg.text());
            }
        });

        await page.goto('/');
        await page.waitForFunction(() => {
            const container = document.getElementById('appContainer');
            return container && container.style.pointerEvents === 'auto';
        }, { timeout: 15000 });

        console.log(`📧 Test email: ${testEmail}`);

        await page.click('#authBtn');
        await page.waitForTimeout(500);

        await expect(page.locator('#authTitle')).toContainText('Login');
        await page.click('#authToggleBtn');
        await expect(page.locator('#authTitle')).toContainText('Register');

        await page.fill('#authEmail', testEmail);
        await page.fill('#authPassword', testPassword);
        await page.screenshot({ path: 'test-results/screenshots/register-01-form-filled.png' });

        await page.click('.auth-submit-btn');
        await page.waitForTimeout(8000);

        await expect(page.locator('#authBtn')).toContainText(testEmail, { timeout: 10000 });
        console.log('✅ Registration successful - UI updated');

        const result = execSync(`sudo -u postgres psql -d duckdb_ide -t -c "SELECT email FROM users WHERE email = '${testEmail}';"`, { encoding: 'utf-8' });
        expect(result.trim()).toBe(testEmail);
        console.log(`✅ User found in database: ${result.trim()}`);

        await page.screenshot({ path: 'test-results/screenshots/register-02-after-registration.png' });
    });
});
