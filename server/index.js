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

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const { sanitizeBody } = require('./middleware/sanitize');
const { verifyCsrf } = require('./middleware/auth');

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
const attemptsRoutes = require('./routes/attempts');

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
    hsts: {
        maxAge: 31536000, // 1 سنة
        includeSubDomains: true,
        preload: true
    },
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

let blockedDevicesColumnsCache = null;

async function getBlockedDevicesColumns() {
    if (blockedDevicesColumnsCache) return blockedDevicesColumnsCache;
    const [rows] = await sequelize.query(`SHOW COLUMNS FROM blocked_devices`);
    blockedDevicesColumnsCache = new Set((rows || []).map((r) => r.Field));
    return blockedDevicesColumnsCache;
}

async function getSessionEmail(req) {
    try {
        const cookieToken = req.cookies?.jwt;
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
        const token = cookieToken || bearerToken;
        if (!token || token.length > 2048 || !process.env.JWT_SECRET) return '';

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.userId) return '';

        if (typeof decoded.email === 'string' && decoded.email.trim()) {
            return decoded.email.trim().toLowerCase().substring(0, 255);
        }

        if (decoded.userId) {
            const user = await User.findByPk(decoded.userId);
            if (user && user.email) {
                return String(user.email).trim().toLowerCase().substring(0, 255);
            }
        }
    } catch (_) {
        return '';
    }
    return '';
}

