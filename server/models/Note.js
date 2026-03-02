// ============================================
//   موديل المذكرة / الملف (Note) — Sequelize + TiDB
// ============================================
const { DataTypes } = require('sequelize');
const sequelize = require('./index');

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
    timestamps: true
});

module.exports = Note;
