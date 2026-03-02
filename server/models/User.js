// ============================================
//   موديل المستخدم (User) — Sequelize + TiDB
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },
    googleId: {
        type: DataTypes.STRING(255),
        unique: true,
        allowNull: true
    },
    avatar: {
        type: DataTypes.STRING(500),
        defaultValue: ''
    },
    fname: {
        type: DataTypes.STRING(50),
        defaultValue: ''
    },
    lname: {
        type: DataTypes.STRING(50),
        defaultValue: ''
    },
    isProfileComplete: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    role: {
        type: DataTypes.ENUM('student', 'admin'),
        defaultValue: 'student'
    }
}, {
    tableName: 'users',
    timestamps: true
});

// --- حقل افتراضي للاسم الكامل ---
User.prototype.getFullName = function () {
    if (this.fname && this.lname) return `${this.fname} ${this.lname}`;
    return this.email;
};

module.exports = User;
