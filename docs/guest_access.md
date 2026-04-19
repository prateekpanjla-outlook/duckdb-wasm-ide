# Issue #4: Guest User Access — Comprehensive Implementation Plan

## Goal
Visitors click one button and start practicing SQL immediately. No email, no password, no friction.

---

## Part 1: Analysis

### Current Authentication Flow
1. User lands on page → sees `#loginPromptSection` with "Login to Start" button
2. Clicks Login → auth modal opens (email + password form)
3. `POST /api/auth/login` → returns JWT + user object
4. JWT stored in `localStorage` as `auth_token`, user as `user_data`
5. `authenticate` middleware on all `/api/practice/*` routes verifies JWT and attaches `req.user`
6. App initializes DuckDB, creates PracticeManager, shows question selector

### Current Database Schema
```sql
users (id SERIAL, email VARCHAR UNIQUE, password_hash VARCHAR, created_at, last_login)
user_sessions (user_id FK, current_question_id FK, practice_mode_active, last_activity)
user_attempts (id SERIAL, user_id FK, question_id FK, user_query, is_correct, attempts_count, completed_at, time_taken_seconds)
```

### Key Files
| File | Role |
|---|---|
| `server/middleware/auth.js` | JWT verification, `authenticate` + `optionalAuth` middleware |
| `server/routes/auth.js` | `/register`, `/login`, `/me`, `/logout` endpoints |
| `server/routes/practice.js` | All practice endpoints (all use `authenticate`) |
| `server/models/User.js` | User CRUD: create, findByEmail, findById, verifyPassword |
| `server/utils/initDatabase.js` | Table creation (users, questions, user_attempts, user_sessions) |
| `js/services/auth-manager.js` | Auth modal UI, login/register handling, UI state |
| `js/services/api-client.js` | HTTP client, token storage, all API methods |
| `index.html:82-86` | Login prompt section |

---

## Part 2: Architecture Design

### Core Decision: Guests Are Auto-Created Users

Instead of building parallel guest infrastructure (separate tables, separate middleware, separate routes), guests are regular users with an `is_guest` flag.

```
┌─────────────────────────────────────────────┐
│              users table                     │
├─────────────────────────────────────────────┤
│ id=1  email=alice@example.com  is_guest=F   │  ← registered user
│ id=2  email=guest-a1b2@guest   is_guest=T   │  ← guest user
│ id=3  email=bob@example.com    is_guest=F   │  ← registered user
│ id=4  email=guest-c3d4@guest   is_guest=T   │  ← guest user
└─────────────────────────────────────────────┘
```

**Why this approach:**
- Zero changes to `authenticate` middleware — it already works with user IDs
- Zero changes to practice routes — they already use `req.user.id`
- Zero changes to `user_attempts` or `user_sessions` — they already reference `users.id`
- Guest progress tracking works identically to registered users
- Migration is just: update email + password_hash + set `is_guest=false`

### What Changes

| Layer | Change | Risk |
|---|---|---|
| Database | Add `is_guest` column to `users` | None — additive, default FALSE |
| Backend | Add `POST /api/auth/guest` endpoint | None — new endpoint, no existing code touched |
| Backend | Add `POST /api/auth/guest/upgrade` endpoint | None — new endpoint |
| Frontend | Add "Try as Guest" button to login prompt | Low — additive HTML |
| Frontend | Add `guestLogin()` to AuthManager | Low — new method |
| Frontend | Add `guestLogin()` to APIClient | Low — new method |
| Frontend | Add guest upgrade modal | Low — new UI component |
| CSS | Style guest button + upgrade prompt | None |

**What does NOT change:**
- `authenticate` middleware (unchanged)
- `optionalAuth` middleware (unchanged)
- All practice routes (unchanged)
- `user_attempts` table (unchanged)
- `user_sessions` table (unchanged)
- `User.findById()` (unchanged — already excludes password_hash)
- DuckDB initialization (unchanged)
- Question loading (unchanged)

---

## Part 3: Detailed Implementation

### Step 1: Database — Add `is_guest` Column

