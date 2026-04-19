# Question Authoring Agent — Comprehensive Plan

## Part 0: Agent vs Admin — Responsibility Split

### What the Admin does (human judgment)
- **Decides what topic to add** — "We need a HAVING question"
- **Reviews if the question is well-worded** — Is it clear? Ambiguous?
- **Judges if the difficulty is appropriate** — Is this really "intermediate"?
- **Decides if the data is realistic** — Do these numbers make sense?
- **Approves or rejects** — Final gatekeeper

### What the Agent does (automation)
- **Generates SQL** — CREATE TABLE, INSERT, solution query, explanation
- **Validates SQL is syntactically correct** — Does it run without errors?
- **Validates solution is distinguishable** — Does it return different results than SELECT *?
- **Identifies concept gaps** — Queries the taxonomy for uncovered concepts
- **Determines next order_index** — Where to slot the question
- **Tags new questions with concepts** — Intended and alternative solution approaches
- **Generates test code** — Playwright test for the new question

### What the Agent CANNOT do
- Judge whether a concept is already "covered" by existing questions (a question may be solvable via an approach different from the stored solution)
- Assess pedagogical quality — is this a good learning question?
- Determine if the data tells a believable story
- Know what the admin's curriculum plan is

### Summary

| | Admin | Agent |
|---|---|---|
| **What** to create | Decides | Follows |
| **How** to create (SQL) | Reviews | Generates |
| **Is it valid SQL?** | Trusts agent | Verifies |
| **Is it a good question?** | Judges | Can't judge |
| **What concepts are missing?** | Informed by agent | Queries taxonomy |
| **Insert into DB?** | Approves | Executes |

The agent is a **code generator with validation** — not a curriculum designer. The admin brings intent and judgment, the agent brings speed and correctness checking.

---

## Part 1: Analysis

### Current State
- **Gemini integration**: `gemini.js` calls Gemini 2.5 Flash via REST, 500 max tokens, 0.7 temp
- **Prompt builder**: `promptBuilder.js` builds system + user prompts by type (hint/explain_error/explain_solution)
- **AI route**: `POST /api/ai/hint` — authenticated, rate-limited (10/hr), cached, logs to `ai_usage` table
- **Question model**: `Question.create()` exists but has no auth gate — anyone with DB access can insert
- **Question format**: `sql_data` (CREATE+INSERT), `sql_question`, `sql_solution`, `sql_solution_explanation` (JSON array), `difficulty`, `category`, `order_index`
- **No admin system**: No roles, no admin flag, no admin routes
- **Frontend AI panel**: `practice-manager.js` has typing animation, collapsible panel, loading spinner

### Gemini Free Tier Rate Limits
- **10 RPM** (requests per minute) — 1 request every 6 seconds
- **250 RPD** (requests per day)
- **250,000 TPM** (tokens per minute)
- An agent run with 3-5 tool calls = 3-5 Gemini calls
- At 6s spacing, one agent run takes ~18-30 seconds minimum
- With 250 RPD, we can run ~50-80 agent sessions per day

### What We're Building
An agentic endpoint that takes a natural language prompt ("Add a question about RANK()"), runs a multi-step tool loop with Gemini, generates a verified question, and presents it for admin approval before inserting.

### Assignment Requirements Mapping
| Requirement | How we meet it |
|---|---|
| Call LLM multiple times | 3-5 Gemini calls per question generation |
| Each query stores ALL past interaction | Full conversation history array passed each call |
| 3+ custom tool functions | 5 tools: list_questions, execute_sql, validate_question, insert_question, generate_test |
| Display reasoning chain | Frontend shows each step with tool name, input, result |
| Can't do without tools | LLM doesn't know existing questions, can't run SQL, can't insert into DB |

---

## Part 2: Architecture Design

### Auth: Shared Secret (Option 3)

```
# .env
ADMIN_SECRET=your-admin-secret-key-here
```

All admin endpoints require header:
```
X-Admin-Key: your-admin-secret-key-here
```

No user model changes. No DB changes. Simple middleware:

```javascript
function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!key || key !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: 'Invalid admin key' });
    }
    next();
}
```

### Agent Loop Architecture

```
┌──────────────────────────────────────────────────────┐
│  POST /api/admin/agent                                │
│  Header: X-Admin-Key: secret                          │
│  Body: { prompt: "Add a question about RANK()" }      │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  Agent Loop (server/services/agent.js)                │
│                                                       │
│  messages = [system_prompt, user_prompt]               │
│  steps = []                                           │
│  lastCallTime = 0                                     │
│                                                       │
│  while (not done) {                                   │
│    await enforceRateLimit(lastCallTime)  // 6s min gap │
│    lastCallTime = Date.now()                          │
│    response = await gemini.chat(messages)              │
│                                                       │
│    if response has tool_call:                          │
│      result = await executeTool(tool_call)             │
│      steps.push({ tool, input, result })              │
│      messages.push(assistant_msg, tool_result)         │
│      continue                                         │
│                                                       │
│    if response is final_answer:                        │
│      steps.push({ type: 'answer', content })          │
│      break                                            │
│  }                                                    │
│                                                       │
│  return { steps, question_preview }                   │
└──────────────────────────────────────────────────────┘
```

