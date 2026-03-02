// ============================================
//   موديل الدرجة / النتيجة (Score) — Sequelize + TiDB
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

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
    }
}, {
    tableName: 'scores',
    timestamps: true,
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
