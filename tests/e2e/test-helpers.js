/**
 * Shared E2E Test Helpers
 * Provides API mocking and login utilities for all E2E tests.
 */

// Mock data: question with known table name "sample_employees" matching test queries
export const MOCK_USER = {
    id: 1,
    email: 'testuser@example.com',
    created_at: '2025-01-01T00:00:00Z'
};

export const MOCK_TOKEN = 'mock-test-token-abc123';

export const MOCK_QUESTIONS = [
    {
        id: 1,
        sql_question: 'Select all employees from the Engineering department',
        category: 'SELECT',
        difficulty: 'Easy',
        sql_data: `CREATE TABLE sample_employees (id INTEGER, name VARCHAR, department VARCHAR, salary DECIMAL);
INSERT INTO sample_employees VALUES (1, 'Alice', 'Engineering', 95000), (2, 'Bob', 'Engineering', 90000), (3, 'Charlie', 'Marketing', 85000), (4, 'Diana', 'Engineering', 92000), (5, 'Eve', 'Sales', 88000);`,
        sql_solution: "SELECT * FROM sample_employees WHERE department = 'Engineering'",
        sql_solution_explanation: [
            'Use SELECT * to get all columns',
            'Filter with WHERE department = Engineering'
        ]
    },
    {
        id: 2,
        sql_question: 'Count total employees per department',
        category: 'Aggregation',
        difficulty: 'Medium',
        sql_data: `CREATE TABLE sample_employees (id INTEGER, name VARCHAR, department VARCHAR, salary DECIMAL);
INSERT INTO sample_employees VALUES (1, 'Alice', 'Engineering', 95000), (2, 'Bob', 'Engineering', 90000), (3, 'Charlie', 'Marketing', 85000), (4, 'Diana', 'Engineering', 92000), (5, 'Eve', 'Sales', 88000);`,
        sql_solution: "SELECT department, COUNT(*) as count FROM sample_employees GROUP BY department",
        sql_solution_explanation: [
            'Use GROUP BY to group rows by department',
            'Use COUNT(*) to count rows in each group'
        ]
    }
];

/**
 * Set up API route mocks on a Playwright page.
 * Intercepts all /api/* requests and returns mock data so tests
 * don't require a running backend server.
 */
export async function setupAPIMocks(page) {
    // Mock login endpoint
    await page.route('**/api/auth/login', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                token: MOCK_TOKEN,
                user: MOCK_USER
            })
        });
    });

    // Mock register endpoint
    await page.route('**/api/auth/register', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                token: MOCK_TOKEN,
                user: MOCK_USER
            })
        });
    });

    // Mock logout endpoint
    await page.route('**/api/auth/logout', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });

    // Mock get current user
    await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: MOCK_USER })
        });
    });

    // Mock questions list
    await page.route('**/api/practice/questions**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ questions: MOCK_QUESTIONS })
        });
    });

    // Mock individual question fetch (e.g., /api/practice/question/1)
    await page.route('**/api/practice/question/*', async (route) => {
        const url = route.request().url();
        const idMatch = url.match(/\/question\/(\d+)/);
        const id = idMatch ? parseInt(idMatch[1]) : 1;
        const question = MOCK_QUESTIONS.find(q => q.id === id) || MOCK_QUESTIONS[0];

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ question })
        });
    });

    // Mock practice start
    await page.route('**/api/practice/start', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ question: MOCK_QUESTIONS[0] })
        });
    });

    // Mock practice next
    await page.route('**/api/practice/next', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ question: MOCK_QUESTIONS[1] })
        });
    });

    // Mock practice verify
    await page.route('**/api/practice/verify', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });

    // Mock practice session endpoints
    await page.route('**/api/practice/session**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ active: true })
        });
    });

    // Mock practice progress
    await page.route('**/api/practice/progress', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ progress: [] })
        });
    });
}

/**
 * Perform login with mocked API.
 * Sets up API mocks, navigates to the app, and completes the login flow.
 */
export async function performMockedLogin(page) {
    await setupAPIMocks(page);
    await page.goto('/');

    // Wait for app to initialize (DOMContentLoaded + App constructor)
    await page.waitForFunction(() => !!window.app, { timeout: 10000 });

    // Click the login button to open modal
    const authBtn = page.locator('#authBtn');
    await authBtn.click();

    // Wait for modal to appear
    await page.waitForSelector('#authModal.visible', { timeout: 5000 });

    // Fill in login credentials
    await page.fill('#authEmail', 'testuser@example.com');
    await page.fill('#authPassword', 'password123');

    // Submit the login form
    await page.click('.auth-submit-btn');

    // Wait for login to complete: appContainer becomes interactive
    await page.waitForFunction(() => {
        const container = document.getElementById('appContainer');
        return container && container.style.pointerEvents === 'auto';
    }, { timeout: 30000 });

    // Wait for question dropdown to be populated (enabled means questions loaded)
    await page.waitForFunction(() => {
        const dropdown = document.getElementById('questionDropdown');
        return dropdown && !dropdown.disabled && dropdown.options.length > 1;
    }, { timeout: 15000 });
}
