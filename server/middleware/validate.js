import { body, validationResult } from 'express-validator';

/**
 * Handle validation errors
 */
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
        });
    }

    next();
};

/**
 * Validation rules for user registration
 */
export const validateRegister = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    handleValidationErrors
];

/**
 * Validation rules for user login
 */
export const validateLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    handleValidationErrors
];

/**
 * Validation rules for submitting an attempt
 */
export const validateAttempt = [
    body('questionId')
        .isInt({ min: 1 })
        .withMessage('Question ID must be a positive integer'),
    body('userQuery')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('User query is required'),
    body('userResults')
        .isObject()
        .withMessage('User results must be an object'),
    body('timeTakenSeconds')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Time taken must be a positive number'),
    handleValidationErrors
];
