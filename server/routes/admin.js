/**
 * Admin Routes
 * Protected by X-Admin-Key header matching ADMIN_SECRET env var.
 * Provides agent endpoint for question authoring.
 */

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
    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
        return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    }

    const key = req.headers['x-admin-key'];
    if (!key || key !== secret) {
        return res.status(403).json({ error: 'Invalid admin key' });
    }
    next();
}

router.use(adminAuth);

/**
 * POST /api/admin/agent
 * Run the question authoring agent.
 * Body: { prompt: "Add a question about...", history: [] }
 * Returns: { steps: [...], history: [...] }
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
            history: result.messages
        });
    } catch (error) {
        console.error('Agent error:', error);
        res.status(500).json({ error: 'Agent failed: ' + error.message });
    }
});

/**
 * POST /api/admin/agent/stream
 * Same as /agent but streams steps via SSE as they happen.
 */
router.post('/agent/stream', async (req, res) => {
    try {
        const { prompt, history } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        console.log(`Agent stream request: "${prompt.substring(0, 100)}"`);

        const onStep = (step) => {
            res.write(`data: ${JSON.stringify(step)}\n\n`);
        };

        const result = await runAgent(prompt, history || [], onStep);

        // Send final event with history for follow-up requests
        res.write(`data: ${JSON.stringify({ type: 'done', history: result.messages })}\n\n`);
        res.end();
    } catch (error) {
        console.error('Agent stream error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
        res.end();
    }
});

/**
 * POST /api/admin/agent/approve
 * Insert a previously previewed question.
 * Body: { question: { sql_data, sql_question, ... } }
 */
router.post('/agent/approve', async (req, res) => {
    try {
        const { question } = req.body;

        if (!question || !question.sql_data || !question.sql_question || !question.sql_solution) {
            return res.status(400).json({ error: 'Complete question data is required' });
        }

        const result = await TOOL_FUNCTIONS.insert_question(question);

        console.log(`Agent: question approved and inserted, id=${result.id}`);
        res.json(result);
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Failed to insert question: ' + error.message });
    }
});

/**
 * POST /api/admin/agent/generate-test
 * Generate and optionally save a Playwright test for a question.
 * Body: { question_id, sql_solution, question_text, save: true|false }
 */
router.post('/agent/generate-test', async (req, res) => {
    try {
        const { question_id, sql_solution, question_text, save } = req.body;

        if (!question_id || !sql_solution || !question_text) {
            return res.status(400).json({ error: 'question_id, sql_solution, and question_text are required' });
        }

        const testResult = TOOL_FUNCTIONS.generate_test({ question_id, sql_solution, question_text });

        if (save) {
            const testPath = path.join(__dirname, '..', '..', testResult.filename);
            fs.writeFileSync(testPath, testResult.code);
            testResult.saved = true;
            testResult.path = testPath;
            console.log(`Agent: test saved to ${testResult.filename}`);
        }

        res.json(testResult);
    } catch (error) {
        console.error('Generate test error:', error);
        res.status(500).json({ error: 'Failed to generate test: ' + error.message });
    }
});

export default router;
