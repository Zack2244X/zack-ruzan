/**
 * @file Authentication and authorization middleware
 * @description Provides JWT-based authentication, admin authorization, token generation,
 *   and brute-force login protection (in-memory tracking with auto-cleanup).
 * @module middleware/auth
 */

// ============================================
//   Middleware التوثيق والصلاحيات — محصّن
//   — Sequelize + TiDB —
// ============================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * JWT secret key.
 * In production, must be set via the JWT_SECRET environment variable.
 * In development, falls back to a random value if not configured.
 * @type {string}
 * @constant
 */
const JWT_SECRET = (() => {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
        logger.error('❌ يجب ضبط JWT_SECRET في بيئة الإنتاج!');
        process.exit(1);
    }
    logger.warn('⚠️ JWT_SECRET غير محدد — استخدام قيمة عشوائية (تطوير فقط)');
    return crypto.randomBytes(32).toString('hex');
})();

// ============================================
//   سجل محاولات الدخول الفاشلة (قاعدة البيانات)
//   — DB-backed: يبقى بعد restart وعبر instances —
// ============================================
const MAX_FAILED = 5;
const LOCKOUT_TIME = 30 * 60 * 1000; // 30 minutes

/**
 * Checks whether the given IP is locked out (DB-backed, table: login_attempts).
 * Fails open on DB error to avoid blocking legitimate users.
 * @param {string} ip
 * @returns {Promise<boolean>}
 */
async function checkBruteForce(ip) {
    try {
        const sequelize = require('../models/index');
        const [[record]] = await sequelize.query(
            'SELECT `count`, `last_attempt` FROM `login_attempts` WHERE `ip` = ?',
            { replacements: [ip] }
        );
        if (!record) return false;
        if (Date.now() - Number(record.last_attempt) > LOCKOUT_TIME) {
            sequelize.query('DELETE FROM `login_attempts` WHERE `ip` = ?', { replacements: [ip] }).catch(() => {});
            return false;
        }
        return Number(record.count) >= MAX_FAILED;
    } catch {
        return false; // fail open — لا نحجب المستخدمين لو DB غير متاحة
    }
}

/**
 * Records a failed login attempt via DB UPSERT.
 * @param {string} ip
 * @returns {Promise<void>}
 */
async function recordFailedAttempt(ip) {
    try {
        const sequelize = require('../models/index');
        await sequelize.query(
            'INSERT INTO `login_attempts` (`ip`, `count`, `last_attempt`) VALUES (?, 1, ?)' +
            ' ON DUPLICATE KEY UPDATE `count` = `count` + 1, `last_attempt` = ?',
            { replacements: [ip, Date.now(), Date.now()] }
        );
    } catch { /* fire-and-forget */ }
}

/**
 * Clears failed login attempts for the given IP after a successful login.
 * @param {string} ip
 * @returns {Promise<void>}
 */
async function clearFailedAttempts(ip) {
    try {
        const sequelize = require('../models/index');
        await sequelize.query('DELETE FROM `login_attempts` WHERE `ip` = ?', { replacements: [ip] });
    } catch { /* fire-and-forget */ }
}

// ============================================
//   CSRF Protection — Double Submit Cookie
// ============================================
/**
 * Sets a non-httpOnly CSRF token cookie that client JS reads and echoes
 * back as the X-CSRF-Token header on every mutating request.
 * The server compares header === cookie (Double Submit Cookie Pattern).
 * Attackers from other origins cannot read our cookies, so they cannot forge the header.
 * @param {import('express').Response} res
 */
const setCsrfCookie = (res) => {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf_token', token, {
        httpOnly: false, // JS يجب أن يقرأ هذه القيمة
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
    });
};

/**
 * Clears the CSRF cookie on logout.
 * @param {import('express').Response} res
 */
const clearCsrfCookie = (res) => {
    res.clearCookie('csrf_token', { path: '/' });
};

/**
 * Middleware: enforces CSRF double-submit cookie on mutating requests.
 * GET / HEAD / OPTIONS are always allowed.
 * POST /api/auth/google is exempt (handled in index.js) — no cookie on first login.
 */
const verifyCsrf = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const cookieToken = req.cookies?.csrf_token;
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        logger.warn(`🚨 CSRF mismatch — IP: ${req.ip}, ${req.method} ${req.path}`);
        return res.status(403).json({ error: 'طلب غير صالح. أعد تحميل الصفحة وحاول مرة أخرى.' });
    }
    next();
};

// ============================================
//   1. التحقق من تسجيل الدخول (أي مستخدم)
// ============================================
/**
 * Express middleware that verifies the JWT from the httpOnly cookie or
 * Authorization header, looks up the user in the database, validates
 * role and tokenVersion, and attaches the user object to the request.
 */