app.use(async (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    if (req.method === 'POST' && req.path === '/api/auth/google') return next();
    if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) return next();
    try {
        const deviceId = String(req.get('x-device-id') || req.body?.deviceId || req.query?.deviceId || '').trim().substring(0, 120);
        const forwarded = req.headers['x-forwarded-for'];
        const ipAddress = (typeof forwarded === 'string' && forwarded.trim() ? forwarded.split(',')[0].trim() : (req.ip || '').toString()).substring(0, 64);
        const sessionEmail = await getSessionEmail(req);
        const email = String(req.get('x-user-email') || req.body?.email || req.query?.email || sessionEmail || '').trim().toLowerCase().substring(0, 255);

        if (!deviceId && !ipAddress && !email) return next();

        const cols = await getBlockedDevicesColumns();
        const filters = [];
        const replacements = [];

        if (cols.has('deviceId') && deviceId) {
            filters.push('deviceId = ?');
            replacements.push(deviceId);
        }
        if (cols.has('ipAddress') && ipAddress) {
            filters.push('ipAddress = ?');
            replacements.push(ipAddress);
        }
        if (cols.has('email') && email) {
            filters.push('email = ?');
            replacements.push(email);
        }

        if (filters.length === 0) return next();

        const [rows] = await sequelize.query(
            `SELECT id, reason FROM blocked_devices
             WHERE isActive = 1
               AND (${filters.join(' OR ')})
             ORDER BY id DESC
             LIMIT 1`,
            { replacements }
        );

        if (rows && rows.length > 0) {
                        const reason = rows[0].reason || 'سبب غير محدد';
                        if (req.path.startsWith('/api/')) {
                                return res.status(403).json({
                                        error: 'تم حظر هذا الجهاز من الدخول إلى المنصة.',
                                        reason
                                });
                        }

                        return res.status(403).send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>تم حظر الوصول</title>
    <style>
        body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f8fafc; color: #111827; }
        .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
        .card { max-width: 560px; width: 100%; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,.06); }
        h1 { margin: 0 0 10px; font-size: 1.3rem; }
        p { margin: 0 0 8px; line-height: 1.7; }
        .meta { color: #4b5563; }
    </style>
</head>
<body>
    <main class="wrap">
        <section class="card">
            <h1>تم حظر هذا الجهاز من الوصول للمنصة</h1>
            <p class="meta">السبب: ${String(reason).replace(/[<>]/g, '')}</p>
            <p>إذا كان هذا الحظر بالخطأ، تواصل مع إدارة المنصة.</p>
        </section>
    </main>
</body>
</html>`);
        }
    } catch (err) {
        const sensitivePath = req.path.startsWith('/api/auth/') || req.path === '/api/auth' || req.path === '/' || req.path === '/index.html';
        if (process.env.NODE_ENV === 'production' && sensitivePath) {
            logger.error('❌ Block check failed on sensitive path, denying request:', {
                path: req.path,
                error: err.message
            });
            return res.status(503).json({ error: 'تعذر التحقق من حالة الحظر الآن. حاول مرة أخرى بعد قليل.' });
        }
        logger.warn('⚠️ Device block check failed, allowing non-sensitive request:', { error: err.message, path: req.path });
    }
    next();
});

// 6. Sanitize all request bodies
app.use(sanitizeBody);

// Block debug artifacts in production to avoid source disclosure and payload waste.
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && /\.(map|bak)$/i.test(req.path)) {
        return res.status(404).end();
    }
    next();
});

// 7. Static files مع Cache headers
app.use(express.static(path.join(__dirname, '../client'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // /config.js: long immutable cache (we version via querystring on the client)
        if (filePath.endsWith(`${path.sep}config.js`) || filePath.endsWith('/config.js')) {
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
            return;
        }

        // fonts.css: only @font-face declarations, versioned via ?v=N query param.
        // Give it a long immutable cache — same as other versioned assets.
        if (filePath.endsWith(`${path.sep}fonts.css`) || filePath.endsWith('/fonts.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
        }

        // HTML & SW: always revalidate
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
            return;
        }

        // Long-term cache for immutable assets (minified, versioned, or vendor/static assets)
        // These can be cached aggressively and served with `immutable` to speed repeat visits.
        if (filePath.match(/\.min\.(js|css)$/) || filePath.includes(`${path.sep}icons${path.sep}`) || filePath.includes(`${path.sep}fonts${path.sep}`) || filePath.includes(`${path.sep}js${path.sep}vendor${path.sep}`) || filePath.endsWith(`${path.sep}css${path.sep}tailwind.css`)) {
            // 30 days
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
            return;
        }

        // Default: short cache for JS modules and other assets that may change
        if (filePath.endsWith('.js')) {
            // Make module files and app source cacheable longer in production if they are under /js/modules or are the app entry.
            if (process.env.NODE_ENV === 'production' && (filePath.includes(`${path.sep}js${path.sep}modules${path.sep}`) || filePath.endsWith(`${path.sep}js${path.sep}app.js`) || filePath.endsWith(`${path.sep}js${path.sep}bootstrap.js`))) {
                // 30 days — these are effectively versioned by deploys / querystrings in our workflow
                res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
                return;
            }
            // 1 hour default for other JS in dev or unversioned assets
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return;
        }

        // Images/CSS: moderate cache (1 day) unless matched above
        if (filePath.match(/\.(?:css|png|jpg|jpeg|webp|svg)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return;
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
// Lightweight health endpoint: return quickly so platform healthchecks do not
// fail while the server is still performing DB migrations or waiting for DB.
// `dbConnected` and `serverReady` are set during `startServer()`.
let dbConnected = false;
let serverReady = false;

app.get('/api/health', (req, res) => {
    // In test environment, the app is imported without calling startServer(),
    // so `serverReady` stays false and would cause a false-negative health check.
    const status = (process.env.NODE_ENV === 'test' || serverReady) ? 'healthy' : 'starting';
    res.json({
        status,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        db: dbConnected ? 'connected' : 'connecting',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
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

// Serve a small JS snippet with public config to avoid an extra XHR on page load
app.get('/config.js', (req, res) => {
    const cfg = { googleClientId: process.env.GOOGLE_CLIENT_ID || '' };
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    // cache for 30 days — safe because config is versioned at deploy and reduces repeat requests
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.send(`window.__PUBLIC_CONFIG = ${JSON.stringify(cfg)};`);
});


// ============================================
//              ربط المسارات
// ============================================

// CSRF verification — applied to all mutating API requests.
// Exempt: POST /api/auth/google (initial login, no CSRF cookie exists yet).
app.use('/api', (req, res, next) => {
    if (req.path === '/auth/google' && req.method === 'POST') return next();
    if (req.path === '/auth/guest-session' && req.method === 'POST') return next();
    return verifyCsrf(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/attempts', attemptsRoutes);
app.use('/api/notes', noteRoutes);

// --- SPA Fallback ---
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    // HTTP Link preload headers — browser starts fetching LCP asset
    // from the very first byte of the response, before HTML is parsed.
    // Logo is the actual LCP element (Lighthouse confirmed)
    res.setHeader('Link', '</icons/Gemini_Generated_Image_t3vu3xt3vu3xt3vu.avif>; rel=preload; as=image; type=image/avif; fetchpriority=high');
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
        // isOfficial and attemptNumber for multi-attempt support
        `ALTER TABLE \`scores\` ADD COLUMN IF NOT EXISTS \`isOfficial\` TINYINT(1) DEFAULT 1`,
        `ALTER TABLE \`scores\` ADD COLUMN IF NOT EXISTS \`attemptNumber\` INT DEFAULT 1`,
        // isActive on quizzes
        `ALTER TABLE \`quizzes\` ADD COLUMN IF NOT EXISTS \`isActive\` TINYINT(1) DEFAULT 1`,
        // createdBy on quizzes
        `ALTER TABLE \`quizzes\` ADD COLUMN IF NOT EXISTS \`createdBy\` INT NULL DEFAULT NULL`,
        // createdBy on notes
        `ALTER TABLE \`notes\` ADD COLUMN IF NOT EXISTS \`createdBy\` INT NULL DEFAULT NULL`,
        // brute force tracking table (persists across restarts & instances)
        `CREATE TABLE IF NOT EXISTS \`login_attempts\` (
            \`ip\`           VARCHAR(45)  NOT NULL,
            \`count\`        INT          NOT NULL DEFAULT 1,
            \`last_attempt\` BIGINT       NOT NULL,
            PRIMARY KEY (\`ip\`)
        )`,
        `CREATE TABLE IF NOT EXISTS \`account_sessions\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`userId\` INT NULL,
            \`email\` VARCHAR(255) NULL,
            \`deviceId\` VARCHAR(120) NULL,
            \`loginType\` VARCHAR(30) NOT NULL DEFAULT 'google',
            \`ipAddress\` VARCHAR(64) NULL,
            \`deviceName\` VARCHAR(120) NULL,
            \`userAgent\` VARCHAR(500) NULL,
            \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            INDEX \`idx_account_sessions_user\` (\`userId\`),
            INDEX \`idx_account_sessions_email\` (\`email\`),
            INDEX \`idx_account_sessions_device\` (\`deviceId\`),
            INDEX \`idx_account_sessions_type\` (\`loginType\`)
        )`,
        `ALTER TABLE \`account_sessions\` ADD COLUMN IF NOT EXISTS \`deviceId\` VARCHAR(120) NULL`,
        `CREATE INDEX IF NOT EXISTS \`idx_account_sessions_device\` ON \`account_sessions\` (\`deviceId\`)`,
        `CREATE TABLE IF NOT EXISTS \`blocked_devices\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`email\` VARCHAR(255) NULL,
            \`deviceId\` VARCHAR(120) NULL,
            \`ipAddress\` VARCHAR(64) NULL,
            \`deviceName\` VARCHAR(120) NULL,
            \`reason\` VARCHAR(255) NULL,
            \`blockedBy\` VARCHAR(255) NULL,
            \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
            \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            INDEX \`idx_blocked_devices_email\` (\`email\`),
            INDEX \`idx_blocked_devices_device\` (\`deviceId\`),
            INDEX \`idx_blocked_devices_ip\` (\`ipAddress\`),
            INDEX \`idx_blocked_devices_active\` (\`isActive\`)
        )`,
        `ALTER TABLE \`blocked_devices\` ADD COLUMN IF NOT EXISTS \`email\` VARCHAR(255) NULL`,
        `CREATE INDEX IF NOT EXISTS \`idx_blocked_devices_email\` ON \`blocked_devices\` (\`email\`)`,
        // index for leaderboard query: WHERE deletedAt IS NULL GROUP BY userId
        `CREATE INDEX IF NOT EXISTS \`idx_scores_user_deleted\` ON \`scores\` (\`userId\`, \`deletedAt\`)`,
    ];
    for (const sql of migrations) {
        try {
            await sequelize.query(sql);
        } catch (e) {
            logger.warn(`⚠️ Migration skipped: ${e.message.substring(0, 80)}`);
        }
    }

    // Drop legacy UNIQUE(userId, quizId) index to allow multiple attempts per quiz.
    try {
        const [uniqueIdxRows] = await sequelize.query(
            `SELECT INDEX_NAME
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'scores'
               AND NON_UNIQUE = 0
             GROUP BY INDEX_NAME
             HAVING COUNT(*) = 2
                AND SUM(CASE WHEN COLUMN_NAME = 'userId' THEN 1 ELSE 0 END) = 1
                AND SUM(CASE WHEN COLUMN_NAME = 'quizId' THEN 1 ELSE 0 END) = 1`
        );

        for (const row of uniqueIdxRows || []) {
            const idxName = row.INDEX_NAME || row.index_name;
            if (!idxName || idxName === 'PRIMARY') continue;
            await sequelize.query(`ALTER TABLE \`scores\` DROP INDEX \`${idxName}\``);
            logger.info(`✅ Dropped legacy unique index on scores: ${idxName}`);
        }
    } catch (e) {
        logger.warn(`⚠️ Unable to drop legacy score unique index automatically: ${e.message}`);
    }

    logger.info('✅ Safe migrations complete.');
}

async function startServer(retries = 3) {
    // In production, only alter if explicitly enabled (safety for real data)
    const enableAlter = process.env.DB_SYNC_ALTER === 'true';
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await sequelize.authenticate();
            dbConnected = true;
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
        logger.warn('تفاصيل الخطأ:', syncErr);
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
        serverReady = true;
        logger.info(`🚀 السيرفر شغال على: http://localhost:${PORT}`);

        // KeepAlive: self-ping every 13 min to prevent Railway free-tier cold-start
        // (Railway spins down idle services; 13 min < 15 min idle timeout)
        if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME) {
            const selfPingUrl = `http://localhost:${PORT}/api/health`;
            setInterval(() => {
                require('http').get(selfPingUrl, (res) => {
                    res.resume(); // drain response
                }).on('error', () => {}); // silently ignore errors
            }, 13 * 60 * 1000);
            logger.info('🏓 KeepAlive self-ping enabled (13 min interval).');
        }
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
