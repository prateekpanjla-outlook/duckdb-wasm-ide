import { test, expect } from '@playwright/test';

const BASE_URL = process.env.CLOUD_URL || 'https://duckdb-ide-192834930119.us-central1.run.app';
const API = `${BASE_URL}/api`;
const TEST_PASSWORD = 'cloudtest1234';

// Helper: wait for app to finish initializing
async function waitForAppReady(page) {
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
}

// Helper: register a unique user via API and inject tokens into page
async function loginViaAPI(page, request) {
    const email = `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
    const resp = await request.post(`${API}/auth/register`, {
        data: { email, password: TEST_PASSWORD }
    });
    const data = await resp.json();

    await page.evaluate((authData) => {
        localStorage.setItem('auth_token', authData.token);
        localStorage.setItem('user_data', JSON.stringify(authData.user));
    }, data);
    await page.reload();
    await waitForAppReady(page);
    return { email, ...data };
}

test.describe('Cloud Run Deployment — Infrastructure', () => {

    test('health endpoint returns ok', async ({ request }) => {
        const resp = await request.get(`${BASE_URL}/health`);
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        expect(body.status).toBe('ok');
    });

    test('database connectivity via health/db', async ({ request }) => {
        const resp = await request.get(`${BASE_URL}/health/db`);
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        expect(body.status).toBe('ok');
        expect(body.db).toBe('connected');
        expect(body.host).toContain('/cloudsql/');
    });

    test('serves index.html with correct security headers', async ({ request }) => {
        const resp = await request.get(`${BASE_URL}/`);
        expect(resp.ok()).toBeTruthy();
        const headers = resp.headers();
        expect(headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
        expect(headers['content-security-policy']).toContain("'wasm-unsafe-eval'");
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    test('serves pre-compressed WASM with gzip', async ({ request }) => {
        const resp = await request.get(`${BASE_URL}/libs/duckdb-wasm/duckdb-eh.wasm`, {
            headers: { 'Accept-Encoding': 'gzip' }
        });
        expect(resp.ok()).toBeTruthy();
        const headers = resp.headers();
        expect(headers['content-type']).toBe('application/wasm');
        expect(headers['content-encoding']).toBe('gzip');
    });

    test('static assets have cache headers', async ({ request }) => {
        const resp = await request.get(`${BASE_URL}/libs/duckdb-wasm/duckdb-eh.wasm`, {
            headers: { 'Accept-Encoding': 'gzip' }
        });
        const cacheControl = resp.headers()['cache-control'];
        expect(cacheControl).toContain('max-age=');
        expect(cacheControl).toContain('immutable');
    });

    test('SPA fallback serves index.html for unknown routes', async ({ request }) => {
        const resp = await request.get(`${BASE_URL}/nonexistent-page`);
        expect(resp.ok()).toBeTruthy();
        const text = await resp.text();
        expect(text).toContain('DuckDB');
    });

    test('API 404 for unknown API routes', async ({ request }) => {
        const resp = await request.get(`${API}/nonexistent`);
        expect(resp.status()).toBe(404);
        const body = await resp.json();
        expect(body.error).toBe('Route not found');
    });
});

test.describe('Cloud Run Deployment — Auth', () => {

    test('register new user', async ({ request }) => {
        const email = `cloud_reg_${Date.now()}@test.com`;
        const resp = await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        expect(body.user.email).toBe(email);
        expect(body.token).toBeTruthy();
    });

    test('reject duplicate registration', async ({ request }) => {
        const email = `cloud_dup_${Date.now()}@test.com`;
        await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        const resp = await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        expect(resp.status()).toBe(409);
    });

    test('login with valid credentials', async ({ request }) => {
        const email = `cloud_login_${Date.now()}@test.com`;
        await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        const resp = await request.post(`${API}/auth/login`, {
            data: { email, password: TEST_PASSWORD }
        });
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        expect(body.token).toBeTruthy();
        expect(body.user.email).toBe(email);
    });

    test('reject login with wrong password', async ({ request }) => {
        const email = `cloud_wrongpw_${Date.now()}@test.com`;
        await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        const resp = await request.post(`${API}/auth/login`, {
            data: { email, password: 'wrongpassword' }
        });
        expect(resp.ok()).toBeFalsy();
    });

    test('reject access to protected route without token', async ({ request }) => {
        const resp = await request.get(`${API}/practice/questions`);
        expect(resp.status()).toBe(401);
    });

    test('access protected route with valid token', async ({ request }) => {
        const email = `cloud_auth_${Date.now()}@test.com`;
        const reg = await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        const { token } = await reg.json();
        const resp = await request.get(`${API}/practice/questions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        expect(resp.ok()).toBeTruthy();
    });
});

