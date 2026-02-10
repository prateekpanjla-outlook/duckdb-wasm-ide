import { query } from '../config/database.js';

export class UserSession {
    /**
     * Get user's session
     */
    static async get(userId) {
        const text = `
            SELECT
                user_id,
                current_question_id,
                practice_mode_active,
                last_activity
            FROM user_sessions
            WHERE user_id = $1
        `;

        const result = await query(text, [userId]);
        return result.rows[0] || null;
    }

    /**
     * Create or update user session
     */
    static async upsert({
        userId,
        currentQuestionId = null,
        practiceModeActive = false
    }) {
        const text = `
            INSERT INTO user_sessions (user_id, current_question_id, practice_mode_active)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id)
            DO UPDATE SET
                current_question_id = COALESCE($2, user_sessions.current_question_id),
                practice_mode_active = $3,
                last_activity = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const result = await query(text, [userId, currentQuestionId, practiceModeActive]);
        return result.rows[0];
    }

    /**
     * Update current question
     */
    static async updateCurrentQuestion(userId, questionId) {
        const text = `
            UPDATE user_sessions
            SET current_question_id = $2, last_activity = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING *
        `;

        const result = await query(text, [userId, questionId]);
        return result.rows[0];
    }

    /**
     * Set practice mode active state
     */
    static async setPracticeMode(userId, isActive) {
        const text = `
            UPDATE user_sessions
            SET practice_mode_active = $2, last_activity = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING *
        `;

        const result = await query(text, [userId, isActive]);
        return result.rows[0];
    }

    /**
     * Clear user session
     */
    static async clear(userId) {
        const text = `
            UPDATE user_sessions
            SET practice_mode_active = false,
                current_question_id = NULL,
                last_activity = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING *
        `;

        const result = await query(text, [userId]);
        return result.rows[0];
    }

    /**
     * Delete user session
     */
    static async delete(userId) {
        const text = 'DELETE FROM user_sessions WHERE user_id = $1 RETURNING *';
        const result = await query(text, [userId]);
        return result.rows[0];
    }
}
