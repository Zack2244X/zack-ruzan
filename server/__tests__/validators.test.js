/**
 * @file Unit tests for express-validator chains
 */
process.env.NODE_ENV = 'test';

const {
    validate,
    validateGoogleLogin,
    validateCompleteProfile,
    validateCreateAdmin,
    validateCreateQuiz,
    validateUpdateQuiz,
    validateRenameSubject,
    validateSubmitScore,
    validateCreateNote,
    validateUpdateNote,
    validatePagination
} = require('../middleware/validators');

describe('Validator chains exist and are arrays', () => {
    test('validateGoogleLogin should be an array of validation chains', () => {
        expect(Array.isArray(validateGoogleLogin)).toBe(true);
        expect(validateGoogleLogin.length).toBeGreaterThan(0);
    });

    test('validateCreateQuiz should be an array', () => {
        expect(Array.isArray(validateCreateQuiz)).toBe(true);
        expect(validateCreateQuiz.length).toBeGreaterThan(0);
    });

    test('validateSubmitScore should be an array', () => {
        expect(Array.isArray(validateSubmitScore)).toBe(true);
        expect(validateSubmitScore.length).toBeGreaterThan(0);
    });

    test('validateCreateNote should be an array', () => {
        expect(Array.isArray(validateCreateNote)).toBe(true);
        expect(validateCreateNote.length).toBeGreaterThan(0);
    });

    test('validateCompleteProfile should be an array', () => {
        expect(Array.isArray(validateCompleteProfile)).toBe(true);
        expect(validateCompleteProfile.length).toBeGreaterThan(0);
    });

    test('validatePagination should be an array', () => {
        expect(Array.isArray(validatePagination)).toBe(true);
    });

    test('validate should be a function (middleware)', () => {
        expect(typeof validate).toBe('function');
    });
});

// Helper: run a validator chain against a mock request body
const { validationResult } = require('express-validator');

async function runValidators(validators, body) {
    const req = { body, query: {}, params: {}, headers: {}, cookies: {} };
    // Filter to only proper express-validator chains (they have a .run() method)
    const chains = validators.filter(v => typeof v.run === 'function');
    await Promise.all(chains.map(v => v.run(req)));
    return validationResult(req);
}

describe('validateCreateQuiz deep questions validation', () => {
    const validQuestion = {
        question: 'What is 2 + 2?',
        answerOptions: [
            { text: 'One' },
            { text: 'Two' },
            { text: 'Three' },
            { text: 'Four', isCorrect: true }
        ]
    };

    test('valid quiz should pass validation', async () => {
        const result = await runValidators(validateCreateQuiz, {
            title: 'Math Quiz',
            subject: 'Math',
            questions: [validQuestion]
        });
        expect(result.isEmpty()).toBe(true);
    });

    test('should reject empty questions array', async () => {
        const result = await runValidators(validateCreateQuiz, {
            title: 'Math Quiz',
            subject: 'Math',
            questions: []
        });
        expect(result.isEmpty()).toBe(false);
    });

    test('should reject question with empty text', async () => {
        const result = await runValidators(validateCreateQuiz, {
            title: 'Math Quiz',
            subject: 'Math',
            questions: [{ ...validQuestion, question: '' }]
        });
        expect(result.isEmpty()).toBe(false);
    });

    test('should reject question with only 1 answer option (< 2)', async () => {
        const result = await runValidators(validateCreateQuiz, {
            title: 'Math Quiz',
            subject: 'Math',
            questions: [{ ...validQuestion, answerOptions: [{ text: 'Only one' }] }]
        });
        expect(result.isEmpty()).toBe(false);
    });

    test('should reject question with 7 answer options (> 6)', async () => {
        const result = await runValidators(validateCreateQuiz, {
            title: 'Math Quiz',
            subject: 'Math',
            questions: [{
                ...validQuestion,
                answerOptions: Array(7).fill({ text: 'Option' })
            }]
        });
        expect(result.isEmpty()).toBe(false);
    });

    test('should reject missing title', async () => {
        const result = await runValidators(validateCreateQuiz, {
            subject: 'Math',
            questions: [validQuestion]
        });
        expect(result.isEmpty()).toBe(false);
    });

    test('should reject answer option with empty text', async () => {
        const result = await runValidators(validateCreateQuiz, {
            title: 'Math Quiz',
            subject: 'Math',
            questions: [{
                ...validQuestion,
                answerOptions: [{ text: 'A' }, { text: '' }, { text: 'C' }, { text: 'D' }]
            }]
        });
        expect(result.isEmpty()).toBe(false);
    });
});
