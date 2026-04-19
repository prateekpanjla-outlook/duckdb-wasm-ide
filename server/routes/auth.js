import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { validateRegister, validateLogin } from '../middleware/validate.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', validateRegister, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Create user
        const user = await User.create({ email, password });

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user.id,
                email: user.email
            },
            token
        });
    } catch (error) {
        if (error.message === 'Email already exists') {
            return res.status(409).json({ error: error.message });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * Login existing user
 */
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findByEmail(email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Verify password
        const isPasswordValid = await User.verifyPassword(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Update last login
        await User.updateLastLogin(user.id);

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const profile = await User.getProfile(req.user.id);
        res.json({ user: profile });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token deletion)
 */
router.post('/logout', authenticate, async (req, res) => {
    // In a JWT-based system, logout is handled client-side by deleting the token
    // This endpoint is for logging or future session invalidation
    res.json({ message: 'Logout successful' });
});

/**
 * POST /api/auth/guest
 * Create an anonymous guest user and return JWT.
 * Guest is a real row in users table with is_guest=true.
 * All existing practice routes work without modification.
 */
router.post('/guest', async (req, res) => {
    try {
        const guestId = crypto.randomUUID().substring(0, 8);
        const guestEmail = `guest-${guestId}@guest.local`;
        const guestPassword = crypto.randomBytes(32).toString('hex');

        const user = await User.create({ email: guestEmail, password: guestPassword });

        // Mark as guest
        await query('UPDATE users SET is_guest = TRUE WHERE id = $1', [user.id]);

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log(`Guest created: id=${user.id} email=${guestEmail}`);

        res.status(201).json({
            message: 'Guest session created',
            user: { id: user.id, email: user.email, isGuest: true },
            token
        });
    } catch (error) {
        console.error('Guest creation error:', error);
        res.status(500).json({ error: 'Failed to create guest session' });
    }
});

/**
 * POST /api/auth/guest/upgrade
 * Convert guest account to registered account.
 * Same user ID — all progress (attempts, sessions) is preserved.
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

        if (!email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Email and password (min 6 chars) required' });
        }

        // Check email not taken
        const existing = await User.findByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        await query(
            'UPDATE users SET email = $1, password_hash = $2, is_guest = FALSE WHERE id = $3',
            [email, password_hash, userId]
        );

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

export default router;
