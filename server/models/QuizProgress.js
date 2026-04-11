const { DataTypes } = require("sequelize");
const sequelize = require("./index");

const QuizProgress = sequelize.define(
  "QuizProgress",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    deviceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    quizId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    answers: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    timeRemaining: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    currentQuestionIndex: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = QuizProgress;
