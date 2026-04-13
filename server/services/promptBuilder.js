/**
 * Build Gemini prompts for AI-assisted SQL tutoring.
 * Pure functions — no side effects, easy to test.
 */

const SYSTEM_PROMPTS = {
    hint: (difficulty) =>
        `You are a SQL tutor for ${difficulty} level students practicing on DuckDB. ` +
        `Do NOT give the answer directly. Guide with hints and questions. ` +
        `2-3 sentences max. Skip filler like "Great question!" or "Good effort!" — go straight to the hint.`,

    explain_error: (difficulty) =>
        `You are a SQL tutor for ${difficulty} level students practicing on DuckDB. ` +
        `Explain the error in simple terms a ${difficulty} student would understand. ` +
        `Suggest how to fix it without giving the full answer. 2-3 sentences max. ` +
        `Skip filler like "Great question!" — go straight to the explanation.`,

    explain_solution: (difficulty) =>
        `You are a SQL tutor for ${difficulty} level students practicing on DuckDB. ` +
        `Explain the solution step by step. Be clear and concise. ` +
        `Help the student understand WHY each part of the query works. ` +
        `Skip filler like "Great question!" — go straight to the explanation.`
};

/**
 * Build a prompt for the Gemini API.
 *
 * @param {Object} params
 * @param {string} params.type - 'hint' | 'explain_error' | 'explain_solution'
 * @param {string} params.sqlData - CREATE TABLE + INSERT statements
 * @param {string} params.sqlQuestion - The question text
 * @param {string} params.difficulty - 'beginner' | 'intermediate' | 'advanced'
 * @param {string} params.userQuery - The student's SQL attempt
 * @param {string|null} params.errorMessage - DuckDB error message if any
 * @param {string|null} params.sqlSolution - Correct solution (for explain_solution only)
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildPrompt({ type, sqlData, sqlQuestion, difficulty, userQuery, errorMessage, sqlSolution }) {
    const systemPrompt = SYSTEM_PROMPTS[type]?.(difficulty) || SYSTEM_PROMPTS.hint(difficulty);

    // Extract just the schema (CREATE TABLE lines) for context — skip INSERT data to save tokens
    const schemaLines = sqlData
        .split('\n')
        .filter(line => /^\s*(CREATE|--)/i.test(line.trim()) || /\);/.test(line))
        .join('\n')
        .trim();

    let userPrompt = `Table schema:\n${schemaLines || sqlData}\n\n`;
    userPrompt += `Question: ${sqlQuestion}\n\n`;

    if (userQuery) {
        userPrompt += `Student's query:\n${userQuery}\n\n`;
    }

    if (type === 'explain_error' && errorMessage) {
        userPrompt += `Error message: ${errorMessage}\n\n`;
        userPrompt += `Explain this error and suggest how to fix it.`;
    } else if (type === 'explain_solution' && sqlSolution) {
        userPrompt += `Correct solution:\n${sqlSolution}\n\n`;
        userPrompt += `Explain this solution step by step.`;
    } else {
        userPrompt += `Give a hint without revealing the answer.`;
    }

    return { systemPrompt, userPrompt };
}
