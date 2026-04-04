# Plan: New Sign-Up Functionality Enhancements

**Last Updated:** 2026-03-31
**Status:** 📋 Roadmap — active tracking is in Vikunja

> **See [Vikunja Project 2](http://localhost:3456/projects/2) for live task status.**
> This document remains as a roadmap/design reference. Do not add new TODOs here — add them to Vikunja.

---

## Current State

The authentication system currently includes:
- Basic email/password registration
- Simple modal with toggle between Login/Register
- Password hashing with bcrypt (10 rounds)
- JWT token for session management
- User data persistence in localStorage
- ✅ **Rate limiting** — `express-rate-limit` in `server/server.js` (100 req/15 min per IP)
- ✅ **Loading states** — submit button disabled during API call (in `auth-manager.js`)

**Missing Features:**
- No email verification (tracked as Vikunja **#33**)
- No password reset
- No social login (OAuth) (tracked as Vikunja **#30**)
- No password strength feedback
- No confirm password field
- No show/hide password toggle

---

## Recommended Features to Add

### Priority 1: Core User Experience (Quick Wins)

| Feature | Description | Status |
|---------|-------------|--------|
| **Password Strength Meter** | Real-time visual feedback (weak/fair/strong) | 🔲 Not started |
| **Confirm Password Field** | Verify password matching during registration | 🔲 Not started |
| **Show/Hide Password Toggle** | Eye icon to reveal/hide password | 🔲 Not started |
| **Better Validation Messages** | Specific errors (email invalid, password too short) | 🔲 Not started |
| **Loading States** | Disable submit button during API call | ✅ **Implemented** |

---

### Priority 2: Security & Trust

| Feature | Description | Status |
|---------|-------------|--------|
| **Email Verification** | Send verification link after signup | 📋 Vikunja **#33** |
| **Terms & Privacy Checkbox** | Required consent checkbox | 🔲 Not started |
| **Rate Limiting** | Prevent abuse on signup endpoint | ✅ **Implemented** (`server.js`) |
| **Account Lockout** | Lock after 5 failed login attempts | 🔲 Not started |

---

### Priority 3: User Management

| Feature | Description | Status |
|---------|-------------|--------|
| **Forgot Password** | Email reset link flow | 🔲 Not started |
| **Profile Management** | Update email, change password | 🔲 Not started |
| **Account Deletion** | User can delete their account | 🔲 Not started (GDPR relevant) |

### Priority 4: Alternative Sign-In (tracked in Vikunja)

| Feature | Description | Status |
|---------|-------------|--------|
| **Google OAuth** | Sign in with Google | 📋 Vikunja **#30** |
| **GitHub OAuth** | Sign in with GitHub | 📋 Vikunja **#30** |
| **Magic Links** | Passwordless email login | 📋 Vikunja **#30** |
| **Guest Access** | Anonymous instant start | 📋 Vikunja **#31** |

---

## Implementation Detail: Password Strength Meter

### UI Components

```html
<!-- Add to registration form -->
<div class="password-strength-meter">
    <div class="strength-bar">
        <div class="strength-fill" id="passwordStrengthFill"></div>
    </div>
    <span class="strength-text" id="passwordStrengthText"></span>
</div>

<!-- Add confirm password field -->
<div class="form-group">
    <label>Confirm Password</label>
    <input type="password" id="authConfirmPassword" placeholder="Confirm your password">
    <span class="match-indicator" id="passwordMatchIndicator"></span>
</div>

<!-- Add show/hide toggle -->
<button type="button" class="toggle-password" id="togglePassword">
    <span class="eye-icon">👁️</span>
</button>
```

### Validation Logic

```javascript
// Password strength criteria
function getPasswordStrength(password) {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 2) return { level: 'weak', color: '#ef4444', percent: 33 };
    if (score <= 4) return { level: 'fair', color: '#f59e0b', percent: 66 };
    return { level: 'strong', color: '#10b981', percent: 100 };
}
```

---

## Implementation Detail: Email Verification Flow

### Backend Changes

```javascript
// server/routes/auth.js
router.post('/register', async (req, res) => {
    const { email, password } = req.body;

    // Create user with verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await User.create({
        email,
        password_hash: await bcrypt.hash(password, 10),
        verification_token: verificationToken,
        verified: false
    });

    // Send verification email
    await sendVerificationEmail(email, verificationToken);
    res.json({ message: 'Registration successful. Please check your email.' });
});

router.get('/verify/:token', async (req, res) => {
    const user = await User.findByVerificationToken(req.params.token);
    await User.markVerified(user.id);
    res.redirect('/login?verified=true');
});
```

### Frontend Changes

```javascript
// Show verification message
function showVerificationMessage(email) {
    const modal = document.createElement('div');
    modal.className = 'verification-modal';
    modal.innerHTML = `
        <h2>Check your email</h2>
        <p>We sent a verification link to <strong>${email}</strong></p>
        <button onclick="resendVerification()">Resend</button>
    `;
}
```

---

## Database Schema Updates

```sql
-- Add verification fields to users table
ALTER TABLE users ADD COLUMN verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN reset_token_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP;
```

---

## File Structure

```
project/
├── js/
│   └── services/
│       ├── auth-manager.js          (modify - add new features)
│       └── password-strength.js     (new - password validation)
├── server/
│   ├── routes/
│   │   └── auth.js                  (modify - add new endpoints)
│   ├── middleware/
│   │   └── rateLimiter.js           (new - rate limiting)
│   ├── utils/
│   │   └── mailer.js                (new - email sending)
│   └── models/
│       └── User.js                  (modify - add new methods)
├── css/
│   └── style.css                    (modify - add new styles)
└── index.html                       (modify - add new form fields)
```

---

## Priority Order Suggestion

1. **Start with:** Password Strength Meter + Confirm Password
2. **Then:** Show/Hide Password Toggle + Better Validation
3. **After:** Terms & Privacy Checkbox + Rate Limiting
4. **Later:** Email Verification + Forgot Password
5. **Finally:** Profile Management + Account Deletion

---

## Testing Considerations

Each new feature should have corresponding E2E tests in `tests/e2e/auth-flow.spec.js`:
- Test password strength meter updates correctly
- Test confirm password matching validation
- Test show/hide password toggle
- Test email verification flow (mock email service)
- Test password reset flow