/**
 * Cookie options for the JWT httpOnly cookie.
 * @type {Object}
 */
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
};

/**
 * Sets the JWT token as an httpOnly cookie on the response.
 * @param {import('express').Response} res - Express response object.
 * @param {string} token - The JWT token to set.
 */
const setTokenCookie = (res, token) => {
    res.cookie('jwt', token, COOKIE_OPTIONS);
};

/**
 * Clears the JWT cookie from the response.
 * @param {import('express').Response} res - Express response object.
 */
const clearTokenCookie = (res) => {
    res.clearCookie('jwt', { ...COOKIE_OPTIONS, maxAge: 0 });
};

/**
 * Express middleware that verifies the JWT from httpOnly cookie or Authorization header.
 * Supports both mechanisms for mobile/API compatibility.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 * @throws {401} If the token is missing, invalid, expired, or the user is not found.
 */
const authenticate = async (req, res, next) => {
    try {
        // Priority: httpOnly cookie > Authorization header
        let token = null;

        if (req.cookies && req.cookies.jwt) {
            token = req.cookies.jwt;
        } else {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
        }

        if (!token) {
            return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
        }

        if (token.length > 2048) {
            return res.status(401).json({ error: 'توكن غير صالح.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.userId || !decoded.role) {
            return res.status(401).json({ error: 'توكن غير صالح.' });
        }

        const user = await User.findByPk(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'المستخدم غير موجود.' });
        }

        if (decoded.role !== user.role) {
            logger.warn(`⚠️ محاولة تلاعب بالتوكن — IP: ${req.ip}, User: ${user.email}, Token role: ${decoded.role}, DB role: ${user.role}`);
            return res.status(401).json({ error: 'توكن غير صالح. سجل دخولك مرة أخرى.' });
        }

        if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ error: 'تم إلغاء هذا التوكن. سجل دخولك مرة أخرى.' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'انتهت صلاحية الجلسة، سجل دخولك مرة أخرى.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'توكن غير صالح.' });
        }
        return res.status(401).json({ error: 'خطأ في التحقق من الهوية.' });
    }
};

// ============================================
//   2. التحقق من صلاحيات الأدمن (المعلم)
// ============================================
/**
 * Express middleware that checks whether the authenticated user has the 'admin' role.
 * Must be used after the `authenticate` middleware.
 * @param {import('express').Request} req - Express request object (must have `req.user`).
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 * @throws {403} If the user is not an admin.
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        logger.warn(`🚨 محاولة وصول غير مصرح للأدمن — IP: ${req.ip}, User: ${req.user ? req.user.email : 'unknown'}, Path: ${req.originalUrl}`);
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول. هذا الإجراء للمعلم فقط.' });
    }
    logger.info(`👑 عملية أدمن — ${req.method} ${req.originalUrl} — بواسطة: ${req.user.email}`);
    next();
};

// ============================================
//   3. إنشاء توكن JWT
// ============================================
/**
 * Generates a signed JWT for the given user.
 * @param {number} userId - The user's database ID.
 * @param {string} role - The user's role ('student' or 'admin').
 * @param {number} [tokenVersion=0] - The current token version for revocation support.
 * @param {string} [email=''] - Optional user email for cross-middleware policies.
 * @returns {string} A signed JWT string.
 */
const generateToken = (userId, role, tokenVersion = 0, email = '') => {
    return jwt.sign(
        {
            userId,
            role,
            tokenVersion,
            email: email ? String(email).toLowerCase().substring(0, 255) : undefined,
            iat: Math.floor(Date.now() / 1000),
            jti: crypto.randomBytes(8).toString('hex')
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// ============================================
//   authenticateOrGuest — قراءة عامة للضيوف
// ============================================
/**
 * Like `authenticate`, but also allows requests with the X-Guest-Mode: true header.
 * Used for public read-only routes (GET quizzes, notes, leaderboard) so guest users
 * can browse content without a JWT.
 * Attaches req.user = { role: 'guest' } for downstream middleware.
 */
const authenticateOrGuest = async (req, res, next) => {
    const isReadOnlyMethod = req.method === 'GET' || req.method === 'HEAD';
    if (isReadOnlyMethod && req.headers['x-guest-mode'] === 'true') {
        req.user = { role: 'guest', id: null, email: null, isGuest: true };
        return next();
    }
    return authenticate(req, res, next);
};

module.exports = {
    authenticate,
    authenticateOrGuest,
    requireAdmin,
    generateToken,
    setTokenCookie,
    clearTokenCookie,
    setCsrfCookie,
    clearCsrfCookie,
    verifyCsrf,
    COOKIE_OPTIONS,
    checkBruteForce,
    recordFailedAttempt,
    clearFailedAttempts
};