test.describe('Cloud Run Deployment — Questions & Practice', () => {

    test('questions are seeded (at least 7)', async ({ request }) => {
        const email = `cloud_qs_${Date.now()}@test.com`;
        const reg = await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        const { token } = await reg.json();
        const resp = await request.get(`${API}/practice/questions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const body = await resp.json();
        expect(body.questions.length).toBeGreaterThanOrEqual(7);
    });

    test('questions have required fields', async ({ request }) => {
        const email = `cloud_qf_${Date.now()}@test.com`;
        const reg = await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        const { token } = await reg.json();
        const resp = await request.get(`${API}/practice/questions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { questions } = await resp.json();
        for (const q of questions) {
            expect(q.id).toBeTruthy();
            expect(q.sql_question).toBeTruthy();
            expect(q.difficulty).toBeTruthy();
            expect(q.category).toBeTruthy();
        }
    });
});

test.describe('Cloud Run Deployment — UI Integration', () => {

    test('homepage loads and shows login prompt', async ({ page }) => {
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await expect(page.locator('#loginPromptSection')).toBeVisible({ timeout: 15000 });
    });

    test('register via UI and see question dropdown', async ({ page }) => {
        await page.goto(BASE_URL);
        await waitForAppReady(page);

        // Open auth modal
        await page.click('#loginPromptBtn', { force: true });
        await expect(page.locator('#authModal')).toHaveClass(/visible/, { timeout: 10000 });

        // Switch to register
        await page.click('#authToggleBtn');

        // Fill and submit
        const email = `cloud_ui_${Date.now()}@test.com`;
        await page.fill('#authEmail', email);
        await page.fill('#authPassword', TEST_PASSWORD);
        await page.click('.auth-submit-btn');

        // Modal closes, user is logged in
        await expect(page.locator('#authModal')).not.toHaveClass(/visible/, { timeout: 30000 });
        await expect(page.locator('#authBtn')).toContainText(email, { timeout: 10000 });

        // Question dropdown populates
        await page.waitForFunction(() => {
            const dd = document.getElementById('questionDropdown');
            return dd && dd.options.length > 1;
        }, { timeout: 30000 });
        const count = await page.locator('#questionDropdown option').count();
        expect(count).toBeGreaterThan(1);
    });

    test('DuckDB WASM initializes and executes query', async ({ page, request }) => {
        test.setTimeout(180000);

        await page.goto(BASE_URL);
        const { token } = await loginViaAPI(page, request);

        // Wait for DuckDB to connect
        await page.waitForSelector('.status.connected', { timeout: 150000 });

        // Set query via CodeMirror or fallback textarea
        await page.evaluate(() => {
            const cm = document.querySelector('.CodeMirror');
            if (cm && cm.CodeMirror) {
                cm.CodeMirror.setValue('SELECT 42 as cloud_test');
            } else {
                document.getElementById('sqlEditor').value = 'SELECT 42 as cloud_test';
            }
        });

        await page.click('#runQueryBtn');

        // Verify result
        await page.waitForSelector('#resultsContainer table', { timeout: 30000 });
        const cellText = await page.locator('#resultsContainer table td').first().textContent();
        expect(cellText.trim()).toBe('42');
    });

    test('selecting a question loads data into DuckDB and shows info', async ({ page, request }) => {
        test.setTimeout(180000);

        await page.goto(BASE_URL);
        await loginViaAPI(page, request);

        // Wait for DuckDB + questions
        await page.waitForSelector('.status.connected', { timeout: 150000 });
        await page.waitForFunction(() => {
            const dd = document.getElementById('questionDropdown');
            return dd && dd.options.length > 1;
        }, { timeout: 30000 });

        // Select first question
        await page.locator('#questionDropdown').selectOption({ index: 1 });
        await expect(page.locator('#selectedQuestionInfo')).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Cloud Run Deployment — Security', () => {

    test('rate limiter responds after many requests', async ({ request }) => {
        // Send 5 rapid requests — all should succeed (well under 100/15min limit)
        for (let i = 0; i < 5; i++) {
            const resp = await request.get(`${BASE_URL}/health`);
            expect(resp.ok()).toBeTruthy();
        }
    });

    test('rejects invalid JSON body', async ({ request }) => {
        const resp = await request.post(`${API}/auth/register`, {
            headers: { 'Content-Type': 'application/json' },
            data: 'not-json{'
        });
        expect(resp.ok()).toBeFalsy();
    });

    test('rejects registration with invalid email', async ({ request }) => {
        const resp = await request.post(`${API}/auth/register`, {
            data: { email: 'not-an-email', password: TEST_PASSWORD }
        });
        expect(resp.ok()).toBeFalsy();
    });

    test('rejects registration with short password', async ({ request }) => {
        const resp = await request.post(`${API}/auth/register`, {
            data: { email: `short_${Date.now()}@test.com`, password: '12' }
        });
        expect(resp.ok()).toBeFalsy();
    });
});

test.describe('Cloud Run Deployment — AI Screenshots', () => {
    test('capture AI hint flow screenshots', async ({ page, request }) => {
        test.setTimeout(300000); // 5 min — DuckDB WASM init is slow on Cloud Run

        // Capture console errors for debugging
        const errors = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('dialog', dialog => dialog.dismiss()); // auto-dismiss alerts

        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await page.screenshot({ path: 'test-results/ai-00-login-prompt.png', fullPage: true });

        await loginViaAPI(page, request);

        // Wait for DuckDB WASM to be fully connected (green status)
        await page.waitForSelector('.status.connected', { timeout: 150000 });

        // Wait for dropdown to be populated
        await page.waitForFunction(() => {
            const dd = document.getElementById('questionDropdown');
            return dd && dd.options.length > 1;
        }, { timeout: 30000 });

        await page.screenshot({ path: 'test-results/ai-01-question-selector.png', fullPage: true });

        // Select and load question
        await page.locator('#questionDropdown').selectOption({ index: 1 });
        await page.locator('#loadQuestionBtn').click();

        // Wait for practice mode to fully load — submit button signals addPracticeButtons() completed
        await page.locator('#submitPracticeBtn').waitFor({ state: 'attached', timeout: 120000 });

        await page.screenshot({ path: 'test-results/ai-02-question-loaded.png', fullPage: true });

        // Type a wrong query into the now-cleared CodeMirror
        const cm = page.locator('.CodeMirror');
        await cm.click();
        await page.keyboard.type('SELECT * FROM employees;');
        await page.waitForTimeout(500);

        await page.screenshot({ path: 'test-results/ai-03-query-typed.png', fullPage: true });

        // Scroll to Get Hint button and click it
        const hintBtn = page.locator('#getHintBtn');
        await hintBtn.scrollIntoViewIfNeeded();
        await page.screenshot({ path: 'test-results/ai-03b-hint-button.png', fullPage: true });

        await hintBtn.click();

        // Wait for AI response (typing animation)
        await page.waitForFunction(() => {
            const panel = document.getElementById('aiPanelContent');
            return panel && panel.textContent.length > 20;
        }, { timeout: 30000 });
        await page.waitForTimeout(1000);

        await page.screenshot({ path: 'test-results/ai-04-hint-response.png', fullPage: true });

        // Submit wrong answer to trigger feedback
        const submitBtn = page.locator('#submitPracticeBtn');
        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click();
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/ai-05-incorrect-feedback.png', fullPage: true });

        // Click Explain What's Wrong if it appears
        const explainBtn = page.locator('#explainErrorBtn');
        try {
            await explainBtn.waitFor({ state: 'visible', timeout: 5000 });
            await explainBtn.click();
            await page.waitForFunction(() => {
                const panel = document.getElementById('aiPanelContent');
                return panel && panel.textContent.length > 20;
            }, { timeout: 30000 });
            await page.waitForTimeout(1000);

            await page.screenshot({ path: 'test-results/ai-06-explain-error.png', fullPage: true });
        } catch {
            // explainErrorBtn may not appear if submission doesn't produce comparison feedback
        }
    });
});

test.describe('Cloud Run Deployment — AI Hints', () => {
    let authToken;

    test.beforeAll(async ({ request }) => {
        // Register a user for AI tests
        const email = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
        const resp = await request.post(`${API}/auth/register`, {
            data: { email, password: TEST_PASSWORD }
        });
        const data = await resp.json();
        authToken = data.token;
    });

    test('AI hint endpoint responds with valid structure', async ({ request }) => {
        const resp = await request.post(`${API}/ai/hint`, {
            headers: { Authorization: `Bearer ${authToken}` },
            data: {
                questionId: 1,
                userQuery: 'SELECT * FROM employees',
                errorMessage: null,
                type: 'hint'
            }
        });

        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body).toHaveProperty('hint');
        expect(body).toHaveProperty('cached');
        expect(body).toHaveProperty('tokens');
        expect(typeof body.hint).toBe('string');
        expect(body.hint.length).toBeGreaterThan(10);
        expect(typeof body.tokens.input).toBe('number');
        expect(typeof body.tokens.output).toBe('number');
    });

    test('AI explain_error returns valid response', async ({ request }) => {
        await new Promise(r => setTimeout(r, 30000)); // Rate limit buffer
        const resp = await request.post(`${API}/ai/hint`, {
            headers: { Authorization: `Bearer ${authToken}` },
            data: {
                questionId: 1,
                userQuery: 'SELECT * FROM nonexistent',
                errorMessage: 'Table nonexistent does not exist',
                type: 'explain_error'
            }
        });

        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.hint.length).toBeGreaterThan(10);
    });

    test('AI explain_solution returns valid response', async ({ request }) => {
        await new Promise(r => setTimeout(r, 30000)); // Rate limit buffer
        const resp = await request.post(`${API}/ai/hint`, {
            headers: { Authorization: `Bearer ${authToken}` },
            data: {
                questionId: 1,
                userQuery: '',
                type: 'explain_solution'
            }
        });

        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.hint.length).toBeGreaterThan(10);
    });

    test('AI hint requires authentication', async ({ request }) => {
        const resp = await request.post(`${API}/ai/hint`, {
            data: { questionId: 1, userQuery: 'SELECT 1', type: 'hint' }
        });
        expect(resp.status()).toBe(401);
    });

    test('AI hint rejects invalid type', async ({ request }) => {
        const resp = await request.post(`${API}/ai/hint`, {
            headers: { Authorization: `Bearer ${authToken}` },
            data: { questionId: 1, userQuery: 'SELECT 1', type: 'invalid' }
        });
        expect(resp.status()).toBe(400);
    });

    test('AI hint rejects missing questionId', async ({ request }) => {
        const resp = await request.post(`${API}/ai/hint`, {
            headers: { Authorization: `Bearer ${authToken}` },
            data: { userQuery: 'SELECT 1', type: 'hint' }
        });
        expect(resp.status()).toBe(400);
    });

    test('AI hint caches repeated requests', async ({ request }) => {
        // First request
        await request.post(`${API}/ai/hint`, {
            headers: { Authorization: `Bearer ${authToken}` },
            data: { questionId: 1, userQuery: 'SELECT * FROM employees', type: 'hint' }
        });

        // Second identical request should be cached
        const resp = await request.post(`${API}/ai/hint`, {
            headers: { Authorization: `Bearer ${authToken}` },
            data: { questionId: 1, userQuery: 'SELECT * FROM employees', type: 'hint' }
        });

        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.cached).toBe(true);
    });
});
