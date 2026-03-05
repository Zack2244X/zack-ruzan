/**
 * @file Score model definition
 * @description Defines the Sequelize Score model for storing quiz results.
 *   Includes server-side percentage calculation via Sequelize hooks and a
 *   unique constraint preventing duplicate submissions per user per quiz.
 * @module models/Score
 */

// ============================================
//   موديل الدرجة / النتيجة (Score) — Sequelize + TiDB
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

/**
 * @typedef {Object} GradedAnswer
 * @property {string} questionId - The UUID of the question answered.
 * @property {number} selectedIndex - Index of the selected answer option.
 * @property {boolean} isCorrect - Whether the selected answer was correct.
 */

/**
 * @typedef {Object} ScoreAttributes
 * @property {number} id - Auto-incremented primary key.
 * @property {number} userId - Foreign key to the student (User.id).
 * @property {number} quizId - Foreign key to the quiz (Quiz.id).
 * @property {GradedAnswer[]} answers - Detailed answer data stored as JSON.
 * @property {number} score - Number of correct answers.
 * @property {number} total - Total number of questions.
 * @property {number} percentage - Calculated percentage (auto-set by hooks).
 * @property {number} timeTaken - Time taken to complete the quiz in seconds.
 * @property {Date} createdAt - Record creation timestamp.
 * @property {Date} updatedAt - Record last-update timestamp.
 */

/**
 * Sequelize model representing a student's quiz score/result.
 * @type {import('sequelize').ModelStatic<import('sequelize').Model<ScoreAttributes>>}
 */
const Score = sequelize.define('Score', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    quizId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    // الإجابات التفصيلية (JSON)
    // [{ questionId, selectedIndex, isCorrect }]
    answers: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    score: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    total: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    percentage: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    timeTaken: {
        type: DataTypes.INTEGER,  // بالثواني
        defaultValue: 0
    },
    isOfficial: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    attemptNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    }
}, {
    tableName: 'scores',
    timestamps: true,
    paranoid: true,
    indexes: [
        { unique: true, fields: ['userId', 'quizId'] }, // منع تكرار الامتحان
        { fields: ['quizId', 'percentage'] },
        { fields: ['userId'] }
    ],
    hooks: {
        beforeCreate(score) {
            if (score.total > 0) {
                score.percentage = Math.round((score.score / score.total) * 100);
            }
        },
        beforeUpdate(score) {
            if (score.total > 0) {
                score.percentage = Math.round((score.score / score.total) * 100);
            }
        }
    }
});

module.exports = Score;
