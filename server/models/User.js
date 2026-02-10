import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';

export class User {
    /**
     * Create a new user
     */
    static async create({ email, password }) {
        // Hash password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        const text = `
            INSERT INTO users (email, password_hash)
            VALUES ($1, $2)
            RETURNING id, email, created_at
        `;

        try {
            const result = await query(text, [email, password_hash]);
            return result.rows[0];
        } catch (error) {
            if (error.code === '23505') { // Unique violation
                throw new Error('Email already exists');
            }
            throw error;
        }
    }

    /**
     * Find user by email
     */
    static async findByEmail(email) {
        const text = 'SELECT * FROM users WHERE email = $1';
        const result = await query(text, [email]);
        return result.rows[0];
    }

    /**
     * Find user by ID
     */
    static async findById(id) {
        const text = 'SELECT id, email, created_at, last_login FROM users WHERE id = $1';
        const result = await query(text, [id]);
        return result.rows[0];
    }

    /**
     * Verify password
     */
    static async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    /**
     * Update last login timestamp
     */
    static async updateLastLogin(id) {
        const text = `
            UPDATE users
            SET last_login = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, email, last_login
        `;
        const result = await query(text, [id]);
        return result.rows[0];
    }

    /**
     * Get user profile (safe data only)
     */
    static async getProfile(id) {
        const text = `
            SELECT
                id, email, created_at, last_login,
                (SELECT COUNT(*) FROM user_attempts WHERE user_id = users.id) as total_attempts,
                (SELECT COUNT(*) FROM user_attempts WHERE user_id = users.id AND is_correct = true) as correct_attempts
            FROM users
            WHERE id = $1
        `;
        const result = await query(text, [id]);
        return result.rows[0];
    }
}