**File: `server/utils/initDatabase.js`**

Add `is_guest` column to users table:

```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_guest BOOLEAN DEFAULT FALSE,          -- NEW
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_users_is_guest ON users(is_guest) WHERE is_guest = TRUE;
```

**Migration for existing deployments:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_guest ON users(is_guest) WHERE is_guest = TRUE;
```

No other tables need changes. `user_attempts` and `user_sessions` already reference `users.id`.

---

### Step 2: Backend — Guest Auth Endpoint

**File: `server/routes/auth.js`**

Add two new routes. No existing routes are modified.

```javascript
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * POST /api/auth/guest
 * Create an anonymous guest user and return JWT
 *
 * Flow:
 *   1. Generate unique guest email: guest-{shortUUID}@guest.local
 *   2. Generate random password (never exposed to frontend)
 *   3. Insert into users table with is_guest=true
 *   4. Return JWT (same shape as /login response)
 *
 * The guest user is a real row in the users table.
 * All existing practice routes work without modification.
 */
router.post('/guest', async (req, res) => {
    try {
        const guestId = uuidv4().substring(0, 8);
        const guestEmail = `guest-${guestId}@guest.local`;
        const guestPassword = crypto.randomBytes(32).toString('hex');

        // Create guest user (uses existing User.create which bcrypt-hashes password)
        const user = await User.create({ email: guestEmail, password: guestPassword });

        // Mark as guest
        await query(
            'UPDATE users SET is_guest = TRUE WHERE id = $1',
            [user.id]
        );

        // Generate JWT (same as login — 24h for guests instead of 7d)
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log(`Guest created: id=${user.id} email=${guestEmail}`);

        res.status(201).json({
            message: 'Guest session created',
            user: {
                id: user.id,
                email: user.email,
                isGuest: true
            },
            token
        });
    } catch (error) {
        console.error('Guest creation error:', error);
        res.status(500).json({ error: 'Failed to create guest session' });
    }
});

/**
 * POST /api/auth/guest/upgrade
 * Convert a guest account to a registered account
 *
 * Flow:
 *   1. Verify current user is a guest (via JWT)
 *   2. Validate new email + password
 *   3. Update email, password_hash, is_guest=false
 *   4. Return new JWT with updated email
 *
 * All progress (user_attempts, user_sessions) is preserved
 * because the user.id stays the same.
 */
router.post('/guest/upgrade', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { email, password } = req.body;

        // Verify this is a guest account
        const userRow = await query('SELECT is_guest FROM users WHERE id = $1', [userId]);
        if (!userRow.rows[0]?.is_guest) {
            return res.status(400).json({ error: 'Account is not a guest account' });
        }

        // Validate input
        if (!email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Email and password (min 6 chars) required' });
        }

        // Check email not already taken
        const existing = await User.findByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Update user: new email, new password, no longer guest
        const bcrypt = await import('bcryptjs');
        const password_hash = await bcrypt.default.hash(password, 10);

        await query(
            'UPDATE users SET email = $1, password_hash = $2, is_guest = FALSE WHERE id = $3',
            [email, password_hash, userId]
        );

        // Generate new JWT with updated email (7d expiry for registered users)
        const token = jwt.sign(
            { userId, email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        console.log(`Guest upgraded: id=${userId} newEmail=${email}`);

        res.json({
            message: 'Account upgraded successfully',
            user: { id: userId, email },
            token
        });
    } catch (error) {
        console.error('Guest upgrade error:', error);
        res.status(500).json({ error: 'Failed to upgrade account' });
    }
});
```

**Why `upgrade` instead of `migrate`:**
- The user ID doesn't change. No data is moved between tables.
- It's literally just updating 3 columns on the same row.
- All foreign keys (`user_attempts.user_id`, `user_sessions.user_id`) remain valid.

**Dependencies to add:**
```bash
npm install uuid  # if not already installed
```

Note: `crypto` is a Node.js built-in, no install needed.

---

### Step 3: Backend — User Model Update

**File: `server/models/User.js`**

Add `is_guest` to the safe fields returned by `findById` and `getProfile`:

```javascript
// findById — add is_guest to SELECT
static async findById(id) {
    const text = 'SELECT id, email, is_guest, created_at, last_login FROM users WHERE id = $1';
    const result = await query(text, [id]);
    return result.rows[0];
}