### Rate Limiting Strategy

**Problem**: Gemini free tier allows 10 RPM. Agent loop makes 3-5 calls in quick succession.

**Solution**: Enforce minimum delay between Gemini API calls at the agent loop level.

```javascript
const GEMINI_MIN_DELAY_MS = parseInt(process.env.GEMINI_MIN_DELAY_MS || '7000', 10);

async function enforceRateLimit(lastCallTime) {
    const elapsed = Date.now() - lastCallTime;
    if (lastCallTime > 0 && elapsed < GEMINI_MIN_DELAY_MS) {
        const waitMs = GEMINI_MIN_DELAY_MS - elapsed;
        console.log(`Agent: rate limit wait ${waitMs}ms`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
}
```

**Config**: `GEMINI_MIN_DELAY_MS=7000` (7 seconds, slightly above the 6s minimum for safety margin)

**Why at the agent loop level, not globally**:
- The existing `/api/ai/hint` endpoint is single-call, user-triggered, already rate-limited at 10/hr per user
- The agent is the only consumer that makes rapid sequential calls
- A global rate limiter would need shared state (Redis etc.) — overkill for this
- Per-loop delay is simple, deterministic, and sufficient

**Frontend implications**:
- Agent panel shows "Waiting for rate limit..." between steps
- Each step streams to the UI as it completes (not all at once at the end)
- Total agent run time: ~30-40 seconds for a 5-step flow (acceptable for an admin tool)

**Daily budget tracking** (optional, for awareness):
```javascript
let dailyCallCount = 0;
let dailyResetTime = Date.now();

function trackDailyUsage() {
    if (Date.now() - dailyResetTime > 24 * 60 * 60 * 1000) {
        dailyCallCount = 0;
        dailyResetTime = Date.now();
    }
    dailyCallCount++;
    if (dailyCallCount > 200) {  // warn at 80% of 250 RPD
        console.warn(`Agent: approaching daily Gemini limit (${dailyCallCount}/250)`);
    }
}
```

### The 5 Tools

```javascript
const TOOLS = [
    {
        name: "list_existing_questions",
        description: "List all existing practice questions with their topics, difficulty, and order_index. Use this to check what already exists and avoid duplicates.",
        parameters: {}  // no params
    },
    {
        name: "execute_sql",
        description: "Execute a SQL query on DuckDB to validate that CREATE TABLE, INSERT, and SELECT statements work correctly. Returns rows or error message.",
        parameters: {
            sql: { type: "string", description: "The SQL statement to execute" }
        }
    },
    {
        name: "validate_question",
        description: "Run the complete validation pipeline: execute sql_data to create tables, execute sql_solution to verify it returns results, execute a deliberately wrong query to verify the solution is distinguishable. Returns validation report.",
        parameters: {
            sql_data: { type: "string", description: "CREATE TABLE and INSERT statements" },
            sql_solution: { type: "string", description: "The correct SQL query" }
        }
    },
    {
        name: "insert_question",
        description: "Insert a validated question into the database. Only call this AFTER admin has approved the preview. Returns the new question ID.",
        parameters: {
            sql_data: { type: "string" },
            sql_question: { type: "string" },
            sql_solution: { type: "string" },
            sql_solution_explanation: { type: "array", items: { type: "string" } },
            difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
            category: { type: "string" },
            order_index: { type: "integer" }
        }
    },
    {
        name: "generate_test",
        description: "Generate a Playwright E2E test file for a question. Returns the test code as a string.",
        parameters: {
            question_id: { type: "integer" },
            sql_solution: { type: "string" },
            question_text: { type: "string" }
        }
    }
];
```

### Agent Flow — Expected Step Sequence

```
Prompt: "Add a medium question about window functions using RANK()"

Step 1: LLM decides to check existing questions
  → Tool: list_existing_questions()
  → Result: 20 questions listed, none cover RANK(), next order_index=21

Step 2: LLM generates question content internally, then validates
  → Tool: validate_question({
      sql_data: "CREATE TABLE sales_reps (...); INSERT INTO ...",
      sql_solution: "SELECT name, RANK() OVER (...) FROM sales_reps"
    })
  → Result: {
      schema_valid: true, rows_inserted: 12,
      solution_valid: true, solution_rows: 12,
      distinguishable: true
    }

Step 3: LLM presents the question preview as final answer
  → Returns structured preview with all fields for admin review

--- HUMAN APPROVAL GATE ---

Step 4 (separate request): Admin clicks "Approve"
  → POST /api/admin/agent/approve
  → Tool: insert_question({...all fields...})
  → Result: { id: 21, message: "Question inserted" }

Step 5 (optional): Generate and run test
  → Tool: generate_test({ question_id: 21, sql_solution: "...", question_text: "..." })
  → Result: { test_file: "tests/e2e/question-21.spec.js", test_code: "..." }
```

