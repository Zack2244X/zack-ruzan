/**
 * @file Database connection configuration
 * @description Initializes and exports a Sequelize instance connected to a TiDB (MySQL-compatible) database.
 *   Supports SSL with CA certificate verification, connection pooling, and environment-based logging.
 * @module models/index
 */

// ============================================
//   إعداد الاتصال بقاعدة البيانات — Sequelize + TiDB
// ============================================
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

/**
 * Builds SSL configuration with proper CA certificate verification.
 * Falls back to system CA if DB_CA is not set.
 * @returns {Object|undefined} SSL config or undefined if DB_SSL is not 'true'
 */
function buildSslConfig() {
    if (process.env.DB_SSL !== 'true') return undefined;

    const sslConfig = { minVersion: 'TLSv1.2', rejectUnauthorized: true };

    // Try DB_CA env var → then fallback to ca.pem next to this file
    const caPath = process.env.DB_CA || path.join(__dirname, '..', 'ca.pem');
    try {
        if (fs.existsSync(caPath)) {
            sslConfig.ca = fs.readFileSync(caPath, 'utf8');
        }
        // If no CA file found, rejectUnauthorized still true → uses system CAs
    } catch (err) {
        console.warn('⚠️ تعذر قراءة شهادة CA:', err.message, '— سيتم استخدام شهادات النظام.');
    }

    return sslConfig;
}

/**
 * Sequelize instance configured for TiDB/MySQL.
 * @type {import('sequelize').Sequelize}
 */
const sequelize = new Sequelize(
    process.env.DB_NAME || 'quiz_platform',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 4000,
        dialect: 'mysql',
        dialectOptions: {
            ssl: buildSslConfig()
        },
        logging: process.env.NODE_ENV === 'development' ? (msg) => require('../utils/logger').debug(msg) : false,
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: false
        }
    }
);

module.exports = sequelize;
