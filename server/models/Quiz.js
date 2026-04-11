/**
 * @file Quiz model definition + encryption hooks
 * @description Defines the Sequelize Quiz model. Questions are stored as a JSON column
 *   in TiDB with AES-256-GCM encryption for answer correctness (isCorrect flag).
 * @module models/Quiz
 */

// ============================================
//   موديل الامتحان (Quiz) — Sequelize + TiDB
//   الأسئلة تُخزّن كـ JSON (TiDB يدعم JSON)
//   الإجابات الصحيحة تُشفّر (AES-256-GCM)
// ============================================
const { DataTypes } = require("sequelize");
const sequelize = require("./index");
const { encrypt, decrypt } = require("../utils/encryption");
const logger = require("../utils/logger");

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
const Quiz = sequelize.define(
  "Quiz",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true, // منع تكرار العنوان
    },
    subject: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      defaultValue: "",
    },
    timeLimit: {
      type: DataTypes.INTEGER, // بالثواني
      defaultValue: 1800, // 30 دقيقة
    },
    closingMessage: {
      type: DataTypes.TEXT,
      defaultValue: "شكراً لمشاركتك في الاختبار!",
    },
    streakGoal: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
    },
    feedback: {
      type: DataTypes.JSON,
      defaultValue: {
        correct: {
          message: "ماشاء الله! إجابة صحيحة.",
          onStreak: "أحسنت! سلسلة متتالية من الإجابات الصحيحة!",
        },
        incorrect: {
          message: "للأسف، الإجابة غير صحيحة.",
        },
      },
    },
    // الأسئلة: مصفوفة JSON
    // كل سؤال: { id, question, hint, answerOptions: [{ text, isCorrect, rationale }] }
    questions: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "quizzes",
    timestamps: true,
    paranoid: true,
    indexes: [{ unique: true, fields: ["title"] }],
    hooks: {
      // ✅ Before saving to DB: encrypt answer correctness
      beforeCreate: (quiz) => {
        if (quiz.questions && Array.isArray(quiz.questions)) {
          quiz.questions = quiz.questions.map((q) => ({
            ...q,
            answerOptions: q.answerOptions.map((opt) => ({
              ...opt,
              // Encrypt the isCorrect flag to prevent student cheating
              // (students cannot inspect DB to find correct answers)
              isCorrect: encrypt(opt.isCorrect.toString()),
            })),
          }));
        }
      },
      beforeUpdate: (quiz) => {
        if (quiz.questions && Array.isArray(quiz.questions)) {
          quiz.questions = quiz.questions.map((q) => ({
            ...q,
            answerOptions: q.answerOptions.map((opt) => {
              // Only encrypt if not already encrypted (contains ':' separator)
              const isAlreadyEncrypted =
                typeof opt.isCorrect === "string" &&
                opt.isCorrect.includes(":");
              return {
                ...opt,
                isCorrect: isAlreadyEncrypted
                  ? opt.isCorrect
                  : encrypt(opt.isCorrect.toString()),
              };
            }),
          }));
        }
      },
      // ✅ After reading from DB: decrypt answer correctness
      afterFind: (quizzes) => {
        if (!quizzes) return;

        const quizArray = Array.isArray(quizzes) ? quizzes : [quizzes];
        quizArray.forEach((quiz) => {
          if (quiz && quiz.questions && Array.isArray(quiz.questions)) {
            quiz.questions = quiz.questions.map((q) => ({
              ...q,
              answerOptions: q.answerOptions.map((opt) => {
                try {
                  // Only attempt decryption if isCorrect is a string
                  if (typeof opt.isCorrect !== "string") {
                    // Already a boolean or other type
                    return {
                      ...opt,
                      isCorrect:
                        opt.isCorrect === true || opt.isCorrect === "true",
                    };
                  }
                  // Try to decrypt; if it fails, assume it's already decrypted plaintext
                  const decrypted = decrypt(opt.isCorrect);
                  return {
                    ...opt,
                    isCorrect: decrypted === "true",
                  };
                } catch (e) {
                  // Already in plaintext or invalid format
                  return {
                    ...opt,
                    isCorrect:
                      opt.isCorrect === true || opt.isCorrect === "true",
                  };
                }
              }),
            }));
          }
        });
      },
    },
  },
  {
    tableName: "quizzes",
    timestamps: true,
    paranoid: true,
    indexes: [{ unique: true, fields: ["title"] }],
  },
);

module.exports = Quiz;
