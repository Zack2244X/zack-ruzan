/**
 * @file Quiz model definition
 * @description Defines the Sequelize Quiz model. Questions are stored as a JSON column
 *   in TiDB, each containing answer options with correctness flags and rationale.
 * @module models/Quiz
 */

// ============================================
//   موديل الامتحان (Quiz) — Sequelize + TiDB
//   الأسئلة تُخزّن كـ JSON (TiDB يدعم JSON)
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

/**
 * @typedef {Object} AnswerOption
 * @property {string} text - The answer option text.
 * @property {boolean} isCorrect - Whether this option is the correct answer.
 * @property {string} rationale - Explanation shown after answering.
 */

/**
 * @typedef {Object} Question
 * @property {string} id - Unique identifier (UUID) for the question.
 * @property {string} question - The question text.
 * @property {string} hint - Optional hint for the question.
 * @property {AnswerOption[]} answerOptions - Array of answer options.
 */

/**
 * @typedef {Object} QuizFeedback
 * @property {{ message: string, onStreak: string }} correct - Feedback for correct answers.
 * @property {{ message: string }} incorrect - Feedback for incorrect answers.
 */

/**
 * @typedef {Object} QuizAttributes
 * @property {number} id - Auto-incremented primary key.
 * @property {string} title - Quiz title (max 255 chars).
 * @property {string} subject - Subject/category name (max 100 chars).
 * @property {string} description - Optional quiz description.
 * @property {number} timeLimit - Time limit in seconds (default: 1800 = 30 min).
 * @property {string} closingMessage - Message shown after quiz completion.
 * @property {number} streakGoal - Number of consecutive correct answers for streak feedback.
 * @property {QuizFeedback} feedback - Feedback messages configuration.
 * @property {Question[]} questions - Array of quiz questions stored as JSON.
 * @property {boolean} isActive - Whether the quiz is visible to students.
 * @property {number|null} createdBy - Foreign key to the creator (User.id).
 * @property {Date} createdAt - Record creation timestamp.
 * @property {Date} updatedAt - Record last-update timestamp.
 * @property {Date|null} deletedAt - Soft-delete timestamp (paranoid mode).
 */

/**
 * Sequelize model representing a quiz/exam.
 * @type {import('sequelize').ModelStatic<import('sequelize').Model<QuizAttributes>>}
 */
const Quiz = sequelize.define('Quiz', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    subject: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    timeLimit: {
        type: DataTypes.INTEGER,     // بالثواني
        defaultValue: 1800           // 30 دقيقة
    },
    closingMessage: {
        type: DataTypes.TEXT,
        defaultValue: 'شكراً لمشاركتك في الاختبار!'
    },
    streakGoal: {
        type: DataTypes.INTEGER,
        defaultValue: 3
    },
    feedback: {
        type: DataTypes.JSON,
        defaultValue: {
            correct: {
                message: 'ماشاء الله! إجابة صحيحة.',
                onStreak: 'أحسنت! سلسلة متتالية من الإجابات الصحيحة!'
            },
            incorrect: {
                message: 'للأسف، الإجابة غير صحيحة.'
            }
        }
    },
    // الأسئلة: مصفوفة JSON
    // كل سؤال: { id, question, hint, answerOptions: [{ text, isCorrect, rationale }] }
    questions: {
        type: DataTypes.JSON,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'quizzes',
    timestamps: true,
    paranoid: true
});

module.exports = Quiz;
