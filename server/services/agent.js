/**
 * Question Authoring Agent
 * Loops: Gemini call → tool execution → Gemini call → ... → final answer
 * Uses Gemini function calling API with rate limiting for free tier.
 */

import { TOOL_FUNCTIONS } from './agentTools.js';

const GEMINI_BASE_URL = process.env.GEMINI_API_URL
    || 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY;
const MAX_STEPS = parseInt(process.env.AGENT_MAX_STEPS || '10', 10);
const GEMINI_MIN_DELAY_MS = parseInt(process.env.GEMINI_MIN_DELAY_MS || '7000', 10);

// Daily usage tracking
let dailyCallCount = 0;
let dailyResetTime = Date.now();

function trackDailyUsage() {
    if (Date.now() - dailyResetTime > 24 * 60 * 60 * 1000) {
        dailyCallCount = 0;
        dailyResetTime = Date.now();
    }
    dailyCallCount++;
    if (dailyCallCount > 200) {
        console.warn(`Agent: approaching daily Gemini limit (${dailyCallCount}/250)`);
    }
}

/**
 * Enforce minimum delay between Gemini API calls (free tier: 10 RPM)
 */
async function enforceRateLimit(lastCallTime) {
    const elapsed = Date.now() - lastCallTime;
    if (lastCallTime > 0 && elapsed < GEMINI_MIN_DELAY_MS) {
        const waitMs = GEMINI_MIN_DELAY_MS - elapsed;
        console.log(`Agent: rate limit wait ${waitMs}ms`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
}

// Tool declarations for Gemini function calling
const TOOL_DECLARATIONS = [
    {
        name: "list_existing_questions",
        description: "List all existing practice questions with their topics, difficulty levels, and order indices. Use this first to check what already exists and determine the next available order_index.",
        parameters: { type: "object", properties: {} }
    },
    {
        name: "execute_sql",
        description: "Execute a SQL query to test if it runs correctly. Returns rows or error. Use this to validate individual SQL statements.",
        parameters: {
            type: "object",
            properties: {
                sql: { type: "string", description: "SQL statement to execute" }
            },
            required: ["sql"]
        }
    },
    {
        name: "validate_question",
        description: "Run the full validation pipeline for a generated question: create tables from sql_data, run the sql_solution, and verify the solution produces distinguishable results. Use this after generating question content.",
        parameters: {
            type: "object",
            properties: {
                sql_data: { type: "string", description: "CREATE TABLE and INSERT statements" },
                sql_solution: { type: "string", description: "The correct SQL solution query" }
            },
            required: ["sql_data", "sql_solution"]
        }
    },
    {
        name: "insert_question",
        description: "Insert a validated and approved question into the database. Only call this when explicitly told to insert by the admin.",
        parameters: {
            type: "object",
            properties: {
                sql_data: { type: "string" },
                sql_question: { type: "string" },
                sql_solution: { type: "string" },
                sql_solution_explanation: {
                    type: "array",
                    items: { type: "string" },
                    description: "Step-by-step explanation of the solution"
                },
                difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
                category: { type: "string" },
                order_index: { type: "integer" }
            },
            required: ["sql_data", "sql_question", "sql_solution", "sql_solution_explanation", "difficulty", "category", "order_index"]
        }
    },
    {
        name: "generate_test",
        description: "Generate a Playwright E2E test for a question. Call after the question has been inserted.",
        parameters: {
            type: "object",
            properties: {
                question_id: { type: "integer" },
                sql_solution: { type: "string" },
                question_text: { type: "string" }
            },
            required: ["question_id", "sql_solution", "question_text"]
        }
    },
    {
        name: "list_concepts",
        description: "List all SQL concepts in the taxonomy with their coverage count (how many questions use each concept as intended or alternative solution). Use this to understand what concepts are well-covered.",
        parameters: { type: "object", properties: {} }
    },
    {
        name: "get_coverage_gaps",
        description: "Get SQL concepts that have ZERO intended questions — these are gaps in the curriculum that need new questions. Use this to suggest what topics to cover next.",
        parameters: { type: "object", properties: {} }
    },
    {
        name: "check_concept_overlap",
        description: "Check if the concepts used in a generated question already have existing questions covering them. Call this AFTER generating a question and BEFORE presenting the preview, so the admin can see overlaps.",
        parameters: {
            type: "object",
            properties: {
                concepts: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of concept names to check (e.g. ['HAVING', 'GROUP BY'])"
                }
            },
            required: ["concepts"]
        }
    }
];

const SYSTEM_PROMPT = `You are a Question Authoring Agent for a SQL practice platform that uses DuckDB (PostgreSQL-compatible syntax).

Your job is to generate new SQL practice questions based on admin requests.

WORKFLOW:
1. First, call get_coverage_gaps to see which SQL concepts have no questions yet
2. Call list_existing_questions to find the next order_index and see existing topics
3. Generate a complete question targeting the requested concept
4. Call validate_question to verify the SQL is correct and the solution is distinguishable
5. If validation fails, fix the issue and re-validate
6. Call check_concept_overlap with the concepts your question covers, so the admin can see if any overlap with existing questions
7. Present the complete question as a JSON preview for admin approval
8. Do NOT call insert_question unless the admin explicitly says to insert
9. Complete steps 1-7 autonomously in a single session. Do not pause to ask for confirmation between steps — the admin will review the final preview.

CONCEPT TAXONOMY:
The platform maintains a taxonomy of ~35 SQL concepts (e.g. WHERE, GROUP BY, HAVING, INNER JOIN, RANK, CTE).
Each question is tagged with which concepts it covers (intended vs alternative solutions).
Use get_coverage_gaps to find untaught concepts. Use list_concepts for full coverage details.
When generating a question, include a "concepts" field listing which concepts it covers.

RULES:
- sql_data must use PostgreSQL-compatible SQL
- IMPORTANT: Do NOT reuse table names from existing questions. list_existing_questions returns used_table_names — pick different names.
- Use realistic data (real-sounding names, reasonable numbers)
- sql_solution_explanation must be an array of strings, each explaining one part of the query
- Difficulty levels: beginner (SELECT/WHERE), intermediate (JOIN/GROUP BY/HAVING), advanced (window functions/subqueries/CTEs)
- Category should describe the main SQL concept tested
- Create 8-15 rows of sample data
- The solution must produce results clearly different from SELECT * (distinguishable)

IMPORTANT: When presenting the final preview, output it as a JSON code block like:
\`\`\`json
{
  "sql_data": "...",
  "sql_question": "...",
  "sql_solution": "...",
  "sql_solution_explanation": ["...", "..."],
  "difficulty": "...",
  "category": "...",
  "order_index": N,
  "concepts": [
    {"name": "HAVING", "is_intended": true},
    {"name": "GROUP BY", "is_intended": true},
    {"name": "Subquery in WHERE", "is_intended": false}
  ]
}
\`\`\``;

/**
 * Run the agent loop
 * @param {string} userPrompt - Admin's natural language request
 * @param {object[]} existingHistory - Previous conversation turns (for follow-ups)
 * @returns {{ steps: object[], messages: object[] }}
 */
export async function runAgent(userPrompt, existingHistory = [], onStep = null) {
    if (!API_KEY) {
        const errorStep = { type: 'error', content: 'GEMINI_API_KEY not configured' };
        if (onStep) onStep(errorStep);
        return { steps: [errorStep], messages: [] };
    }

    const messages = existingHistory.length > 0
        ? [...existingHistory, { role: 'user', parts: [{ text: userPrompt }] }]
        : [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\nAdmin request: ' + userPrompt }] }];

    const steps = [];
    let stepCount = 0;
    let lastCallTime = 0;

    while (stepCount < MAX_STEPS) {
        stepCount++;

        // Rate limit
        await enforceRateLimit(lastCallTime);
        lastCallTime = Date.now();
        trackDailyUsage();

        // Call Gemini
        const startTime = Date.now();
        let data;
        try {
            const response = await fetch(
                `${GEMINI_BASE_URL}/${MODEL}:generateContent?key=${API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: messages,
                        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
                        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 4096
                        }
                    }),
                    signal: AbortSignal.timeout(30000)
                }
            );

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API ${response.status}: ${errText.substring(0, 200)}`);
            }

            data = await response.json();
        } catch (error) {
            steps.push({ type: 'error', content: `Gemini call failed: ${error.message}`, latencyMs: Date.now() - startTime });
            break;
        }

        const latencyMs = Date.now() - startTime;

        if (!data.candidates?.[0]?.content?.parts) {
            steps.push({ type: 'error', content: 'No response from Gemini', latencyMs });
            break;
        }

        const parts = data.candidates[0].content.parts;
        messages.push({ role: 'model', parts });

        // Check for tool call
        const toolCall = parts.find(p => p.functionCall);
        const textPart = parts.find(p => p.text);

        if (toolCall) {
            const { name, args } = toolCall.functionCall;

            const toolCallStep = {
                type: 'tool_call',
                tool: name,
                input: args,
                latencyMs
            };
            steps.push(toolCallStep);
            if (onStep) onStep(toolCallStep);

            console.log(`Agent tool call: ${name}(${JSON.stringify(args).substring(0, 100)})`);

            // Execute the tool
            let toolResult;
            try {
                const toolFn = TOOL_FUNCTIONS[name];
                if (!toolFn) throw new Error(`Unknown tool: ${name}`);
                toolResult = typeof args === 'object' ? await toolFn(args) : await toolFn();
            } catch (error) {
                toolResult = { error: error.message };
            }

            const toolResultStep = {
                type: 'tool_result',
                tool: name,
                result: toolResult
            };
            steps.push(toolResultStep);
            if (onStep) onStep(toolResultStep);

            // Add tool result to conversation for next Gemini call
            messages.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name,
                        response: toolResult
                    }
                }]
            });

            continue;
        }

        if (textPart) {
            const answerStep = {
                type: 'answer',
                content: textPart.text,
                latencyMs
            };
            steps.push(answerStep);
            if (onStep) onStep(answerStep);
            break;
        }
    }

    if (stepCount >= MAX_STEPS) {
        const limitStep = { type: 'error', content: 'Agent reached maximum step limit' };
        steps.push(limitStep);
        if (onStep) onStep(limitStep);
    }

    console.log(`Agent completed: ${steps.length} steps, ${stepCount} Gemini calls, daily usage: ${dailyCallCount}/250`);

    return { steps, messages };
}
