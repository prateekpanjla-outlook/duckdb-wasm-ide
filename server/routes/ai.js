import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { Question } from '../models/Question.js';
import { query } from '../config/database.js';
import { buildPrompt } from '../services/promptBuilder.js';
import { generateHint } from '../services/gemini.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limit: AI_RATE_LIMIT requests per AI_RATE_WINDOW_MINUTES per user
const AI_RATE_LIMIT = parseInt(process.env.AI_RATE_LIMIT || '10', 10);
const AI_RATE_WINDOW = parseInt(process.env.AI_RATE_WINDOW_MINUTES || '60', 10);

const aiRateLimit = rateLimit({
    windowMs: AI_RATE_WINDOW * 60 * 1000,
    max: AI_RATE_LIMIT,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { error: `Rate limit exceeded. You can request up to ${AI_RATE_LIMIT} AI hints per ${AI_RATE_WINDOW} minutes.` },
    standardHeaders: true,
    legacyHeaders: false
});

// In-memory cache: Map<cacheKey, { response, timestamp }>
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(questionId, type, userQuery, errorMessage) {
    const input = `${questionId}:${type}:${userQuery || ''}:${errorMessage || ''}`;
    // Simple hash — good enough for in-memory cache
    let hash = 0;
    for (const ch of input) {
        hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
    }
    return `ai:${hash}`;
}

// Mock response for when GEMINI_API_KEY is not set (test/dev mode)
const MOCK_RESPONSES = {
    hint: {
        hint: 'Think about which column to filter on. What SQL clause filters rows based on a condition?',
        cached: false,
        tokens: { input: 0, output: 0 }
    },
    explain_error: {
        hint: 'This error means the database cannot find what you referenced. Check your table and column names for typos.',
        cached: false,
        tokens: { input: 0, output: 0 }
    },
    explain_solution: {
        hint: 'The solution uses a SELECT statement with a WHERE clause to filter rows. The WHERE clause checks a specific column value to return only matching rows.',
        cached: false,
        tokens: { input: 0, output: 0 }
    }
};

/**
 * POST /api/ai/hint
 * Get an AI-generated hint, error explanation, or solution explanation.
 */
router.post('/hint', authenticate, aiRateLimit, async (req, res) => {
    try {
        const { questionId, userQuery, errorMessage, type = 'hint' } = req.body;

        if (!questionId) {
            return res.status(400).json({ error: 'questionId is required' });
        }

        if (!['hint', 'explain_error', 'explain_solution'].includes(type)) {
            return res.status(400).json({ error: 'type must be hint, explain_error, or explain_solution' });
        }

        // Check cache
        const cacheKey = getCacheKey(questionId, type, userQuery, errorMessage);
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return res.json({ ...cached.response, cached: true });
        }

        // Fetch question context from DB (don't trust client-sent data)
        const question = await Question.getById(questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Build prompt
        const { systemPrompt, userPrompt } = buildPrompt({
            type,
            sqlData: question.sql_data,
            sqlQuestion: question.sql_question,
            difficulty: question.difficulty,
            userQuery: userQuery || '',
            errorMessage: errorMessage || null,
            sqlSolution: type === 'explain_solution' ? question.sql_solution : null
        });

        // Call Gemini (returns null if no API key → use mock)
        const result = await generateHint(systemPrompt, userPrompt);

        if (!result) {
            // No API key — return mock response
            return res.json(MOCK_RESPONSES[type] || MOCK_RESPONSES.hint);
        }

        const response = {
            hint: result.text,
            cached: false,
            tokens: { input: result.inputTokens, output: result.outputTokens }
        };

        // Cache the response
        cache.set(cacheKey, { response, timestamp: Date.now() });

        // Record usage (fire and forget — don't slow down the response)
        recordUsage(req.user.id, questionId, type, result.inputTokens, result.outputTokens, false)
            .catch(err => console.error('Failed to record AI usage:', err.message));

        res.json(response);

    } catch (error) {
        console.error('AI hint error:', error.message);

        if (error.message.includes('Gemini API error')) {
            return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again.' });
        }

        res.status(500).json({ error: 'Failed to generate hint' });
    }
});

/**
 * Record AI usage to the database for cost tracking.
 */
async function recordUsage(userId, questionId, type, inputTokens, outputTokens, cached) {
    await query(
        `INSERT INTO ai_usage (user_id, question_id, type, input_tokens, output_tokens, cached)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, questionId, type, inputTokens, outputTokens, cached]
    );
}

export default router;