### Gemini Tool Calling Format

Gemini's `functionCalling` API (not the hint-style text generation we use now):

```javascript
const response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        contents: messages,
        tools: [{ functionDeclarations: TOOLS }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: {
            temperature: 0.3,  // lower for structured output
            maxOutputTokens: 2048  // agent needs more tokens
        }
    })
});
```

Response may contain `functionCall` instead of text:
```json
{
    "candidates": [{
        "content": {
            "parts": [{
                "functionCall": {
                    "name": "list_existing_questions",
                    "args": {}
                }
            }]
        }
    }]
}
```

We then execute the tool, add the result as a `functionResponse`, and call Gemini again.

---

## Part 3: Detailed Implementation

### Files to Create (4)

| File | Purpose |
|---|---|
| `server/services/agent.js` | Agent loop: Gemini ↔ tools, conversation history, step tracking |
| `server/services/agentTools.js` | Tool implementations (list_questions, execute_sql, validate, insert, generate_test) |
| `server/routes/admin.js` | `POST /api/admin/agent`, `POST /api/admin/agent/approve`, admin auth middleware |
| `js/services/agent-panel.js` | Frontend: admin panel UI, reasoning chain display, approve/reject buttons |

### Files to Modify (4)

| File | Change |
|---|---|
| `server/server.js` | Mount admin routes: `app.use('/api/admin', adminRoutes)` |
| `index.html` | Add admin panel section (hidden by default) + admin key input |
| `css/style.css` | Agent panel styles, step cards, approve/reject buttons |
| `tests/e2e/agent.spec.js` | E2E tests for the agent flow |

---

### Step 1: Agent Tools Implementation

**File: `server/services/agentTools.js`**

```javascript
import { query } from '../config/database.js';
import { Question } from '../models/Question.js';

/**
 * Tool: list_existing_questions
 * Returns all questions with topic, difficulty, order_index
 */
async function listExistingQuestions() {
    const questions = await Question.getAll();
    return {
        count: questions.length,
        next_order_index: questions.length > 0
            ? Math.max(...questions.map(q => q.order_index)) + 1
            : 1,
        questions: questions.map(q => ({
            id: q.id,
            order_index: q.order_index,
            category: q.category,
            difficulty: q.difficulty,
            question_preview: q.sql_question.substring(0, 80)
        }))
    };
}

/**
 * Tool: execute_sql
 * Runs SQL on a temporary DuckDB instance (server-side)
 * Uses pg for validation — runs CREATE/INSERT in a transaction, rolls back
 */
async function executeSql({ sql }) {
    const client = await (await import('../config/database.js')).getClient();
    try {
        await client.query('BEGIN');
        // Use a temporary schema to avoid polluting main DB
        await client.query('CREATE SCHEMA IF NOT EXISTS agent_temp');
        await client.query('SET search_path TO agent_temp');

        const result = await client.query(sql);

        const output = {
            success: true,
            command: result.command,
            rowCount: result.rowCount,
            rows: result.rows?.slice(0, 20)  // limit preview to 20 rows
        };

        await client.query('ROLLBACK');  // always rollback — validation only
        return output;
    } catch (error) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

/**
 * Tool: validate_question
 * Runs full validation pipeline in a transaction (rolled back)
 */
async function validateQuestion({ sql_data, sql_solution }) {
    const client = await (await import('../config/database.js')).getClient();
    try {
        await client.query('BEGIN');
        await client.query('CREATE SCHEMA IF NOT EXISTS agent_validate');
        await client.query('SET search_path TO agent_validate');

        // Step 1: Run sql_data (CREATE TABLE + INSERT)
        const statements = sql_data.split(';').filter(s => s.trim());
        for (const stmt of statements) {
            await client.query(stmt);
        }

        // Step 2: Run sql_solution
        const solutionResult = await client.query(sql_solution);

        // Step 3: Run a wrong query to verify distinguishability
        // Simple wrong query: remove WHERE/HAVING/ORDER or add LIMIT 1
        const wrongQuery = sql_solution.replace(/WHERE .*/i, '').replace(/HAVING .*/i, '') + ' LIMIT 1';
        let wrongResult;
        try {
            wrongResult = await client.query(wrongQuery);
        } catch {
            wrongResult = { rows: [] };
        }

        const distinguishable = JSON.stringify(solutionResult.rows) !== JSON.stringify(wrongResult.rows);

        await client.query('ROLLBACK');

        return {
            schema_valid: true,
            solution_valid: true,
            solution_rows: solutionResult.rowCount,
            solution_preview: solutionResult.rows?.slice(0, 5),
            distinguishable,
            columns: solutionResult.fields?.map(f => f.name)
        };
    } catch (error) {
        await client.query('ROLLBACK');
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
 * Inserts validated question into database
 */
async function insertQuestion(params) {
    const result = await query(
        `INSERT INTO questions (sql_data, sql_question, sql_solution, sql_solution_explanation, difficulty, category, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
            params.sql_data,
            params.sql_question,
            params.sql_solution,
            JSON.stringify(params.sql_solution_explanation),
            params.difficulty,
            params.category,
            params.order_index
        ]
    );
    return { id: result.rows[0].id, message: `Question ${result.rows[0].id} inserted successfully` };
}

