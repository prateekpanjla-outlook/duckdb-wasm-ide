import express from 'express';
import { Question } from '../models/Question.js';
import { UserAttempt } from '../models/UserAttempt.js';
import { UserSession } from '../models/UserSession.js';
import { authenticate } from '../middleware/auth.js';
import { validateAttempt } from '../middleware/validate.js';

const router = express.Router();

/**
 * GET /api/practice/start
 * Get first question for practice mode
 */
router.get('/start', authenticate, async (req, res) => {
    try {
        const question = await Question.getFirstQuestion();

        if (!question) {
            return res.status(404).json({ error: 'No questions available' });
        }

        // Update user session
        await UserSession.upsert({
            userId: req.user.id,
            currentQuestionId: question.id,
            practiceModeActive: true
        });

        res.json({
            question: {
                id: question.id,
                sql_data: question.sql_data,
                sql_question: question.sql_question,
                sql_solution: question.sql_solution,
                sql_solution_explanation: question.sql_solution_explanation,
                difficulty: question.difficulty,
                category: question.category
            }
        });
    } catch (error) {
        console.error('Start practice error:', error);
        res.status(500).json({ error: 'Failed to start practice' });
    }
});

/**
 * GET /api/practice/next
 * Get next question
 */
router.get('/next', authenticate, async (req, res) => {
    try {
        // Get current question from user session
        const session = await UserSession.get(req.user.id);

        if (!session || !session.current_question_id) {
            // No active session, start from beginning
            return res.redirect('/api/practice/start');
        }

        // Get next question
        const nextQuestion = await Question.getNextQuestion(session.current_question_id);

        if (!nextQuestion) {
            return res.status(404).json({
                error: 'No more questions',
                message: 'You have completed all available questions!'
            });
        }

        // Update user session
        await UserSession.updateCurrentQuestion(req.user.id, nextQuestion.id);

        res.json({
            question: {
                id: nextQuestion.id,
                sql_data: nextQuestion.sql_data,
                sql_question: nextQuestion.sql_question,
                sql_solution: nextQuestion.sql_solution,
                sql_solution_explanation: nextQuestion.sql_solution_explanation,
                difficulty: nextQuestion.difficulty,
                category: nextQuestion.category
            }
        });
    } catch (error) {
        console.error('Get next question error:', error);
        res.status(500).json({ error: 'Failed to get next question' });
    }
});

/**
 * GET /api/practice/questions
 * Get all available questions
 */
router.get('/questions', authenticate, async (req, res) => {
    try {
        const questions = await Question.getAll();

        // Get user progress for each question
        const progress = {};
        for (const question of questions) {
            const attempts = await UserAttempt.getUserQuestionAttempts(req.user.id, question.id);
            const completed = attempts.some(a => a.is_correct);

            progress[question.id] = {
                attempts: attempts.length,
                completed: completed,
                lastAttempt: attempts.length > 0 ? attempts[0].created_at : null
            };
        }

        res.json({
            questions: questions.map(q => ({
                id: q.id,
                order_index: q.order_index,
                category: q.category,
                difficulty: q.difficulty,
                sql_question: q.sql_question,
                sql_data: q.sql_data
            })),
            progress: progress
        });
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({ error: 'Failed to get questions' });
    }
});

/**
 * GET /api/practice/question/:id
 * Get specific question by ID
 */
router.get('/question/:id', authenticate, async (req, res) => {
    try {
        const questionId = parseInt(req.params.id);

        if (isNaN(questionId)) {
            return res.status(400).json({ error: 'Invalid question ID' });
        }

        const question = await Question.getById(questionId);

        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        res.json({
            question: {
                id: question.id,
                sql_data: question.sql_data,
                sql_question: question.sql_question,
                sql_solution: question.sql_solution,
                sql_solution_explanation: question.sql_solution_explanation,
                difficulty: question.difficulty,
                category: question.category
            }
        });
    } catch (error) {
        console.error('Get question error:', error);
        res.status(500).json({ error: 'Failed to get question' });
    }
});

/**
 * POST /api/practice/attempt
 * Submit an attempt at a question
 */
