/**
 * @file Unit tests for Sequelize models — field definitions and associations
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';

const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Note = require('../models/Note');
const Score = require('../models/Score');

describe('User model', () => {
    test('should have required fields defined', () => {
        const attrs = User.rawAttributes;
        expect(attrs.email).toBeDefined();
        expect(attrs.googleId).toBeDefined();
        expect(attrs.role).toBeDefined();
        expect(attrs.fname).toBeDefined();
        expect(attrs.lname).toBeDefined();
        expect(attrs.tokenVersion).toBeDefined();
    });

    test('tokenVersion should default to 0', () => {
        expect(User.rawAttributes.tokenVersion.defaultValue).toBe(0);
    });

    test('role should default to student', () => {
        expect(User.rawAttributes.role.defaultValue).toBe('student');
    });

    test('should have paranoid enabled (soft delete)', () => {
        expect(User.options.paranoid).toBe(true);
    });

    test('should have getFullName instance method', () => {
        // Build (doesn't save to DB) a user
        const user = User.build({ fname: 'أحمد', lname: 'محمد', email: 'a@b.com', googleId: '123' });
        expect(typeof user.getFullName).toBe('function');
        expect(user.getFullName()).toBe('أحمد محمد');
    });
});

describe('Quiz model', () => {
    test('should have required fields', () => {
        const attrs = Quiz.rawAttributes;
        expect(attrs.title).toBeDefined();
        expect(attrs.subject).toBeDefined();
        expect(attrs.questions).toBeDefined();
        expect(attrs.createdBy).toBeDefined();
    });

    test('should have paranoid enabled', () => {
        expect(Quiz.options.paranoid).toBe(true);
    });
});

describe('Note model', () => {
    test('should have required fields', () => {
        const attrs = Note.rawAttributes;
        expect(attrs.title).toBeDefined();
        expect(attrs.link).toBeDefined();
    });

    test('should have paranoid enabled', () => {
        expect(Note.options.paranoid).toBe(true);
    });
});

describe('Score model', () => {
    test('should have required fields', () => {
        const attrs = Score.rawAttributes;
        expect(attrs.quizId).toBeDefined();
        expect(attrs.score).toBeDefined();
        expect(attrs.total).toBeDefined();
        expect(attrs.userId).toBeDefined();
    });

    test('should NOT have paranoid (hard delete)', () => {
        expect(Score.options.paranoid).toBeFalsy();
    });
});
