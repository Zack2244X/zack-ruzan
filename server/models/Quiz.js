// ============================================
//   موديل الامتحان (Quiz) — Sequelize + TiDB
//   الأسئلة تُخزّن كـ JSON (TiDB يدعم JSON)
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

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
    timestamps: true
});

module.exports = Quiz;