/**
 * Tool: generate_test
 * Generates Playwright test code for a question
 */
function generateTest({ question_id, sql_solution, question_text }) {
    const testCode = `import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

async function waitForAppReady(page) {
    await page.waitForFunction(() => {
        const overlay = document.getElementById('loadingOverlay');
        return !overlay || !overlay.classList.contains('visible');
    }, { timeout: 60000 });
}

test('Question ${question_id} — ${question_text.substring(0, 50)}', async ({ page }) => {
    // Start as guest
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('#guestModeBtn');

    // Wait for DuckDB
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
    const editor = page.locator('#sqlEditor');
    await editor.fill(${JSON.stringify(sql_solution)});

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

// Tool registry
export const TOOL_FUNCTIONS = {
    list_existing_questions: listExistingQuestions,
    execute_sql: executeSql,
    validate_question: validateQuestion,
    insert_question: insertQuestion,
    generate_test: generateTest
};
```

---

### Step 2: Agent Loop

**File: `server/services/agent.js`**

```javascript
import { TOOL_FUNCTIONS } from './agentTools.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY;
const MAX_STEPS = 10;  // safety limit

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
                sql_solution: { type: "string", description: "The correct SQL solution" }
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
    }
];

const SYSTEM_PROMPT = `You are a Question Authoring Agent for a SQL practice platform that uses DuckDB.

Your job is to generate new SQL practice questions based on admin requests.

WORKFLOW:
1. First, call list_existing_questions to see what exists and find the next order_index
2. Generate a complete question with: sql_data (CREATE TABLE + INSERT), sql_question, sql_solution, sql_solution_explanation, difficulty, category
3. Call validate_question to verify the SQL is correct and the solution is distinguishable
4. If validation fails, fix the issue and re-validate
5. Present the complete question as a preview for admin approval
6. Do NOT call insert_question unless the admin explicitly approves

RULES:
- sql_data must use DuckDB-compatible SQL (similar to PostgreSQL)
- Use realistic data (real-sounding names, reasonable numbers)
- sql_solution_explanation must be an array of strings, each explaining one part of the query
- Difficulty must match the SQL concepts used (beginner=SELECT/WHERE, intermediate=JOIN/GROUP BY, advanced=window functions/subqueries/CTEs)
- Category should describe the main SQL concept tested
- Create 8-15 rows of sample data (enough to make the question meaningful)
- The solution must produce results that are clearly different from naive/wrong queries`;

/**
 * Run the agent loop
 * @param {string} userPrompt - Admin's natural language request
 * @param {object[]} existingHistory - Previous conversation turns (for follow-ups)
 * @returns {{ steps: object[], messages: object[] }}
 */
export async function runAgent(userPrompt, existingHistory = []) {
    const messages = existingHistory.length > 0
        ? [...existingHistory, { role: 'user', parts: [{ text: userPrompt }] }]
        : [
            { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\nAdmin request: ' + userPrompt }] }
        ];

    const steps = [];
    let stepCount = 0;

    while (stepCount < MAX_STEPS) {
        stepCount++;

        // Call Gemini
        const startTime = Date.now();
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
                })
            }
        );

        const data = await response.json();
        const latencyMs = Date.now() - startTime;

        if (!data.candidates?.[0]?.content?.parts) {
            steps.push({ type: 'error', content: 'No response from Gemini', latencyMs });
            break;
        }

        const parts = data.candidates[0].content.parts;
        const assistantMessage = { role: 'model', parts };
        messages.push(assistantMessage);

        // Check for tool calls
        const toolCall = parts.find(p => p.functionCall);
        const textPart = parts.find(p => p.text);

        if (toolCall) {
            const { name, args } = toolCall.functionCall;

            steps.push({
                type: 'tool_call',
                tool: name,
                input: args,
                latencyMs
            });

            // Execute the tool
            let toolResult;
            try {
                const toolFn = TOOL_FUNCTIONS[name];
                if (!toolFn) throw new Error(`Unknown tool: ${name}`);
                toolResult = await toolFn(args || {});
            } catch (error) {
                toolResult = { error: error.message };
            }

            steps.push({
                type: 'tool_result',
                tool: name,
                result: toolResult
            });

            // Add tool result to conversation
            messages.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name,
                        response: toolResult
                    }
                }]
            });

            continue;  // next iteration
        }

        if (textPart) {
            steps.push({
                type: 'answer',
                content: textPart.text,
                latencyMs
            });
            break;  // done
        }
    }

    if (stepCount >= MAX_STEPS) {
        steps.push({ type: 'error', content: 'Agent reached maximum step limit' });
    }

    return { steps, messages };
}
```

---

### Step 3: Admin Routes

**File: `server/routes/admin.js`**

```javascript
import express from 'express';
import { runAgent } from '../services/agent.js';
import { TOOL_FUNCTIONS } from '../services/agentTools.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

/**
 * Admin auth middleware — checks X-Admin-Key header
 */
function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!key || key !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: 'Invalid admin key' });
    }
    next();
}

// All admin routes require admin auth
router.use(adminAuth);

/**
 * POST /api/admin/agent
 * Run the question authoring agent
 * Body: { prompt: "Add a question about...", history: [] }
 */
router.post('/agent', async (req, res) => {
    try {
        const { prompt, history } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log(`Agent request: "${prompt.substring(0, 100)}"`);

        const result = await runAgent(prompt, history || []);

        res.json({
            steps: result.steps,
            history: result.messages  // for follow-up requests
        });
    } catch (error) {
        console.error('Agent error:', error);
        res.status(500).json({ error: 'Agent failed: ' + error.message });
    }
});

/**
 * POST /api/admin/agent/approve
 * Insert a previously previewed question
 * Body: { question: { sql_data, sql_question, ... } }
 */
router.post('/agent/approve', async (req, res) => {
    try {
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({ error: 'Question data is required' });
        }

        const result = await TOOL_FUNCTIONS.insert_question(question);
        res.json(result);
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Failed to insert question: ' + error.message });
    }
});

/**
 * POST /api/admin/agent/generate-test
 * Generate and optionally save a Playwright test
 * Body: { question_id, sql_solution, question_text, save: true|false }
 */
router.post('/agent/generate-test', async (req, res) => {
    try {
        const { question_id, sql_solution, question_text, save } = req.body;

        const testResult = TOOL_FUNCTIONS.generate_test({ question_id, sql_solution, question_text });

        if (save) {
            const testPath = path.join(__dirname, '..', '..', testResult.filename);
            fs.writeFileSync(testPath, testResult.code);
            testResult.saved = true;
            testResult.path = testPath;
        }

        res.json(testResult);
    } catch (error) {
        console.error('Generate test error:', error);
        res.status(500).json({ error: 'Failed to generate test: ' + error.message });
    }
});

export default router;
```

---

### Step 4: Mount Admin Routes

**File: `server/server.js`**

Add to imports:
```javascript
import adminRoutes from './routes/admin.js';
```

Add after other route mounts:
```javascript
app.use('/api/admin', adminRoutes);
```

---

### Step 5: Frontend — Agent Panel

**File: `js/services/agent-panel.js`**

```javascript
import { apiClient } from './api-client.js';

export class AgentPanel {
    constructor() {
        this.history = [];
        this.pendingQuestion = null;
        this.createPanel();
    }

    createPanel() {
        const panelHTML = `
            <div id="agentPanel" class="agent-panel hidden">
                <div class="agent-header">
                    <h3>Question Authoring Agent</h3>
                    <button id="closeAgentPanel" class="btn-close">&times;</button>
                </div>
                <div class="agent-key-input">
                    <input type="password" id="adminKeyInput" placeholder="Admin Key" class="form-input">
                </div>
                <div id="agentSteps" class="agent-steps"></div>
                <div id="agentPreview" class="agent-preview hidden"></div>
                <div class="agent-input">
                    <input type="text" id="agentPrompt" placeholder="e.g. Add a question about RANK() window function" class="form-input">
                    <button id="agentSendBtn" class="btn btn-primary">Send</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', panelHTML);
        this.attachEvents();
    }

    attachEvents() {
        document.getElementById('closeAgentPanel').addEventListener('click', () => this.hide());
        document.getElementById('agentSendBtn').addEventListener('click', () => this.send());
        document.getElementById('agentPrompt').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.send();
        });
    }

    show() {
        document.getElementById('agentPanel').classList.remove('hidden');
    }

    hide() {
        document.getElementById('agentPanel').classList.add('hidden');
    }

    async send() {
        const prompt = document.getElementById('agentPrompt').value.trim();
        const adminKey = document.getElementById('adminKeyInput').value.trim();
        if (!prompt || !adminKey) return;

        document.getElementById('agentPrompt').value = '';
        const stepsContainer = document.getElementById('agentSteps');

        // Add user message
        stepsContainer.innerHTML += `<div class="agent-step step-user"><strong>You:</strong> ${this.escapeHtml(prompt)}</div>`;

        // Add thinking indicator
        const thinkingId = 'thinking-' + Date.now();
        stepsContainer.innerHTML += `<div id="${thinkingId}" class="agent-step step-thinking">Thinking...</div>`;
        stepsContainer.scrollTop = stepsContainer.scrollHeight;

        try {
            const response = await fetch('/api/admin/agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': adminKey
                },
                body: JSON.stringify({ prompt, history: this.history })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Agent request failed');
            }

            // Remove thinking indicator
            document.getElementById(thinkingId)?.remove();

            // Store history for follow-ups
            this.history = data.history;

            // Render steps
            this.renderSteps(data.steps, stepsContainer);

        } catch (error) {
            document.getElementById(thinkingId)?.remove();
            stepsContainer.innerHTML += `<div class="agent-step step-error">Error: ${error.message}</div>`;
        }

        stepsContainer.scrollTop = stepsContainer.scrollHeight;
    }

    renderSteps(steps, container) {
        for (const step of steps) {
            switch (step.type) {
                case 'tool_call':
                    container.innerHTML += `
                        <div class="agent-step step-tool-call">
                            <div class="step-tool-header" onclick="this.parentElement.classList.toggle('expanded')">
                                <span class="step-icon">&#9881;</span>
                                <strong>${step.tool}</strong>
                                <span class="step-latency">${step.latencyMs}ms</span>
                            </div>
                            <pre class="step-detail">${this.escapeHtml(JSON.stringify(step.input, null, 2))}</pre>
                        </div>`;
                    break;

                case 'tool_result':
                    container.innerHTML += `
                        <div class="agent-step step-tool-result">
                            <div class="step-tool-header" onclick="this.parentElement.classList.toggle('expanded')">
                                <span class="step-icon">${step.result?.error ? '&#10060;' : '&#9989;'}</span>
                                <strong>${step.tool} result</strong>
                            </div>
                            <pre class="step-detail">${this.escapeHtml(JSON.stringify(step.result, null, 2))}</pre>
                        </div>`;
                    break;

                case 'answer':
                    // Check if the answer contains a question preview
                    container.innerHTML += `
                        <div class="agent-step step-answer">
                            <div class="step-answer-content">${this.formatAnswer(step.content)}</div>
                        </div>`;
                    this.tryParsePreview(step.content);
                    break;

                case 'error':
                    container.innerHTML += `<div class="agent-step step-error">Error: ${step.content}</div>`;
                    break;
            }
        }
    }

    tryParsePreview(content) {
        // Try to extract question JSON from the answer
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try {
                const question = JSON.parse(jsonMatch[1]);
                this.pendingQuestion = question;
                this.showApprovalButtons();
            } catch { /* not valid JSON, skip */ }
        }
    }

    showApprovalButtons() {
        const previewDiv = document.getElementById('agentPreview');
        previewDiv.classList.remove('hidden');
        previewDiv.innerHTML = `
            <div class="approval-buttons">
                <button id="approveQuestionBtn" class="btn btn-primary">Approve & Insert</button>
                <button id="rejectQuestionBtn" class="btn btn-secondary">Reject</button>
            </div>
        `;

        document.getElementById('approveQuestionBtn').addEventListener('click', () => this.approveQuestion());
        document.getElementById('rejectQuestionBtn').addEventListener('click', () => {
            this.pendingQuestion = null;
            previewDiv.classList.add('hidden');
            document.getElementById('agentPrompt').value = 'Try again with a different approach';
        });
    }

    async approveQuestion() {
        if (!this.pendingQuestion) return;

        const adminKey = document.getElementById('adminKeyInput').value.trim();
        const stepsContainer = document.getElementById('agentSteps');

        try {
            const response = await fetch('/api/admin/agent/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': adminKey
                },
                body: JSON.stringify({ question: this.pendingQuestion })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            stepsContainer.innerHTML += `
                <div class="agent-step step-answer">
                    Question ${data.id} inserted successfully!
                </div>`;

            document.getElementById('agentPreview').classList.add('hidden');
            this.pendingQuestion = null;

        } catch (error) {
            stepsContainer.innerHTML += `<div class="agent-step step-error">Insert failed: ${error.message}</div>`;
        }

        stepsContainer.scrollTop = stepsContainer.scrollHeight;
    }

    formatAnswer(text) {
        // Basic markdown-ish formatting
        return text
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

---

### Step 6: HTML Changes

**File: `index.html`**

Add admin button to header (only visible when admin key is set):
```html
<button id="adminAgentBtn" class="btn btn-secondary hidden">Agent</button>
```

Add script import:
```html
<script type="module">
    import { AgentPanel } from './js/services/agent-panel.js';
    window.agentPanel = new AgentPanel();
    document.getElementById('adminAgentBtn')?.addEventListener('click', () => {
        window.agentPanel.show();
    });
</script>
```

---

### Step 7: CSS Styles

**File: `css/style.css`**

```css
/* ==================== Agent Panel ==================== */
.agent-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 480px;
    height: 100vh;
    background: var(--bg-primary, #fff);
    border-left: 1px solid var(--border-color, #ddd);
    display: flex;
    flex-direction: column;
    z-index: 1000;
    box-shadow: -4px 0 20px rgba(0,0,0,0.1);
}

.agent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border-color, #ddd);
}

.agent-key-input {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border-color, #ddd);
}

.agent-steps {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
}

.agent-step {
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.9rem;
}

.step-user {
    background: #e3f2fd;
}

.step-thinking {
    color: #888;
    font-style: italic;
}

.step-tool-call {
    background: #fff3e0;
    border-left: 3px solid #ff9800;
}

.step-tool-result {
    background: #f1f8e9;
    border-left: 3px solid #4caf50;
}

.step-tool-result .step-detail,
.step-tool-call .step-detail {
    display: none;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    max-height: 200px;
    overflow-y: auto;
}

.step-tool-call.expanded .step-detail,
.step-tool-result.expanded .step-detail {
    display: block;
}

.step-tool-header {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.step-latency {
    margin-left: auto;
    font-size: 0.75rem;
    color: #888;
}

.step-answer {
    background: #f5f5f5;
    border-left: 3px solid #2196f3;
}

.step-error {
    background: #ffebee;
    border-left: 3px solid #f44336;
    color: #c62828;
}

.agent-input {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid var(--border-color, #ddd);
}

.agent-input input {
    flex: 1;
}

.agent-preview {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border-color, #ddd);
}

.approval-buttons {
    display: flex;
    gap: 0.5rem;
}
```

---

## Part 4: Operations

### Environment Variables

Add to `.env`:
```
ADMIN_SECRET=your-admin-secret-key-here
```

Add to Cloud Run via Secret Manager or env config.

### Database Changes
None. Uses existing `questions` table. Agent validates using temporary schemas that are always rolled back.

### Deployment
Same Cloud Run pipeline. New route (`/api/admin/agent`) is protected by `X-Admin-Key` header, not exposed to regular users.

### Monitoring
- Agent tool calls are logged to console: `Agent request: "..."`
- Each Gemini call latency tracked in step results
- Errors logged: `Agent error: ...`, `Approve error: ...`

### Security Considerations
| Risk | Mitigation |
|---|---|
| Admin key brute force | Rate limiting already applied to `/api/` routes (100/15min) |
| SQL injection via execute_sql | All SQL runs in ROLLBACK transaction — nothing persists |
| Agent inserts bad question | Human approval gate — insert_question only called via /approve |
| Excessive Gemini calls | MAX_STEPS=10 limits agent loop |
| Large responses | maxOutputTokens=4096, response preview limited to 20 rows |

### Testing Plan

**E2E Test: `tests/e2e/agent.spec.js`**

```
1. Agent endpoint rejects without admin key (403)
2. Agent endpoint accepts with valid admin key
3. Agent lists existing questions (tool call visible in response)
4. Agent generates and validates a question (multiple steps in response)
5. Approve endpoint inserts question into database
6. New question appears in question dropdown
```

### Sequence Diagram: Question Generation + Approval

```
Admin (Browser)          Express Server           Gemini API            PostgreSQL
  │                           │                       │                     │
  │  "Add HAVING question"    │                       │                     │
  │──POST /api/admin/agent───>│                       │                     │
  │  X-Admin-Key: secret      │                       │                     │
  │                           │                       │                     │
  │                           │  ── Step 1 ──         │                     │
  │                           │  generateContent      │                     │
  │                           │  (with tool decls)    │                     │
  │                           │──────────────────────>│                     │
  │                           │  <── functionCall:    │                     │
  │                           │  get_coverage_gaps()  │                     │
  │                           │                       │                     │
  │                           │  SELECT gaps          │                     │
  │                           │──────────────────────────────────────────->│
  │                           │  <── 29 gaps ─────────────────────────────│
  │                           │                       │                     │
  │                           │  ── wait 7s ──        │                     │
  │                           │                       │                     │
  │                           │  ── Step 2 ──         │                     │
  │                           │  generateContent      │                     │
  │                           │  (gaps + history)     │                     │
  │                           │──────────────────────>│                     │
  │                           │  <── functionCall:    │                     │
  │                           │  list_existing_       │                     │
  │                           │  questions()          │                     │
  │                           │                       │                     │
  │                           │  SELECT questions     │                     │
  │                           │──────────────────────────────────────────->│
  │                           │  <── 7 questions ─────────────────────────│
  │                           │                       │                     │
  │                           │  ── wait 7s ──        │                     │
  │                           │                       │                     │
  │                           │  ── Step 3 ──         │                     │
  │                           │  generateContent      │                     │
  │                           │  (gaps + questions    │                     │
  │                           │   + history)          │                     │
  │                           │──────────────────────>│                     │
  │                           │  <── functionCall:    │                     │
  │                           │  validate_question    │                     │
  │                           │  (sql_data,solution)  │                     │
  │                           │                       │                     │
  │                           │  BEGIN; CREATE TABLE;  │                     │
  │                           │  INSERT; SELECT;       │                     │
  │                           │  ROLLBACK;             │                     │
  │                           │──────────────────────────────────────────->│
  │                           │  <── valid, 12 rows ──────────────────────│
  │                           │                       │                     │
  │                           │  ── wait 7s ──        │                     │
  │                           │                       │                     │
  │                           │  ── Step 4 ──         │                     │
  │                           │  generateContent      │                     │
  │                           │  (validation result   │                     │
  │                           │   + full history)     │                     │
  │                           │──────────────────────>│                     │
  │                           │  <── text: JSON       │                     │
  │                           │  preview with         │                     │
  │                           │  concepts             │                     │
  │                           │                       │                     │
  │  <── { steps[], history } │                       │                     │
  │                           │                       │                     │
  │  Render reasoning chain   │                       │                     │
  │  Show Approve/Reject      │                       │                     │
  │                           │                       │                     │
  │  ── Admin clicks Approve ─│                       │                     │
  │                           │                       │                     │
  │──POST /agent/approve─────>│                       │                     │
  │  { question + concepts }  │                       │                     │
  │                           │  INSERT INTO questions │                     │
  │                           │──────────────────────────────────────────->│
  │                           │  <── id=8 ────────────────────────────────│
  │                           │                       │                     │
  │                           │  INSERT INTO           │                     │
  │                           │  question_concepts     │                     │
  │                           │──────────────────────────────────────────->│
  │                           │  <── tagged ──────────────────────────────│
  │                           │                       │                     │
  │  <── { id: 8, concepts_  │                       │                     │
  │       tagged: ["HAVING"] }│                       │                     │
  │                           │                       │                     │
  │  "Question 8 inserted!"   │                       │                     │
```

### Sequence Diagram: Coverage Gap Query

```
Admin (Browser)          Express Server           Gemini API            PostgreSQL
  │                           │                       │                     │
  │  "Show coverage gaps"     │                       │                     │
  │──POST /api/admin/agent───>│                       │                     │
  │                           │  generateContent      │                     │
  │                           │──────────────────────>│                     │
  │                           │  <── functionCall:    │                     │
  │                           │  get_coverage_gaps()  │                     │
  │                           │                       │                     │
  │                           │  SELECT concepts      │                     │
  │                           │  LEFT JOIN questions  │                     │
  │                           │  WHERE null           │                     │
  │                           │──────────────────────────────────────────->│
  │                           │  <── 29 gaps ─────────────────────────────│
  │                           │                       │                     │
  │                           │  ── wait 7s ──        │                     │
  │                           │                       │                     │
  │                           │  generateContent      │                     │
  │                           │  (gaps + history)     │                     │
  │                           │──────────────────────>│                     │
  │                           │  <── text: summary    │                     │
  │                           │                       │                     │
  │  <── { steps[], history } │                       │                     │
  │  Render gaps by category  │                       │                     │
```

---

## Part 5: Implementation Checklist

### Phase 1: Backend (3-4 hours)
- [ ] Create `server/services/agentTools.js` — 5 tool functions
- [ ] Create `server/services/agent.js` — agent loop with Gemini function calling
- [ ] Create `server/routes/admin.js` — admin auth + 3 endpoints
- [ ] Mount admin routes in `server/server.js`
- [ ] Add `ADMIN_SECRET` to `.env`
- [ ] Test agent endpoint with curl

### Phase 2: Frontend (2-3 hours)
- [ ] Create `js/services/agent-panel.js` — chat UI, step rendering, approval buttons
- [ ] Add admin button + agent panel to `index.html`
- [ ] Add agent panel CSS styles
- [ ] Test end-to-end in browser

### Phase 3: Testing & Deploy (1-2 hours)
- [ ] Write E2E tests for agent flow
- [ ] Test on VM
- [ ] Add `ADMIN_SECRET` to Cloud Run environment
- [ ] Deploy and verify on production

**Total estimated time: 6-9 hours**

---

## Part 6: Demo Script (for assignment submission)

```
1. Open the app, show "Agent" button in header
2. Enter admin key, type "Add a medium question about RANK() window functions"
3. Watch the reasoning chain:
   ⚙️ list_existing_questions → shows 20 existing, no RANK
   ⚙️ validate_question → schema valid, solution returns 12 rows
   💡 Preview: complete question with schema, solution, explanation
4. Click "Approve & Insert"
   ✅ Question 21 inserted
5. Refresh the app, select Question 21 from dropdown
6. Run the generated solution — correct!
7. Show the agent handled: analysis → generation → validation → insertion
   across 3+ Gemini calls with full conversation history
```
