/**
 * @file Note model definition
 * @description Defines the Sequelize Note model for educational resource links (PDFs, PPTs, URLs).
 * @module models/Note
 */

// ============================================
//   موديل المذكرة / الملف (Note) — Sequelize + TiDB
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

/**
 * @typedef {Object} NoteAttributes
 * @property {number} id - Auto-incremented primary key.
 * @property {string} title - Note title (max 255 chars).
 * @property {string} subject - Subject/category name (max 100 chars).
 * @property {string} link - URL to the resource (max 500 chars).
 * @property {'pdf'|'ppt'|'link'} type - Type of the linked resource.
 * @property {string} description - Optional note description.
 * @property {number|null} createdBy - Foreign key to the creator (User.id).
 * @property {Date} createdAt - Record creation timestamp.
 * @property {Date} updatedAt - Record last-update timestamp.
 * @property {Date|null} deletedAt - Soft-delete timestamp (paranoid mode).
 */

/**
 * Sequelize model representing an educational note/resource.
 * @type {import('sequelize').ModelStatic<import('sequelize').Model<NoteAttributes>>}
 */
const Note = sequelize.define('Note', {
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
    link: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('pdf', 'ppt', 'link'),
        defaultValue: 'pdf'
    },
    description: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'notes',
    timestamps: true,
    paranoid: true
});

module.exports = Note;
