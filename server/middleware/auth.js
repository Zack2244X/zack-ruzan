// ============================================
//   Middleware التوثيق والصلاحيات — محصّن
//   — Sequelize + TiDB —
// ============================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me-in-production';

// ============================================
//   سجل محاولات الدخول الفاشلة (في الذاكرة)
// ============================================
const failedAttempts = new Map();
const MAX_FAILED = 5;
const LOCKOUT_TIME = 30 * 60 * 1000;

function checkBruteForce(ip) {
    const record = failedAttempts.get(ip);
    if (!record) return false;
    if (Date.now() - record.lastAttempt > LOCKOUT_TIME) {
        failedAttempts.delete(ip);
        return false;
    }
    return record.count >= MAX_FAILED;
}

function recordFailedAttempt(ip) {
    const record = failedAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    record.count++;
    record.lastAttempt = Date.now();
    failedAttempts.set(ip, record);
}

function clearFailedAttempts(ip) {
    failedAttempts.delete(ip);
}

// ============================================
//   1. التحقق من تسجيل الدخول (أي مستخدم)
// ============================================
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
            console.warn(`⚠️ محاولة تلاعب بالتوكن — IP: ${req.ip}, User: ${user.email}, Token role: ${decoded.role}, DB role: ${user.role}`);
            return res.status(401).json({ error: 'توكن غير صالح. سجل دخولك مرة أخرى.' });
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
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        console.warn(`🚨 محاولة وصول غير مصرح للأدمن — IP: ${req.ip}, User: ${req.user ? req.user.email : 'unknown'}, Path: ${req.originalUrl}`);
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول. هذا الإجراء للمعلم فقط.' });
    }
    console.log(`👑 عملية أدمن — ${req.method} ${req.originalUrl} — بواسطة: ${req.user.email}`);
    next();
};

// ============================================
//   3. إنشاء توكن JWT
// ============================================
const generateToken = (userId, role) => {
    return jwt.sign(
        {
            userId,
            role,
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
