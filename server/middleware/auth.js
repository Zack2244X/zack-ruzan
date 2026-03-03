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
//   سجل محاولات الدخول الفاشلة (في الذاكرة)
// ============================================
/**
 * In-memory map tracking failed login attempts per IP address.
 * @type {Map<string, {count: number, lastAttempt: number}>}
 */
const failedAttempts = new Map();

/**
 * Maximum failed login attempts before lockout.
 * @type {number}
 * @constant
 */
const MAX_FAILED = 5;

/**
 * Lockout duration in milliseconds (30 minutes).
 * @type {number}
 * @constant
 */
const LOCKOUT_TIME = 30 * 60 * 1000;

/**
 * Checks whether the given IP address is currently locked out due to too many failed login attempts.
 * Automatically clears expired lockout records.
 * @param {string} ip - The client IP address to check.
 * @returns {boolean} `true` if the IP is locked out, `false` otherwise.
 */
function checkBruteForce(ip) {
    const record = failedAttempts.get(ip);
    if (!record) return false;
    if (Date.now() - record.lastAttempt > LOCKOUT_TIME) {
        failedAttempts.delete(ip);
        return false;
    }
    return record.count >= MAX_FAILED;
}

/**
 * Records a failed login attempt for the given IP address.
 * @param {string} ip - The client IP address.
 * @returns {void}
 */
function recordFailedAttempt(ip) {
    const record = failedAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    record.count++;
    record.lastAttempt = Date.now();
    failedAttempts.set(ip, record);
}

/**
 * Clears all recorded failed login attempts for the given IP address.
 * Should be called after a successful login.
 * @param {string} ip - The client IP address.
 * @returns {void}
 */
function clearFailedAttempts(ip) {
    failedAttempts.delete(ip);
}

// تنظيف سجلات محاولات الدخول الفاشلة القديمة كل 10 دقائق
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of failedAttempts) {
        if (now - record.lastAttempt > LOCKOUT_TIME) {
            failedAttempts.delete(ip);
        }
    }
}, 10 * 60 * 1000);
// Allow Jest to exit cleanly
if (typeof cleanupInterval.unref === 'function') cleanupInterval.unref();

// ============================================
//   1. التحقق من تسجيل الدخول (أي مستخدم)
// ============================================
/**
 * Express middleware that verifies the JWT from the Authorization header,
 * looks up the user in the database, validates role and tokenVersion, and
 * attaches the user object to `req.user`.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 * @throws {401} If the token is missing, invalid, expired, or the user is not found.
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
        }

        const token = authHeader.split(' ')[1];

        if (token.length > 2048) {
            return res.status(401).json({ error: 'توكن غير صالح.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.userId || !decoded.role) {
            return res.status(401).json({ error: 'توكن غير صالح.' });
        }

        // Sequelize: findByPk بدل findById
        const user = await User.findByPk(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'المستخدم غير موجود.' });
        }

        // حماية: التحقق من تطابق الـ role
        if (decoded.role !== user.role) {
            logger.warn(`⚠️ محاولة تلاعب بالتوكن — IP: ${req.ip}, User: ${user.email}, Token role: ${decoded.role}, DB role: ${user.role}`);
            return res.status(401).json({ error: 'توكن غير صالح. سجل دخولك مرة أخرى.' });
        }

        // حماية: التحقق من tokenVersion (إلغاء التوكنات القديمة)
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
 * @returns {string} A signed JWT string.
 */
const generateToken = (userId, role, tokenVersion = 0) => {
    return jwt.sign(
        {
            userId,
            role,
            tokenVersion,
            iat: Math.floor(Date.now() / 1000),
            jti: crypto.randomBytes(8).toString('hex')
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

module.exports = {
    authenticate,
    requireAdmin,
    generateToken,
    checkBruteForce,
    recordFailedAttempt,
    clearFailedAttempts
};
