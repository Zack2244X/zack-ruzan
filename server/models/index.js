// ============================================
//   إعداد الاتصال بقاعدة البيانات — Sequelize + TiDB
// ============================================
const { Sequelize } = require('sequelize');

// --- Debug: طباعة إعدادات الاتصال ---
console.log('🔍 DB Config:', {
    host: process.env.DB_HOST || '⚠️ NOT SET - using localhost',
    port: process.env.DB_PORT || '⚠️ NOT SET - using 4000',
    user: process.env.DB_USER ? '✅ SET' : '⚠️ NOT SET',
    password: process.env.DB_PASSWORD ? '✅ SET' : '⚠️ NOT SET',
    name: process.env.DB_NAME || '⚠️ NOT SET',
    ssl: process.env.DB_SSL || '⚠️ NOT SET'
});

const sequelize = new Sequelize(
    process.env.DB_NAME || 'quiz_platform',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 4000,
        dialect: 'mysql',
        dialectOptions: {
            ssl: process.env.DB_SSL === 'true'
                ? { minVersion: 'TLSv1.2', rejectUnauthorized: false }
                : undefined
        },
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
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
