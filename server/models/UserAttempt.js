import { query, getClient } from '../config/database.js';

export class UserAttempt {
    /**
     * Record a user's attempt at a question
     * Uses a transaction to prevent race conditions on attempt counting
     */
    static async create({
        userId,
        questionId,
        userQuery,
        isCorrect,
        timeTakenSeconds = null
    }) {
        const client = await getClient();
        try {
            await client.query('BEGIN');

            // Lock rows for this user+question to prevent concurrent count mismatch
            const countResult = await client.query(
                `SELECT COUNT(*) as attempts
                 FROM user_attempts
                 WHERE user_id = $1 AND question_id = $2
                 FOR UPDATE`,
                [userId, questionId]
            );
            const attemptsCount = parseInt(countResult.rows[0].attempts) + 1;

            const result = await client.query(
                `INSERT INTO user_attempts (
                    user_id, question_id, user_query,
                    is_correct, attempts_count, completed_at, time_taken_seconds
                )
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
                RETURNING *`,
                [userId, questionId, userQuery, isCorrect, attemptsCount, timeTakenSeconds]
            );

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get user's progress grouped by question (single query, replaces N+1 loop)
     */
    static async getUserProgressByQuestion(userId) {
        const text = `
            SELECT
                question_id,
                COUNT(*) as attempts,
                BOOL_OR(is_correct) as completed,
                MAX(completed_at) as last_attempt
            FROM user_attempts
            WHERE user_id = $1
            GROUP BY question_id
        `;

        const result = await query(text, [userId]);
        const progress = {};
        for (const row of result.rows) {
            progress[row.question_id] = {
                attempts: parseInt(row.attempts),
                completed: row.completed,
                lastAttempt: row.last_attempt
            };
        }
        return progress;
    }

    /**
     * Get user's progress statistics
     */
    static async getUserProgress(userId) {
        const text = `
            SELECT
                COUNT(*) as total_attempts,
                COUNT(DISTINCT question_id) as unique_questions_attempted,
                SUM(CASE WHEN is_correct = true THEN 1 ELSE 0 END) as correct_attempts,
                SUM(CASE WHEN is_correct = true THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as success_rate,
                AVG(time_taken_seconds) as avg_time_seconds,
                MAX(completed_at) as last_attempt_at
            FROM user_attempts
            WHERE user_id = $1
        `;

        const result = await query(text, [userId]);
        return result.rows[0];
    }

    /**
     * Get user's attempts for a specific question
     */
    static async getUserQuestionAttempts(userId, questionId) {
        const text = `
            SELECT
                id, user_query, is_correct, attempts_count,
                completed_at, time_taken_seconds
            FROM user_attempts
            WHERE user_id = $1 AND question_id = $2
            ORDER BY completed_at DESC
        `;

        const result = await query(text, [userId, questionId]);
        return result.rows;
    }

    /**
     * Get user's attempts for a specific question (alias)
     */
    static async getQuestionAttempts(userId, questionId) {
        const text = `
            SELECT
                id, user_query, is_correct, attempts_count,
                completed_at, time_taken_seconds
            FROM user_attempts
            WHERE user_id = $1 AND question_id = $2
            ORDER BY completed_at DESC
        `;

        const result = await query(text, [userId, questionId]);
        return result.rows;
    }

    /**
     * Get user's recent attempts (across all questions)
     */
    static async getRecentAttempts(userId, limit = 10) {
        const text = `
            SELECT
                ua.id,
                ua.is_correct,
                ua.attempts_count,
                ua.completed_at,
                ua.time_taken_seconds,
                q.sql_question,
                q.difficulty,
                q.category
            FROM user_attempts ua
            JOIN questions q ON ua.question_id = q.id
            WHERE ua.user_id = $1
            ORDER BY ua.completed_at DESC
            LIMIT $2
        `;

        const result = await query(text, [userId, limit]);
        return result.rows;
    }

    /**
     * Get user's completed questions (correct answers)
     */
    static async getCompletedQuestions(userId) {
        const text = `
            SELECT DISTINCT
                q.id,
                q.sql_question,
                q.difficulty,
                q.category,
                ua.completed_at
            FROM user_attempts ua
            JOIN questions q ON ua.question_id = q.id
            WHERE ua.user_id = $1 AND ua.is_correct = true
            ORDER BY ua.completed_at DESC
        `;

        const result = await query(text, [userId]);
        return result.rows;
    }

    /**
     * Check if user has correctly answered a question
     */
    static async isQuestionCompleted(userId, questionId) {
        const text = `
            SELECT EXISTS(
                SELECT 1 FROM user_attempts
                WHERE user_id = $1 AND question_id = $2 AND is_correct = true
            )
        `;

        const result = await query(text, [userId, questionId]);
        return result.rows[0].exists;
    }
}
