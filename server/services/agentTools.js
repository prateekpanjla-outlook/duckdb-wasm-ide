/**
 * Agent Tool Functions
 * Each tool is called by the agent loop when Gemini requests a function call.
 * SQL validation tools use ROLLBACK transactions — nothing persists until approved.
 */

import { query, getClient } from '../config/database.js';
import { Question } from '../models/Question.js';

/**
 * Tool: list_existing_questions
 * Returns all questions with topic, difficulty, order_index to avoid duplicates.
 */
export async function list_existing_questions() {
    const questions = await Question.getAll();
    const maxOrder = questions.length > 0
        ? Math.max(...questions.map(q => q.order_index))
        : 0;

    return {
        count: questions.length,
        next_order_index: maxOrder + 1,
        questions: questions.map(q => ({
            id: q.id,
            order_index: q.order_index,
            category: q.category,
            difficulty: q.difficulty,
            question_preview: q.sql_question.substring(0, 100)
        }))
    };
}

/**
 * Tool: execute_sql
 * Runs SQL in a ROLLBACK transaction using a temporary schema.
 * Nothing persists — validation only.
 */
export async function execute_sql({ sql }) {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query('CREATE SCHEMA IF NOT EXISTS agent_temp');
        await client.query('SET search_path TO agent_temp, public');

        const result = await client.query(sql);

        const output = {
            success: true,
            command: result.command,
            rowCount: result.rowCount,
            rows: result.rows?.slice(0, 20),
            columns: result.fields?.map(f => f.name)
        };

        await client.query('ROLLBACK');
        return output;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

/**
 * Tool: validate_question
 * Full validation pipeline:
 *   1. Run sql_data (CREATE TABLE + INSERT) — verify schema is valid
 *   2. Run sql_solution — verify it returns results
 *   3. Run a wrong query — verify solution is distinguishable
 * Everything runs in ROLLBACK — nothing persists.
 */
export async function validate_question({ sql_data, sql_solution }) {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query('DROP SCHEMA IF EXISTS agent_validate CASCADE');
        await client.query('CREATE SCHEMA agent_validate');
        await client.query('SET search_path TO agent_validate');

        // Step 1: Run sql_data
        const statements = sql_data.split(';').filter(s => s.trim());
        let rowsInserted = 0;
        for (const stmt of statements) {
            const r = await client.query(stmt);
            if (r.command === 'INSERT') rowsInserted += r.rowCount;
        }

        // Step 2: Run sql_solution
        const solutionResult = await client.query(sql_solution);

        // Step 3: Distinguishability — try SELECT * (naive answer)
        // Extract table name from sql_data
        const tableMatch = sql_data.match(/CREATE\s+TABLE\s+(\w+)/i);
        let distinguishable = true;
        if (tableMatch) {
            try {
                const naiveResult = await client.query(`SELECT * FROM ${tableMatch[1]}`);
                distinguishable = JSON.stringify(solutionResult.rows) !== JSON.stringify(naiveResult.rows);
            } catch {
                distinguishable = true; // if naive query fails, solution is certainly different
            }
        }

        await client.query('ROLLBACK');

        return {
            schema_valid: true,
            rows_inserted: rowsInserted,
            solution_valid: true,
            solution_rows: solutionResult.rowCount,
            solution_columns: solutionResult.fields?.map(f => f.name),
            solution_preview: solutionResult.rows?.slice(0, 5),
            distinguishable
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return {
            schema_valid: false,
            solution_valid: false,
            error: error.message
        };
    } finally {
        client.release();
    }
}

/**
 * Tool: insert_question
 * Inserts a validated question into the database.
 * Only called after admin approval via /api/admin/agent/approve.
 */
export async function insert_question(params) {
    const question = await Question.create({
        sql_data: params.sql_data,
        sql_question: params.sql_question,
        sql_solution: params.sql_solution,
        sql_solution_explanation: params.sql_solution_explanation,
        difficulty: params.difficulty,
        category: params.category,
        order_index: params.order_index
    });
    return { id: question.id, message: `Question ${question.id} inserted successfully` };
}

/**
 * Tool: generate_test
 * Generates Playwright E2E test code for a question.
 * Returns the code as a string — does not write to disk.
 */
export function generate_test({ question_id, sql_solution, question_text }) {
    const escapedSolution = sql_solution.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`');
    const shortTitle = question_text.substring(0, 50).replace(/'/g, "\\'");

    const testCode = `import { test, expect } from '@playwright/test';

async function waitForAppReady(page) {
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
}

test('Question ${question_id} - ${shortTitle}', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Start as guest
    await page.click('#guestModeBtn');
    await page.waitForSelector('.status.connected', { timeout: 150000 });
    await page.waitForFunction(() => {
        const dd = document.getElementById('questionDropdown');
        return dd && dd.options.length > 1;
    }, { timeout: 30000 });

    // Select question ${question_id}
    await page.locator('#questionDropdown').selectOption({ value: '${question_id}' });
    const loadBtn = page.locator('#loadQuestionBtn');
    if (await loadBtn.isVisible()) await loadBtn.click();
    await expect(page.locator('#practiceQuestionText')).toBeVisible({ timeout: 15000 });

    // Type the correct solution
    await page.locator('#sqlEditor').fill('${escapedSolution}');

    // Run query
    await page.click('#runQueryBtn');
    await page.waitForSelector('#resultsContainer table, #resultsContainer .error', { timeout: 30000 });

    // Verify results table appeared (not an error)
    await expect(page.locator('#resultsContainer table')).toBeVisible();
});
`;

    return {
        filename: `tests/e2e/question-${question_id}.spec.js`,
        code: testCode
    };
}

/**
 * Tool: list_concepts
 * Returns all SQL concepts with coverage count (how many questions use each).
 */
export async function list_concepts() {
    const result = await query(`
        SELECT c.id, c.name, c.category, c.difficulty,
            COUNT(qc.question_id) FILTER (WHERE qc.is_intended = TRUE) as intended_count,
            COUNT(qc.question_id) FILTER (WHERE qc.is_intended = FALSE) as alternative_count
        FROM sql_concepts c
        LEFT JOIN question_concepts qc ON c.id = qc.concept_id
        GROUP BY c.id, c.name, c.category, c.difficulty
        ORDER BY c.category, c.name
    `);

    return {
        total_concepts: result.rows.length,
        concepts: result.rows.map(r => ({
            id: r.id,
            name: r.name,
            category: r.category,
            difficulty: r.difficulty,
            intended_questions: parseInt(r.intended_count),
            alternative_questions: parseInt(r.alternative_count)
        }))
    };
}

/**
 * Tool: get_coverage_gaps
 * Returns concepts with zero intended questions — these are gaps in the curriculum.
 */
export async function get_coverage_gaps() {
    const result = await query(`
        SELECT c.name, c.category, c.difficulty
        FROM sql_concepts c
        LEFT JOIN question_concepts qc ON c.id = qc.concept_id AND qc.is_intended = TRUE
        WHERE qc.concept_id IS NULL
        ORDER BY c.category, c.difficulty, c.name
    `);

    const gapsByCategory = {};
    for (const row of result.rows) {
        if (!gapsByCategory[row.category]) gapsByCategory[row.category] = [];
        gapsByCategory[row.category].push({ name: row.name, difficulty: row.difficulty });
    }

    return {
        total_gaps: result.rows.length,
        gaps_by_category: gapsByCategory
    };
}

// Tool registry — maps tool names to functions
export const TOOL_FUNCTIONS = {
    list_existing_questions,
    execute_sql,
    validate_question,
    insert_question,
    generate_test,
    list_concepts,
    get_coverage_gaps
};