// getProfile — add is_guest to SELECT
static async getProfile(id) {
    const text = `
        SELECT
            id, email, is_guest, created_at, last_login,
            (SELECT COUNT(*) FROM user_attempts WHERE user_id = users.id) as total_attempts,
            (SELECT COUNT(*) FROM user_attempts WHERE user_id = users.id AND is_correct = true) as correct_attempts
        FROM users
        WHERE id = $1
    `;
    const result = await query(text, [id]);
    return result.rows[0];
}
```

---

### Step 4: Frontend — API Client

**File: `js/services/api-client.js`**

Add two new methods. No existing methods are modified.

```javascript
// ==================== Guest Methods ====================

/**
 * Create guest session — no credentials needed
 */
async guestLogin() {
    const data = await this.request('/auth/guest', {
        method: 'POST'
    });

    if (!data.token || !data.user) {
        throw new Error('Invalid response from server: missing token or user data');
    }

    this.setToken(data.token);
    this.setUser(data.user);

    return data;
}

/**
 * Upgrade guest account to registered account
 */
async upgradeGuest(email, password) {
    const data = await this.request('/auth/guest/upgrade', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    if (!data.token || !data.user) {
        throw new Error('Invalid response from server: missing token or user data');
    }

    this.setToken(data.token);
    this.setUser(data.user);

    return data;
}

/**
 * Check if current user is a guest
 */
isGuest() {
    return this.user?.isGuest === true || this.user?.is_guest === true;
}
```

---

### Step 5: Frontend — Auth Manager

**File: `js/services/auth-manager.js`**

#### 5a. Add guest login method

```javascript
/**
 * Start as guest — creates anonymous account, full access
 */
async startAsGuest() {
    try {
        await apiClient.guestLogin();

        this.closeModal();
        const user = apiClient.getUser();
        this.updateUIForGuestUser(user);
        this.showNotification('Welcome! You can start practicing immediately.', 'success');

        // Same initialization as regular login
        await window.app.initializeDuckDB();
        window.app.practiceManager = new PracticeManager(window.app.dbManager);
        window.practiceManager = window.app.practiceManager;
        window.app.showQuestionSelector();

    } catch (error) {
        this.showNotification('Failed to start guest session. Please try again.', 'error');
        console.error('Guest login failed:', error);
    }
}
```

#### 5b. Add guest UI update method

```javascript
/**
 * Update UI for guest user — shows "Guest" in header with upgrade option
 */
updateUIForGuestUser(user) {
    const authBtn = document.getElementById('authBtn');
    const practiceBtn = document.getElementById('startPracticeBtn');
    const viewQuestionsBtn = document.getElementById('viewQuestionsBtn');
    const querySection = document.getElementById('querySection');
    const resultsPanel = document.getElementById('resultsPanel');

    // Show "Guest" instead of email
    authBtn.textContent = 'Guest';
    authBtn.classList.remove('btn-primary');
    authBtn.classList.add('btn-secondary');
    authBtn.onclick = () => this.showGuestOptions();

    // Show practice UI (same as registered users)
    if (practiceBtn) practiceBtn.style.display = 'inline-block';
    if (viewQuestionsBtn) viewQuestionsBtn.classList.remove('hidden');
    if (querySection) querySection.classList.remove('hidden');
    if (resultsPanel) resultsPanel.classList.remove('hidden');
}
```

#### 5c. Add guest options menu

```javascript
/**
 * Show options for guest: upgrade to full account or logout
 */
showGuestOptions() {
    const existing = document.getElementById('guestOptionsModal');
    if (existing) existing.remove();

    const modalHTML = `
        <div id="guestOptionsModal" class="auth-modal">
            <div class="auth-modal-content">
                <button class="auth-modal-close" id="closeGuestOptions">&times;</button>
                <div class="auth-header">
                    <h2>Guest Account</h2>
                    <p class="auth-subtitle">Your progress will be lost when the session expires</p>
                </div>

                <div class="guest-options">
                    <button id="upgradeAccountBtn" class="btn btn-primary" style="width:100%; margin-bottom:0.75rem;">
                        Create Account (Save Progress)
                    </button>
                    <button id="guestLogoutBtn" class="btn btn-secondary" style="width:100%;">
                        Logout
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Attach handlers
    document.getElementById('closeGuestOptions').addEventListener('click', () => {
        document.getElementById('guestOptionsModal').remove();
    });
    document.getElementById('guestOptionsModal').addEventListener('click', (e) => {
        if (e.target.id === 'guestOptionsModal') {
            document.getElementById('guestOptionsModal').remove();
        }
    });
    document.getElementById('upgradeAccountBtn').addEventListener('click', () => {
        document.getElementById('guestOptionsModal').remove();
        this.showUpgradeForm();
    });
    document.getElementById('guestLogoutBtn').addEventListener('click', async () => {
        document.getElementById('guestOptionsModal').remove();
        await apiClient.logout();
        this.updateUIForLoggedInUser(null);
        this.showNotification('Logged out', 'info');
    });
}
```

#### 5d. Add upgrade form

```javascript
/**
 * Show form to upgrade guest to registered account
 */
showUpgradeForm() {
    // Reuse existing auth modal but in "register" mode with custom handler
    this.isLoginMode = false;

    const title = document.getElementById('authTitle');
    const submitText = document.getElementById('authSubmitText');
    const toggleText = document.getElementById('authToggleText');
    const toggleBtn = document.getElementById('authToggleBtn');

    title.textContent = 'Create Account';
    submitText.textContent = 'Save My Progress';
    toggleText.textContent = '';
    toggleBtn.style.display = 'none';

    // Temporarily override form submit
    const form = document.getElementById('authForm');
    const originalHandler = form.onsubmit;

    form.onsubmit = null;
    const upgradeHandler = async (e) => {
        e.preventDefault();
        await this.handleUpgrade();
        form.removeEventListener('submit', upgradeHandler);
        toggleBtn.style.display = '';
    };
    form.addEventListener('submit', upgradeHandler);

    this.openModal();
}

/**
 * Handle guest upgrade form submission
 */
async handleUpgrade() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorDiv = document.getElementById('authError');
    const submitBtn = document.querySelector('.auth-submit-btn');
    const submitText = document.getElementById('authSubmitText');
    const spinner = document.querySelector('.auth-spinner');

    errorDiv.classList.add('hidden');
    submitBtn.disabled = true;
    submitText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        await apiClient.upgradeGuest(email, password);

        this.closeModal();
        const user = apiClient.getUser();
        this.updateUIForLoggedInUser(user);
        this.showNotification('Account created! Your progress has been saved.', 'success');

    } catch (error) {
        errorDiv.textContent = error.message || 'Upgrade failed';
        errorDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}
```

#### 5e. Update `checkExistingAuth` to handle returning guests

```javascript
async checkExistingAuth() {
    if (apiClient.isAuthenticated()) {
        const user = apiClient.getUser();
        if (apiClient.isGuest()) {
            this.updateUIForGuestUser(user);
        } else {
            this.updateUIForLoggedInUser(user);
        }
    }
}
```

---

### Step 6: Frontend — Login Prompt UI

**File: `index.html` (lines 81-86)**

Replace login prompt section:

```html
<!-- Login Prompt Section (shown when not logged in) -->
<div id="loginPromptSection" class="login-prompt-section">
    <h2>SQL Practice Platform</h2>
    <p class="hint">Practice SQL queries with instant feedback</p>
    <button id="guestModeBtn" class="btn btn-primary btn-guest">
        Start Practicing
    </button>
    <div class="login-prompt-divider">
        <span>or</span>
    </div>
    <button id="loginPromptBtn" class="btn btn-secondary">
        Login / Register
    </button>
    <p class="hint hint-small">Create an account to save your progress</p>
</div>
```

Wire up the guest button in `auth-manager.js` → `attachEventListeners()`:

```javascript
// Guest mode button (on login prompt page)
const guestBtn = document.getElementById('guestModeBtn');
if (guestBtn) {
    guestBtn.addEventListener('click', () => this.startAsGuest());
}
```

---

### Step 7: CSS — Guest Button Styling

**File: `css/style.css`**

```css
/* Guest mode button — prominent, inviting */
.btn-guest {
    font-size: 1.1rem;
    padding: 0.85rem 2rem;
}

/* "or" divider between guest and login buttons */
.login-prompt-divider {
    display: flex;
    align-items: center;
    margin: 0.75rem 0;
    gap: 1rem;
}

.login-prompt-divider::before,
.login-prompt-divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--border-color, #ddd);
}

.login-prompt-divider span {
    color: #888;
    font-size: 0.85rem;
}

.hint-small {
    font-size: 0.8rem;
    margin-top: 0.25rem;
    opacity: 0.7;
}
```

---

## Part 4: Guest Cleanup Strategy

Guest users accumulate in the database. Two cleanup approaches (implement later, not in v1):

### Option A: Scheduled SQL (recommended for v1)
Run manually or via cron:
```sql
-- Delete guest users inactive for 7+ days (cascades to user_attempts, user_sessions)
DELETE FROM users
WHERE is_guest = TRUE
  AND last_login < NOW() - INTERVAL '7 days';
```

### Option B: Server-side cleanup endpoint (v2)
```javascript
// POST /api/admin/cleanup-guests (protected by admin auth)
router.post('/admin/cleanup-guests', adminAuth, async (req, res) => {
    const result = await query(
        "DELETE FROM users WHERE is_guest = TRUE AND last_login < NOW() - INTERVAL '7 days' RETURNING id"
    );
    res.json({ deleted: result.rowCount });
});
```

**Prerequisite:** `user_attempts` and `user_sessions` foreign keys must have `ON DELETE CASCADE`. Check current schema — `user_attempts` already has it, `user_sessions` already has it.

---

## Part 5: User Flow Diagrams

### Flow 1: Guest Start
```
Landing Page
  │
  ├─ Click "Start Practicing"
  │    │
  │    ├─ POST /api/auth/guest
  │    │    └─ Creates user row (is_guest=true, email=guest-xxxx@guest.local)
  │    │    └─ Returns JWT (24h expiry) + user object
  │    │
  │    ├─ Store JWT in localStorage
  │    ├─ Show "Guest" in header
  │    ├─ Initialize DuckDB
  │    ├─ Show question selector
  │    └─ User practices SQL ✓
  │
  └─ Click "Login / Register"
       └─ Existing auth modal (unchanged)
```

### Flow 2: Guest Upgrade
```
Guest clicks "Guest" button in header
  │
  ├─ Guest options modal appears
  │    ├─ "Create Account (Save Progress)"
  │    │    │
  │    │    ├─ Opens register form (reuses auth modal)
  │    │    ├─ User enters email + password
  │    │    ├─ POST /api/auth/guest/upgrade
  │    │    │    └─ Updates same user row: email, password_hash, is_guest=false
  │    │    │    └─ Returns new JWT (7d expiry)
  │    │    │
  │    │    ├─ All progress preserved (same user_id)
  │    │    ├─ Header shows email instead of "Guest"
  │    │    └─ User continues as registered user ✓
  │    │
  │    └─ "Logout"
  │         └─ Clears token, shows login prompt
```

### Flow 3: Returning Guest (within 24h)
```
User returns to site (token still in localStorage)
  │
  ├─ checkExistingAuth() detects token
  ├─ apiClient.isGuest() returns true
  ├─ updateUIForGuestUser() called
  ├─ DuckDB initialized
  ├─ Previous session restored
  └─ User continues practicing ✓
```

### Flow 4: Expired Guest
```
User returns after 24h (token expired)
  │
  ├─ API call returns 401
  ├─ apiClient.request() clears token + reloads
  ├─ Login prompt shown
  └─ User can start new guest session or register
```

### Sequence Diagram: Guest Start

```
Browser                    Express Server              PostgreSQL
  │                              │                         │
  │  Click "Start Practicing"    │                         │
  │──POST /api/auth/guest───────>│                         │
  │                              │  INSERT INTO users      │
  │                              │  (is_guest=true)        │
  │                              │────────────────────────>│
  │                              │  <── user row ──────────│
  │                              │                         │
  │                              │  jwt.sign(userId, 24h)  │
  │  <── { token, user } ───────│                         │
  │                              │                         │
  │  localStorage.set(token)     │                         │
  │  initializeDuckDB()          │                         │
  │  showQuestionSelector()      │                         │
  │                              │                         │
  │  GET /api/practice/questions─>│                         │
  │                              │  SELECT * FROM questions│
  │                              │────────────────────────>│
  │  <── { questions[] } ────────│  <── rows ──────────────│
  │                              │                         │
  │  Render dropdown             │                         │
```

### Sequence Diagram: Guest Upgrade

```
Browser                    Express Server              PostgreSQL
  │                              │                         │
  │  Click "Create Account"      │                         │
  │  Enter email + password      │                         │
  │                              │                         │
  │──POST /api/auth/guest/upgrade>│                        │
  │  { email, password }         │                         │
  │                              │  SELECT is_guest        │
  │                              │────────────────────────>│
  │                              │  <── true ──────────────│
  │                              │                         │
  │                              │  SELECT by email        │
  │                              │────────────────────────>│
  │                              │  <── not found ─────────│
  │                              │                         │
  │                              │  UPDATE users SET       │
  │                              │  email, password_hash,  │
  │                              │  is_guest=false         │
  │                              │────────────────────────>│
  │                              │  <── updated ───────────│
  │                              │                         │
  │                              │  jwt.sign(userId, 7d)   │
  │  <── { token, user } ───────│                         │
  │                              │                         │
  │  Header: email (not "Guest") │                         │
  │  All progress preserved      │                         │
  │  (same user_id)              │                         │
```

---

## Part 6: Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Guest token expires mid-session | API returns 401 → `apiClient.request()` already clears token + reloads page |
| Guest tries to upgrade with taken email | Backend returns 409 → form shows "Email already registered" |
| Guest upgrades with weak password | Backend validates min 6 chars → form shows error |
| Multiple guests from same browser | Each "Start Practicing" creates a new guest user. Previous guest data is orphaned (cleaned up by cron) |
| Guest with 0 attempts upgrades | Works fine — just updates user row, no attempts to preserve |
| Registered user clicks "Start Practicing" | Button only shows when not authenticated. If authenticated, they see question selector directly |
| localStorage unavailable (private browsing) | `apiClient._safeSetItem` already handles this gracefully — user can still practice within the tab but won't persist across refreshes |

---

## Part 7: Files Changed Summary

### Modified Files (5)
| File | Changes |
|---|---|
| `server/utils/initDatabase.js` | Add `is_guest BOOLEAN DEFAULT FALSE` to users table |
| `server/routes/auth.js` | Add `POST /guest` + `POST /guest/upgrade` endpoints (~60 lines) |
| `server/models/User.js` | Add `is_guest` to `findById` and `getProfile` SELECT queries |
| `js/services/api-client.js` | Add `guestLogin()`, `upgradeGuest()`, `isGuest()` methods (~30 lines) |
| `js/services/auth-manager.js` | Add `startAsGuest()`, `updateUIForGuestUser()`, `showGuestOptions()`, `showUpgradeForm()`, `handleUpgrade()`, update `checkExistingAuth()` (~120 lines) |

### Modified Files (2) — UI
| File | Changes |
|---|---|
| `index.html` | Replace login prompt with guest button + divider + login button (~10 lines) |
| `css/style.css` | Guest button, divider, hint styles (~25 lines) |

### New Files (0)
No new files. No new tables. No new middleware.

### Unchanged Files
- `server/middleware/auth.js` — no changes needed
- `server/routes/practice.js` — no changes needed
- `server/routes/ai.js` — no changes needed
- All other files — no changes needed

---

## Part 8: Testing Plan

### Manual Testing Checklist
- [ ] Click "Start Practicing" → guest session created, questions load
- [ ] Load a question → DuckDB initializes, SQL editor works
- [ ] Submit correct answer → attempt recorded, success feedback shown
- [ ] Submit incorrect answer → attempt recorded, error feedback shown
- [ ] Get AI hint → works same as registered user
- [ ] Click "Guest" in header → options modal appears
- [ ] Click "Create Account" → upgrade form appears
- [ ] Enter email + password → account upgraded, header shows email
- [ ] Submit another answer → attempt recorded under same user ID
- [ ] Logout → login prompt shown
- [ ] Login with new email/password → all previous progress visible
- [ ] Refresh page as guest → session restored (within 24h)
- [ ] Refresh page after 24h → session expired, login prompt shown

### E2E Test (tests/e2e/guest.spec.js)
```javascript
test('guest user can practice without registration', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#guestModeBtn');
    await page.waitForSelector('.status.connected', { timeout: 150000 });
    // Verify question selector is visible
    await expect(page.locator('#questionDropdown')).toBeVisible();
    // Verify header shows "Guest"
    await expect(page.locator('#authBtn')).toHaveText('Guest');
});

test('guest can upgrade to registered account', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#guestModeBtn');
    await page.waitForSelector('.status.connected', { timeout: 150000 });
    // Click guest button in header
    await page.click('#authBtn');
    await page.click('#upgradeAccountBtn');
    // Fill in registration form
    await page.fill('#authEmail', 'test-upgrade@example.com');
    await page.fill('#authPassword', 'password123');
    await page.click('.auth-submit-btn');
    // Verify header shows email
    await expect(page.locator('#authBtn')).toHaveText('test-upgrade@example.com');
});
```

---

## Part 9: Implementation Checklist

### Phase 1: Backend (2-3 hours)
- [ ] Add `is_guest` column to users table in `initDatabase.js`
- [ ] Run migration SQL on Cloud SQL
- [ ] Add `is_guest` to `User.findById()` and `User.getProfile()` in `User.js`
- [ ] Add `POST /api/auth/guest` endpoint in `auth.js`
- [ ] Add `POST /api/auth/guest/upgrade` endpoint in `auth.js`
- [ ] Install `uuid` package if not present
- [ ] Test endpoints with curl

### Phase 2: Frontend (3-4 hours)
- [ ] Add `guestLogin()`, `upgradeGuest()`, `isGuest()` to `api-client.js`
- [ ] Add `startAsGuest()` to `auth-manager.js`
- [ ] Add `updateUIForGuestUser()` to `auth-manager.js`
- [ ] Add `showGuestOptions()` modal to `auth-manager.js`
- [ ] Add `showUpgradeForm()` + `handleUpgrade()` to `auth-manager.js`
- [ ] Update `checkExistingAuth()` for guest detection
- [ ] Update login prompt HTML in `index.html`
- [ ] Wire up `guestModeBtn` click handler
- [ ] Add CSS styles for guest button + divider

### Phase 3: Testing & Deploy (1-2 hours)
- [ ] Manual test: full guest flow locally
- [ ] Manual test: upgrade flow locally
- [ ] Manual test: returning guest (refresh)
- [ ] Write E2E test for guest flow
- [ ] Deploy to Cloud Run
- [ ] Verify on production

**Total estimated time: 6-9 hours**

---

## Part 10: Future Enhancements (Not in v1)

1. **Guest cleanup cron** — delete guests inactive >7 days
2. **Guest usage analytics** — track how many guests upgrade
3. **Upgrade prompt** — after 3 questions, show "Create account to save progress"
4. **Guest rate limiting** — prevent abuse of guest endpoint
5. **Guest session merge** — if a guest registers with an email that already has an account, offer to merge progress
