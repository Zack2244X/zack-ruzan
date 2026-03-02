// ============================================
//   إعداد الاتصال بقاعدة البيانات — Sequelize + TiDB
// ============================================
const { Sequelize } = require('sequelize');

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
