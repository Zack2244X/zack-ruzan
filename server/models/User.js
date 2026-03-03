/**
 * @file User model definition
 * @description Defines the Sequelize User model for the quiz platform.
 *   Supports Google OAuth, role-based access (student/admin), and token versioning.
 * @module models/User
 */

// ============================================
//   موديل المستخدم (User) — Sequelize + TiDB
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

/**
 * @typedef {Object} UserAttributes
 * @property {number} id - Auto-incremented primary key.
 * @property {string} email - Unique email address (validated as email).
 * @property {string|null} googleId - Google OAuth unique identifier.
 * @property {string} avatar - URL to the user's avatar image.
 * @property {string} fname - First name (max 50 chars).
 * @property {string} lname - Last name (max 50 chars).
 * @property {boolean} isProfileComplete - Whether the user has completed profile setup.
 * @property {'student'|'admin'} role - User role for access control.
 * @property {number} tokenVersion - Incremented on logout to invalidate existing JWTs.
 * @property {Date} createdAt - Record creation timestamp.
 * @property {Date} updatedAt - Record last-update timestamp.
 * @property {Date|null} deletedAt - Soft-delete timestamp (paranoid mode).
 */

/**
 * Sequelize model representing a platform user.
 * @type {import('sequelize').ModelStatic<import('sequelize').Model<UserAttributes>>}
 */
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
    },
    tokenVersion: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: 'Incremented on logout/revoke to invalidate all existing tokens'
    }
}, {
    tableName: 'users',
    timestamps: true,
    paranoid: true
});

/**
 * Returns the user's full name, or their email if names are not set.
 * @returns {string} The full name or email.
 */
User.prototype.getFullName = function () {
    if (this.fname && this.lname) return `${this.fname} ${this.lname}`;
    return this.email;
};

module.exports = User;