router.post('/attempt', authenticate, validateAttempt, async (req, res) => {
    try {
        const { questionId, userQuery, userResults, timeTakenSeconds } = req.body;

        // Get question to verify
        const question = await Question.getById(questionId);

        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // For now, we'll do basic comparison on the frontend
        // The frontend will send us whether it matched or not
        // In a more advanced version, we could run SQL comparison here

        // The frontend should determine isCorrect by comparing results
        // For this version, we'll expect the frontend to tell us
        let isCorrect = false;

        // If userResults were provided, we could do additional validation here
        // For now, we'll trust the frontend's comparison

        // Record attempt
        const attempt = await UserAttempt.create({
            userId: req.user.id,
            questionId,
            userQuery,
            isCorrect,
            timeTakenSeconds
        });

        // Get user's attempts for this question
        const attempts = await UserAttempt.getQuestionAttempts(req.user.id, questionId);

        res.json({
            attempt: {
                id: attempt.id,
                isCorrect: attempt.is_correct,
                attemptsCount: attempt.attempts_count,
                completedAt: attempt.completed_at
            },
            totalAttempts: attempts.length
        });
    } catch (error) {
        console.error('Submit attempt error:', error);
        res.status(500).json({ error: 'Failed to submit attempt' });
    }
});

/**
 * POST /api/practice/verify
 * Verify user's solution against correct solution
 * This endpoint compares results server-side
 */
router.post('/verify', authenticate, async (req, res) => {
    try {
        const { questionId, userQuery, userResults, isCorrect, timeTakenSeconds } = req.body;

        // Get question to get the correct solution
        const question = await Question.getById(questionId);

        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Record the attempt
        const attempt = await UserAttempt.create({
            userId: req.user.id,
            questionId,
            userQuery,
            isCorrect,
            timeTakenSeconds
        });

        // Check if this is the first correct answer
        const wasPreviouslyCompleted = await UserAttempt.isQuestionCompleted(req.user.id, questionId);
        const isFirstSuccess = isCorrect && !wasPreviouslyCompleted;

        // Get user's attempts for this question
        const attempts = await UserAttempt.getQuestionAttempts(req.user.id, questionId);

        res.json({
            attempt: {
                id: attempt.id,
                isCorrect: attempt.is_correct,
                attemptsCount: attempt.attempts_count,
                completedAt: attempt.completed_at
            },
            isFirstSuccess,
            totalAttempts: attempts.length,
            solution: {
                query: question.sql_solution,
                explanation: question.sql_solution_explanation
            }
        });
    } catch (error) {
        console.error('Verify attempt error:', error);
        res.status(500).json({ error: 'Failed to verify attempt' });
    }
});

/**
 * GET /api/practice/progress
 * Get user's practice progress
 */
router.get('/progress', authenticate, async (req, res) => {
    try {
        const progress = await UserAttempt.getUserProgress(req.user.id);
        const recentAttempts = await UserAttempt.getRecentAttempts(req.user.id, 10);
        const completedQuestions = await UserAttempt.getCompletedQuestions(req.user.id);

        const totalQuestions = await Question.getCount();

        res.json({
            progress: {
                totalAttempts: parseInt(progress.total_attempts) || 0,
                uniqueQuestionsAttempted: parseInt(progress.unique_questions_attempted) || 0,
                correctAttempts: parseInt(progress.correct_attempts) || 0,
                successRate: progress.success_rate || 0,
                avgTimeSeconds: progress.avg_time_seconds || 0,
                lastAttemptAt: progress.last_attempt_at
            },
            recentAttempts,
            completedQuestions,
            totalQuestions
        });
    } catch (error) {
        console.error('Get progress error:', error);
        res.status(500).json({ error: 'Failed to get progress' });
    }
});

/**
 * GET /api/practice/session
 * Get user's practice session state
 */
router.get('/session', authenticate, async (req, res) => {
    try {
        const session = await UserSession.get(req.user.id);

        if (!session) {
            return res.json({
                practiceModeActive: false,
                currentQuestionId: null
            });
        }

        res.json({
            practiceModeActive: session.practice_mode_active,
            currentQuestionId: session.current_question_id
        });
    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

/**
 * POST /api/practice/session/activate
 * Activate practice mode
 */
router.post('/session/activate', authenticate, async (req, res) => {
    try {
        await UserSession.setPracticeMode(req.user.id, true);

        res.json({
            message: 'Practice mode activated',
            practiceModeActive: true
        });
    } catch (error) {
        console.error('Activate session error:', error);
        res.status(500).json({ error: 'Failed to activate practice mode' });
    }
});

/**
 * POST /api/practice/session/deactivate
 * Deactivate practice mode
 */
router.post('/session/deactivate', authenticate, async (req, res) => {
    try {
        await UserSession.setPracticeMode(req.user.id, false);

        res.json({
            message: 'Practice mode deactivated',
            practiceModeActive: false
        });
    } catch (error) {
        console.error('Deactivate session error:', error);
        res.status(500).json({ error: 'Failed to deactivate practice mode' });
    }
});

export default router;
