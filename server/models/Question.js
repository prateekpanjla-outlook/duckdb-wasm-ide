import { query } from '../config/database.js';

export class Question {
    /**
     * Get first question for practice mode
     */
    static async getFirstQuestion() {
        const text = `
            SELECT
                id, sql_data, sql_question, sql_solution,
                sql_solution_explanation, difficulty, category
            FROM questions
            ORDER BY order_index ASC, id ASC
            LIMIT 1
        `;
        const result = await query(text);
        return result.rows[0];
    }

    /**
     * Get next question after current question
     */
    static async getNextQuestion(currentQuestionId) {
        const text = `
            SELECT
                id, sql_data, sql_question, sql_solution,
                sql_solution_explanation, difficulty, category
            FROM questions
            WHERE order_index > (
                SELECT order_index FROM questions WHERE id = $1
            )
            OR (
                order_index = (SELECT order_index FROM questions WHERE id = $1)
                AND id > $1
            )
            ORDER BY order_index ASC, id ASC
            LIMIT 1
        `;
        const result = await query(text, [currentQuestionId]);
        return result.rows[0];
    }

    /**
     * Get question by ID
     */
    static async getById(id) {
        const text = `
            SELECT
                id, sql_data, sql_question, sql_solution,
                sql_solution_explanation, difficulty, category
            FROM questions
            WHERE id = $1
        `;
        const result = await query(text, [id]);
        return result.rows[0];
    }

    /**
     * Get all questions (with optional filters)
     */
    static async getAll(filters = {}) {
        let text = `
            SELECT
                id, sql_question, difficulty, category, order_index, sql_data
            FROM questions
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (filters.difficulty) {
            paramCount++;
            text += ` AND difficulty = $${paramCount}`;
            params.push(filters.difficulty);
        }

        if (filters.category) {
            paramCount++;
            text += ` AND category = $${paramCount}`;
            params.push(filters.category);
        }

        text += ' ORDER BY order_index ASC, id ASC';

        const result = await query(text, params);
        return result.rows;
    }

    /**
     * Create a new question (admin function)
     */
    static async create({
        sql_data,
        sql_question,
        sql_solution,
        sql_solution_explanation,
        difficulty = 'beginner',
        category = 'SELECT queries',
        order_index = null
    }) {
        // If order_index not provided, put it at the end
        if (order_index === null) {
            const maxOrderResult = await query(
                'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM questions'
            );
            order_index = maxOrderResult.rows[0].next_order;
        }

        const text = `
            INSERT INTO questions (
                sql_data, sql_question, sql_solution,
                sql_solution_explanation, difficulty, category, order_index
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const result = await query(text, [
            sql_data,
            sql_question,
            sql_solution,
            JSON.stringify(sql_solution_explanation),
            difficulty,
            category,
            order_index
        ]);

        return result.rows[0];
    }

    /**
     * Get total count of questions
     */
    static async getCount() {
        const text = 'SELECT COUNT(*) as count FROM questions';
        const result = await query(text);
        return parseInt(result.rows[0].count);
    }
}
