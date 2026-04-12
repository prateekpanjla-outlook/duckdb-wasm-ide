# AI Hints — E2E Testing Strategy

**Related:** [gemini-integration.md](gemini-integration.md) | GitHub Issue #33

## Challenge

E2E tests run against a real server. Calling real Gemini API in tests creates problems:
- **Flaky:** Gemini latency varies, could timeout
- **Costly:** Small but accumulates in CI (1000s of test runs)
- **Fragile:** AI output varies — can't assert on specific words
- **Dependent:** Tests fail if Gemini is down (external dependency)

## Key Testing Decisions

### 1. No GEMINI_API_KEY = mock mode

The server checks at runtime:

```javascript
if (!process.env.GEMINI_API_KEY) {
    return res.json({ hint: "Think about which column to filter on..." });
} else {
    // call real Gemini
}
```

The presence/absence of the API key IS the switch. Same Docker image, same code. No `NODE_ENV === 'test'` checks, no test config files, no environment switching.

| Environment | GEMINI_API_KEY | Behavior |
|-------------|---------------|----------|
| Vagrant VM (local E2E) | Not set | Mock — tests pass without Gemini |
| GitHub Actions CI | Not set | Mock — no cost, deterministic |
| Cloud Run (production) | Set via Secret Manager | Real Gemini calls |

### 2. Local/CI tests use mock — fast, free, deterministic

**Fast:** Mock returns instantly. No 0.5-2s network round trip.

**Free:** No tokens consumed. Running tests 100 times costs $0.

**Deterministic:** Mock always returns the exact same text:

```javascript
const MOCK_HINT = {
    hint: "Think about which column to filter on. What SQL clause filters rows based on a condition?",
    cached: false,
    tokens: { input: 0, output: 0 }
};
```

This makes assertions predictable:

```javascript
await expect(page.locator('#aiResponsePanel'))
    .toContainText('column to filter');
// Always passes — mock text is fixed
```

Real Gemini might return "Consider using a WHERE clause" one time and "Look at the department column" the next. Tests would randomly fail.

### 3. Production smoke tests assert on structure, not AI text

#### The problem with asserting on content

Same prompt, different responses from Gemini (temperature=0.7):

```
Run 1: "Think about which column to filter on."
Run 2: "Your query returns all rows. Consider adding a condition."
Run 3: "Look at the WHERE clause — it lets you pick specific rows."
```

If we assert `expect(body.hint).toContain('WHERE')`:
- Run 1: FAIL (says "column" not "WHERE")
- Run 2: FAIL (says "condition" not "WHERE")
- Run 3: PASS

This is a **flaky test** — passes randomly. You stop trusting it. Real bugs slip through.

#### What we assert instead — the contract

```javascript
test('hint endpoint returns valid response', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/ai/hint`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { questionId: 1, userQuery: 'SELECT * FROM employees', type: 'hint' }
    });

    // Endpoint works
    expect(resp.status()).toBe(200);

    const body = await resp.json();

    // Response has the right shape
    expect(body).toHaveProperty('hint');
    expect(body).toHaveProperty('cached');
    expect(body).toHaveProperty('tokens');
    expect(body.tokens).toHaveProperty('input');
    expect(body.tokens).toHaveProperty('output');

    // Hint is a non-trivial string
    expect(typeof body.hint).toBe('string');
    expect(body.hint.length).toBeGreaterThan(10);

    // Tokens are numbers
    expect(typeof body.tokens.input).toBe('number');
    expect(typeof body.tokens.output).toBe('number');
});
```

This passes every time because we check shape and types, not specific words.

#### What contract tests catch vs don't catch

| Bug | Caught by contract test |
|-----|------------------------|
| Server route broken | Status !== 200 |
| Gemini API key missing/expired | Status 503 or hint missing |
| Prompt builder returns empty | hint.length < 10 |
| JSON shape changed | toHaveProperty fails |
| Token counting broken | typeof !== 'number' |
| Rate limiting broken | Separate test — 11th request returns 429 |
| Auth broken | Separate test — no token returns 401 |

| Not caught | Why that's OK |
|-----------|---------------|
| Hint is pedagogically good | Can't automate — human review during development |
| Hint doesn't reveal the answer | Controlled by system prompt, not testable deterministically |
| Hint is relevant to the question | Would need another AI to judge — circular |

Quality is reviewed by humans during prompt engineering. Tests verify the plumbing works.

### 4. Test typing animation separately from E2E

The typing animation:

```javascript
async function typeText(element, text, speed = 30) {
    element.textContent = '';
    for (const char of text) {
        element.textContent += char;
        await new Promise(r => setTimeout(r, speed));
    }
}
```

**Don't test animation timing in E2E:**

```javascript
// BAD — timing-dependent, flaky
await page.locator('#getHintBtn').click();
await page.waitForTimeout(500);
// Is the text half-typed? Depends on browser load, CI speed...
expect(await page.locator('#aiResponsePanel').textContent()).toBe("Thi");
```

Animation speed varies with browser load. CI runners are slower than your laptop. `waitForTimeout` is always a guess.

**Unit test the function directly:**

```javascript
const el = { textContent: '' };
await typeText(el, "Hello");
assert(el.textContent === "Hello"); // test final state, not intermediate
```

**E2E test checks only the final result:**

```javascript
await page.locator('#getHintBtn').click();
await expect(page.locator('#aiResponsePanel'))
    .toContainText('column to filter', { timeout: 10000 });
