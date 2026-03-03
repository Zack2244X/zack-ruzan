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
