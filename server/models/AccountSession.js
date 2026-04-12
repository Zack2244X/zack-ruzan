const { DataTypes } = require("sequelize");
const sequelize = require("./index");

const AccountSession = sequelize.define(
  "AccountSession",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    loginType: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "google",
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    macAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    deviceName: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    deviceId: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: "account_sessions",
    timestamps: true,
  }
);

module.exports = AccountSession;
