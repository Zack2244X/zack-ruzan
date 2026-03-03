/**
 * @file Main server entry point
 * @description Configures and starts the Express application for the interactive quiz platform.
 *   Sets up security middleware (Helmet, CORS, HPP), rate limiting, static file serving,
 *   Sequelize model associations, API routes, and graceful shutdown handling.
 * @module server/index
 */

// ============================================
//   سيرفر منصة الاختبارات التفاعلية
//   بسم الله الرحمن الرحيم
//   — Sequelize + TiDB (MySQL) —
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('./utils/logger');
const { sanitizeBody } = require('./middleware/sanitize');

// ============================================
//   Environment Validation — فحص المتغيرات
// ============================================
/**
 * Environment variables required for the application to run.
 * In production, the server exits if any are missing.
 * @type {string[]}
 * @constant
 */
const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'GOOGLE_CLIENT_ID'];
const missingEnv = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnv.length > 0) {
    logger.error(`❌ متغيرات البيئة الناقصة: ${missingEnv.join(', ')}`);
    if (process.env.NODE_ENV === 'production') process.exit(1);
    logger.warn('⚠️ متابعة في وضع التطوير بدون بعض المتغيرات...');
}

// --- Sequelize + Models ---
const sequelize = require('./models/index');
const User = require('./models/User');
const Quiz = require('./models/Quiz');
const Score = require('./models/Score');
const Note = require('./models/Note');

// --- العلاقات (Associations) ---
Quiz.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Score.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
Score.belongsTo(Quiz, { as: 'quiz', foreignKey: 'quizId', onDelete: 'CASCADE' });
Note.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
User.hasMany(Score, { foreignKey: 'userId', onDelete: 'CASCADE' });
Quiz.hasMany(Score, { foreignKey: 'quizId', onDelete: 'CASCADE' });

// --- استيراد المسارات (Routes) ---
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quizzes');
const scoreRoutes = require('./routes/scores');
const noteRoutes = require('./routes/notes');

/**
 * Express application instance.
 * @type {import('express').Application}
 */
const app = express();

// خلف البروكسي (Railway/Render/NGINX)
app.set('trust proxy', 1);

// ============================================
//     طبقات الأمان والأداء (Security + Perf)
// ============================================

// 1. Helmet — هيدرز أمان شاملة
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            workerSrc: ["'self'"],
            frameSrc: ["https://accounts.google.com"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permissionsPolicy: {
        features: {
            camera: [],
            microphone: [],
            geolocation: []
        }
    }
}));

// 2. Compression — ضغط الاستجابات (gzip/brotli)
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// 3. CORS — تحديد المصادر المسموحة
/**
 * Allowed CORS origins, loaded from the ALLOWED_ORIGINS environment variable.
 * Defaults to `['http://localhost:3000']` in development.
 * @type {string[]}
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : ['http://localhost:3000'];

// Auto-allow the Railway production domain if RAILWAY_PUBLIC_DOMAIN is set
if (process.env.RAILWAY_PUBLIC_DOMAIN && !allowedOrigins.includes('*')) {
    const railwayOrigin = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    if (!allowedOrigins.includes(railwayOrigin)) allowedOrigins.push(railwayOrigin);
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            logger.warn('🚫 CORS blocked origin:', { origin });
            callback(new Error('غير مسموح بالوصول من هذا المصدر.'));
        }
    },
    credentials: true
}));

// 4. منع HTTP Parameter Pollution
app.use(hpp());

// 4.5. Cookie Parser — لقراءة JWT من الكوكيز
app.use(cookieParser());

// 5. JSON parsing مع حد آمن
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 6. Sanitize all request bodies
app.use(sanitizeBody);

// 7. Static files مع Cache headers
app.use(express.static(path.join(__dirname, '../client'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // HTML & SW: always revalidate
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
        // JS modules: short cache so updates arrive quickly
        if (filePath.endsWith('.js') && !filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// 8. إخفاء معلومات السيرفر
app.disable('x-powered-by');

// ============================================
//         Rate Limiting — 3 مستويات
// ============================================
/**
 * General API rate limiter: 200 requests per 15 minutes.
 * @type {import('express').RequestHandler}
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'تم تجاوز عدد الطلبات المسموحة، حاول بعد قليل.' }
});

/**
 * Authentication rate limiter: 10 requests per 15 minutes (skips successful requests).
 * @type {import('express').RequestHandler}
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'محاولات دخول كثيرة، حاول بعد 15 دقيقة.' },
    skipSuccessfulRequests: true
});

/**
 * Admin routes rate limiter: 50 requests per 15 minutes.
 * @type {import('express').RequestHandler}
 */
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'تم تجاوز عدد طلبات الإدارة.' }
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);