// Don't care HOW it appeared — just that it's there eventually
```

The 10-second timeout is generous. Playwright retries automatically until it passes or times out.

## Test Cases

### Local E2E (tests/e2e/ai.spec.js) — mock mode

```javascript
test.describe('AI Hints', () => {

    test('hint button appears after loading a question', async ({ page }) => {
        await loginAndLoadQuestion(page);
        await expect(page.locator('#getHintBtn')).toBeVisible();
    });

    test('clicking hint shows AI response panel', async ({ page }) => {
        await loginAndLoadQuestion(page);
        await page.locator('#getHintBtn').click();
        await expect(page.locator('#aiResponsePanel')).toBeVisible();
        await expect(page.locator('#aiResponsePanel')).not.toBeEmpty({ timeout: 10000 });
    });

    test('hint contains expected mock text', async ({ page }) => {
        await loginAndLoadQuestion(page);
        await page.locator('#getHintBtn').click();
        await expect(page.locator('#aiResponsePanel'))
            .toContainText('column to filter', { timeout: 10000 });
    });

    test('explain error button appears after incorrect submission', async ({ page }) => {
        await loginAndLoadQuestion(page);
        await writeQuery(page, 'SELECT * FROM nonexistent_table');
        await page.locator('#submitCodeBtn').click();
        await expect(page.locator('#explainErrorBtn')).toBeVisible();
    });

    test('rate limit shows message after exceeding limit', async ({ page }) => {
        await loginAndLoadQuestion(page);
        for (let i = 0; i < 11; i++) {
            await page.locator('#getHintBtn').click();
            await page.waitForTimeout(500);
        }
        await expect(page.locator('#aiResponsePanel'))
            .toContainText('rate limit', { timeout: 5000 });
    });

    test('hint works without GEMINI_API_KEY', async ({ page }) => {
        await loginAndLoadQuestion(page);
        await page.locator('#getHintBtn').click();
        await expect(page.locator('#aiResponsePanel'))
            .not.toContainText('error', { timeout: 10000 });
    });
});
```

### Production smoke tests (tests/e2e/cloud.spec.js additions)

```javascript
test('AI hint endpoint responds', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.post(`${BASE}/api/ai/hint`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { questionId: 1, userQuery: 'SELECT * FROM employees', type: 'hint' }
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.hint).toBeTruthy();
    expect(body.hint.length).toBeGreaterThan(10);
});

test('AI hint rate limiting works', async ({ request }) => {
    const token = await getAuthToken(request);
    let lastStatus;
    for (let i = 0; i < 11; i++) {
        const resp = await request.post(`${BASE}/api/ai/hint`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { questionId: 1, userQuery: 'SELECT 1', type: 'hint' }
        });
        lastStatus = resp.status();
    }
    expect(lastStatus).toBe(429);
});

test('AI hint requires authentication', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/ai/hint`, {
        data: { questionId: 1, userQuery: 'SELECT 1', type: 'hint' }
    });
    expect(resp.status()).toBe(401);
});
```