// Admin limiter — only apply to write operations (POST/PUT/DELETE) on admin routes
const applyAdminLimiter = (req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        return adminLimiter(req, res, next);
    }
    next();
};
app.use('/api/quizzes', applyAdminLimiter);
app.use('/api/notes', applyAdminLimiter);

// ============================================
//   Health Check Endpoint
// ============================================
/**
 * @route GET /api/health
 * @description Health check endpoint that verifies database connectivity and reports server status.
 * @access Public
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with health status JSON.
 * @returns {Promise<void>}
 */
app.get('/api/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({
            status: 'healthy',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            db: 'connected',
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            db: 'disconnected',
            error: process.env.NODE_ENV === 'production' ? 'خطأ في قاعدة البيانات' : err.message
        });
    }
});

// ============================================
//   Public Config Endpoint (non-sensitive)
// ============================================
/**
 * @route GET /api/config
 * @description Returns non-sensitive public configuration like Google Client ID.
 * @access Public
 */
app.get('/api/config', (req, res) => {
    res.json({
        googleClientId: process.env.GOOGLE_CLIENT_ID || ''
    });
});


// ============================================
//              ربط المسارات
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/notes', noteRoutes);

// --- SPA Fallback ---
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// --- 404 API ---
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'المسار المطلوب غير موجود.' });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    logger.error('❌ Server Error:', { message: err.message, stack: err.stack, path: req.path });
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({
        error: isDev ? err.message : 'حدث خطأ داخلي في السيرفر.',
        ...(isDev && { stack: err.stack })
    });
});

// ============================================
//      الاتصال بقاعدة البيانات والتشغيل
// ============================================
const PORT = process.env.PORT || 3000;
let server;

/**
 * Connects to the database with retries and starts the HTTP server.
 * Exits the process if all connection attempts fail.
 * @async
 * @param {number} [retries=3] - Number of database connection attempts before giving up.
 * @returns {Promise<void>}
 */
/**
 * Safely adds missing columns to all tables using IF NOT EXISTS.
 * Handles TiDB quirks where sequelize.sync({ alter }) may fail.
 */
async function runSafeMigrations() {
    const migrations = [
        // paranoid deletedAt columns
        `ALTER TABLE \`users\`   ADD COLUMN IF NOT EXISTS \`deletedAt\` DATETIME NULL DEFAULT NULL`,
        `ALTER TABLE \`quizzes\` ADD COLUMN IF NOT EXISTS \`deletedAt\` DATETIME NULL DEFAULT NULL`,
        `ALTER TABLE \`scores\`  ADD COLUMN IF NOT EXISTS \`deletedAt\` DATETIME NULL DEFAULT NULL`,
        `ALTER TABLE \`notes\`   ADD COLUMN IF NOT EXISTS \`deletedAt\` DATETIME NULL DEFAULT NULL`,
        // tokenVersion on users
        `ALTER TABLE \`users\` ADD COLUMN IF NOT EXISTS \`tokenVersion\` INT NOT NULL DEFAULT 0`,
        // percentage on scores
        `ALTER TABLE \`scores\` ADD COLUMN IF NOT EXISTS \`percentage\` FLOAT DEFAULT 0`,
        // timeTaken on scores
        `ALTER TABLE \`scores\` ADD COLUMN IF NOT EXISTS \`timeTaken\` INT DEFAULT 0`,
        // isActive on quizzes
        `ALTER TABLE \`quizzes\` ADD COLUMN IF NOT EXISTS \`isActive\` TINYINT(1) DEFAULT 1`,
        // createdBy on quizzes
        `ALTER TABLE \`quizzes\` ADD COLUMN IF NOT EXISTS \`createdBy\` INT NULL DEFAULT NULL`,
        // createdBy on notes
        `ALTER TABLE \`notes\` ADD COLUMN IF NOT EXISTS \`createdBy\` INT NULL DEFAULT NULL`,
    ];
    for (const sql of migrations) {
        try {
            await sequelize.query(sql);
        } catch (e) {
            logger.warn(`⚠️ Migration skipped: ${e.message.substring(0, 80)}`);
        }
    }
    logger.info('✅ Safe migrations complete.');
}

async function startServer(retries = 3) {
    // In production, only alter if explicitly enabled (safety for real data)
    const enableAlter = process.env.DB_SYNC_ALTER === 'true';
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await sequelize.authenticate();
            logger.info('✅ تم الاتصال بقاعدة البيانات TiDB بنجاح.');
            break;
        } catch (err) {
            logger.error(`❌ محاولة ${attempt}/${retries} فشلت:`, { error: err.message });
            if (attempt === retries) {
                logger.error('❌ فشل الاتصال بقاعدة البيانات نهائياً');
                process.exit(1);
            }
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    // Try alter first; if TiDB rejects it, fall back to no-op sync
    try {
        await sequelize.sync({ alter: enableAlter });
        logger.info(`✅ تم مزامنة الجداول${enableAlter ? ' (alter: true)' : ''}.`);
    } catch (syncErr) {
        logger.warn('⚠️ sync alter فشل، محاولة بدون alter:', syncErr.message);
        try {
            await sequelize.sync({ alter: false });
            logger.info('✅ تم مزامنة الجداول (alter: false fallback).');
        } catch (syncErr2) {
            logger.error('❌ فشل sync نهائياً:', syncErr2.message);
            // Don't exit — let the server start and handle DB errors per-request
        }
    }

    // Run explicit safe migrations for TiDB (IF NOT EXISTS — safe to run every time)
    await runSafeMigrations();

    server = app.listen(PORT, () => {
        logger.info(`🚀 السيرفر شغال على: http://localhost:${PORT}`);
    });
}

// ============================================
//   Graceful Shutdown — إيقاف آمن
// ============================================
/**
 * Gracefully shuts down the HTTP server and closes the database connection.
 * Forces exit after 10 seconds if graceful shutdown stalls.
 * @async
 * @param {string} signal - The signal or event name that triggered shutdown (e.g., 'SIGTERM').
 * @returns {Promise<void>}
 */
async function gracefulShutdown(signal) {
    logger.info(`📴 ${signal} received — إيقاف آمن...`);
    if (server) {
        server.close(async () => {
            logger.info('🔌 HTTP server مغلق');
            try {
                await sequelize.close();
                logger.info('🔌 Database connection مغلق');
            } catch (e) {
                logger.error('خطأ في إغلاق DB:', e.message);
            }
            process.exit(0);
        });
        setTimeout(() => {
            logger.warn('⚠️ إيقاف إجباري بعد 10 ثوانٍ');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(0);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    logger.error('🔥 Uncaught Exception:', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    logger.error('🔥 Unhandled Rejection:', { reason: String(reason) });
});

// Start the server only when not running under Jest
if (process.env.NODE_ENV !== 'test') {
    startServer();
}

module.exports = app;
