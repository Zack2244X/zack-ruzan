/**
 * @file Authentication routes — Google OAuth
 * @description Express router handling Google OAuth login/registration, profile completion,
 *   admin creation/promotion, token refresh, and logout with token revocation.
 * @module routes/auth
 */

// ============================================
//   مسارات التوثيق — Google OAuth
//   — Sequelize + TiDB —
// ============================================
const router = require('express').Router();
const { OAuth2Client } = require('google-auth-library');
const { UniqueConstraintError } = require('sequelize');
const User = require('../models/User');
const {
    generateToken,
    authenticate,
    requireAdmin,
    setTokenCookie,
    clearTokenCookie,
    setCsrfCookie,
    clearCsrfCookie,
    checkBruteForce,
    recordFailedAttempt,
    clearFailedAttempts
} = require('../middleware/auth');
const { validateGoogleLogin, validateCompleteProfile, validateCreateAdmin } = require('../middleware/validators');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const sequelize = require('../models');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Strict rate limiter for admin creation endpoint — 3 attempts per hour.
 * @type {import('express').RequestHandler}
 */
const createAdminLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'محاولات كثيرة لإنشاء أدمن. حاول بعد ساعة.' }
});

/**
 * Pre-approved admin email addresses loaded from the ADMIN_EMAILS environment variable.
 * @type {string[]}
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

/**
 * Checks whether request Origin/Referer belongs to trusted frontend origins.
 * Used to harden first-step auth flows that are exempt from CSRF.
 */
function isTrustedRequestOrigin(req) {
    const allowed = new Set(
        (process.env.ALLOWED_ORIGINS || '')
            .split(',')
            .map(o => o.trim())
            .filter(Boolean)
    );

    // Reasonable defaults for local/dev runs.
    allowed.add('http://localhost:3000');
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:3000');
    allowed.add('http://127.0.0.1:5173');

    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        allowed.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }

    const host = req.get('host');
    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto || req.protocol || 'https';
    const sameOrigin = host ? `${protocol}://${host}` : null;

    const origin = req.get('origin');
    if (origin) {
        if (sameOrigin && origin === sameOrigin) return true;
        return allowed.has(origin);
    }

    const referer = req.get('referer');
    if (!referer) {
        const fetchSite = (req.get('sec-fetch-site') || '').toLowerCase();
        if (fetchSite === 'same-origin' || fetchSite === 'same-site') return true;
        return process.env.NODE_ENV !== 'production';
    }

    try {
        const refOrigin = new URL(referer).origin;
        if (sameOrigin && refOrigin === sameOrigin) return true;
        return allowed.has(refOrigin);
    } catch {
        return false;
    }
}

/**
 * Splits a full name string into first name and last name.
 * @param {string} [fullName=''] - The full name to split.
 * @returns {{ fname: string, lname: string }} Object with `fname` and `lname` properties (max 50 chars each).
 */
function splitName(fullName = '') {
    const clean = (fullName || '').trim();
    if (!clean) return { fname: '', lname: '' };
    const parts = clean.split(/\s+/);
    const fname = parts.shift() || '';
    const lname = parts.join(' ') || '';
    return {
        fname: fname.substring(0, 50),
        lname: lname.substring(0, 50)
    };
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim().substring(0, 64);
    }
    return (req.ip || '').toString().substring(0, 64);
}

function inferDeviceName(ua = '') {
    const u = String(ua || '').toLowerCase();
    if (!u) return 'Unknown Device';
    if (u.includes('iphone')) return 'iPhone';
    if (u.includes('ipad')) return 'iPad';
    if (u.includes('android')) return 'Android Phone';
    if (u.includes('windows')) return 'Windows PC';
    if (u.includes('mac os') || u.includes('macintosh')) return 'Mac';
    if (u.includes('linux')) return 'Linux';
    return 'Unknown Device';
}

function sanitizeText(value, maxLen = 255) {
    if (!value) return '';
    return String(value).trim().substring(0, maxLen);
}

async function recordAccountSession({ userId = null, email = '', deviceId = '', loginType = 'google', ipAddress = '', macAddress = '', deviceName = '', userAgent = '' }) {
    try {
        await sequelize.query(
            `INSERT INTO account_sessions
                (userId, email, deviceId, loginType, ipAddress, macAddress, deviceName, userAgent, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            {
                replacements: [
                    userId,
                    sanitizeText(email.toLowerCase(), 255) || null,
                    sanitizeText(deviceId, 120),
                    sanitizeText(loginType, 30),
                    sanitizeText(ipAddress, 64),
                    sanitizeText(macAddress, 64),
                    sanitizeText(deviceName, 120),
                    sanitizeText(userAgent, 500)
                ]
            }
        );
    } catch (err) {
        logger.warn('⚠️ تعذر تسجيل account session audit:', { error: err.message });
    }
}

// ============================================
//   دالة مساعدة: التحقق من توكن Google
// ============================================
/**
 * Verifies a Google OAuth ID token and extracts user information.
 * @async
 * @param {string} idToken - The Google ID token to verify.
 * @returns {Promise<{googleId: string, email: string, name: string, avatar: string}>}
 *   The extracted user data from the Google token payload.
 * @throws {Error} If the token is invalid or verification fails.
 */
async function verifyGoogleToken(idToken) {
    const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || '',
        avatar: payload.picture || ''
    };
}

// ============================================
//   POST /api/auth/google — تسجيل/دخول بالجيميل
// ============================================
/**
 * @route POST /api/auth/google
 * @description Handles Google OAuth login and registration.
 *   - Checks for brute-force lockout.
 *   - Verifies the Google ID token.
 *   - Creates a new user or logs in an existing one.
 *   - Auto-assigns admin role if the email is in ADMIN_EMAILS.
 * @access Public
 * @param {import('express').Request} req - Express request with `idToken` in body.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.post('/google', validateGoogleLogin, async (req, res) => {
    try {
        if (!isTrustedRequestOrigin(req)) {
            logger.warn('🚫 Blocked /api/auth/google due to untrusted origin', {
                origin: req.get('origin') || null,
                referer: req.get('referer') || null,
                ip: req.ip
            });
            return res.status(403).json({ error: 'مصدر الطلب غير موثوق.' });
        }

        if (await checkBruteForce(req.ip)) {
            return res.status(429).json({ error: 'تم حظرك مؤقتاً بسبب محاولات كثيرة. انتظر 30 دقيقة.' });
        }

        const { idToken } = req.body;

        let googleData;
        try {
            googleData = await verifyGoogleToken(idToken);
        } catch (err) {
            await recordFailedAttempt(req.ip);
            return res.status(401).json({ error: 'توكن Google غير صالح أو منتهي.' });
        }

        await clearFailedAttempts(req.ip);

        const userAgent = req.get('user-agent') || '';
        const ipAddress = getClientIp(req);
        const deviceId = sanitizeText(req.body?.deviceId || req.get('x-device-id'), 120);
        const deviceName = sanitizeText(req.body?.deviceName, 120) || inferDeviceName(userAgent);
        const macAddress = sanitizeText(req.body?.macAddress || req.get('x-device-mac'), 64);

        // البحث عن المستخدم بالإيميل
        let user = await User.findOne({ where: { email: googleData.email } });

        if (user) {
            // === مستخدم موجود → تسجيل دخول ===
            if ((!user.fname || !user.lname) && googleData.name) {
                const { fname, lname } = splitName(googleData.name);
                if (fname) user.fname = fname;
                if (lname) user.lname = lname;
            }
            if (googleData.avatar && user.avatar !== googleData.avatar) {
                user.avatar = googleData.avatar;
            }
            // مزامنة الدور مع ADMIN_EMAILS عند كل تسجيل دخول
            const shouldBeAdmin = ADMIN_EMAILS.includes(googleData.email.toLowerCase());
            const correctRole = shouldBeAdmin ? 'admin' : 'student';
            if (user.role !== correctRole) {
                logger.info(`🔄 تحديث دور المستخدم: ${user.email} من ${user.role} إلى ${correctRole}`);
                user.role = correctRole;
                user.tokenVersion = (user.tokenVersion || 0) + 1; // إلغاء الجلسات القديمة
            }
            await user.save();

            await recordAccountSession({
                userId: user.id,
                email: user.email,
                deviceId,
                loginType: 'google',
                ipAddress,
                macAddress,
                deviceName,
                userAgent
            });

            const token = generateToken(user.id, user.role, user.tokenVersion);
            setTokenCookie(res, token);
            setCsrfCookie(res);
            logger.info(`تسجيل دخول — ${user.role === 'admin' ? '👑 أدمن' : '👤 طالب'}: ${user.email}`);

            return res.json({
                message: `مرحباً بك مجدداً يا ${user.fname || 'صديقنا'}!`,
                isNew: false,
                isProfileComplete: user.isProfileComplete,
                user: {
                    id: user.id,
                    fname: user.fname,
                    lname: user.lname,
                    fullName: user.fname && user.lname ? `${user.fname} ${user.lname}` : '',
                    avatar: user.avatar,
                    role: user.role,
                    email: user.email
                }
            });
        }

        // === مستخدم جديد → إنشاء حساب ===
        const isAdminEmail = ADMIN_EMAILS.includes(googleData.email.toLowerCase());
        const { fname, lname } = splitName(googleData.name);

        user = await User.create({
            email: googleData.email,
            googleId: googleData.googleId,
            avatar: googleData.avatar,
            fname: fname || '',
            lname: lname || '',
            isProfileComplete: false,
            role: isAdminEmail ? 'admin' : 'student'
        });

        logger.info(`🆕 تسجيل جديد — ${isAdminEmail ? '👑 أدمن' : '👤 طالب'}: ${googleData.email}`);

        await recordAccountSession({
            userId: user.id,
            email: user.email,
            deviceId,
            loginType: 'google',
            ipAddress,
            macAddress,
            deviceName,
            userAgent
        });

        const token = generateToken(user.id, user.role, user.tokenVersion);
        setTokenCookie(res, token);
        setCsrfCookie(res);

        res.status(201).json({
            message: 'تم التسجيل بنجاح! يرجى إكمال اسمك.',
            isNew: true,
            isProfileComplete: false,
            user: {
                id: user.id,
                fname: user.fname,
                lname: user.lname,
                fullName: user.fname && user.lname ? `${user.fname} ${user.lname}` : user.email,
                avatar: user.avatar,
                role: user.role,
                email: user.email
            }
        });
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.status(409).json({ error: 'هذا الحساب مسجل بالفعل.' });
        }
        const mysqlMsg = error.original?.message || error.parent?.message || '';
        const mysqlCode = error.original?.code || error.parent?.code || '';
        const sqlQuery  = error.sql || '';
        logger.error('خطأ في تسجيل Google:', {
            message: error.message,
            mysqlMsg,
            mysqlCode,
            sql: sqlQuery,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'حدث خطأ أثناء التسجيل بالجيميل.',
            ...(process.env.NODE_ENV !== 'production' && { debug: mysqlMsg || error.message })
        });
    }
});

// ============================================
//   POST /api/auth/guest-session — تسجيل دخول ضيف
// ============================================
router.post('/guest-session', async (req, res) => {
    try {
        const userAgent = req.get('user-agent') || '';
        const ipAddress = getClientIp(req);
        const deviceId = sanitizeText(req.body?.deviceId || req.get('x-device-id'), 120);
        const deviceName = sanitizeText(req.body?.deviceName, 120) || inferDeviceName(userAgent);
        const macAddress = sanitizeText(req.body?.macAddress || req.get('x-device-mac'), 64);

        await recordAccountSession({
            userId: null,
            email: '',
            deviceId,
            loginType: 'guest',
            ipAddress,
            macAddress,
            deviceName,
            userAgent
        });

        return res.status(201).json({ ok: true });
    } catch (error) {
        logger.error('خطأ في تسجيل guest-session:', { error: error.message });
        return res.status(500).json({ error: 'تعذر تسجيل جلسة الضيف.' });
    }
});

// ============================================
//   GET /api/auth/accounts-overview — لوحة إدارة الحسابات
// ============================================
router.get('/accounts-overview', authenticate, requireAdmin, async (req, res) => {
    try {
                const [accountSessionTableRows] = await sequelize.query(
                        `SELECT 1
                         FROM INFORMATION_SCHEMA.TABLES
                         WHERE TABLE_SCHEMA = DATABASE()
                             AND TABLE_NAME = 'account_sessions'
                         LIMIT 1`
                );
                const hasAccountSessionsTable = Array.isArray(accountSessionTableRows) && accountSessionTableRows.length > 0;

                let sessionColumns = new Set();
                if (hasAccountSessionsTable) {
                        const [columnsRows] = await sequelize.query(
                                `SELECT COLUMN_NAME
                                 FROM INFORMATION_SCHEMA.COLUMNS
                                 WHERE TABLE_SCHEMA = DATABASE()
                                     AND TABLE_NAME = 'account_sessions'`
                        );
                        sessionColumns = new Set((columnsRows || []).map((r) => r.COLUMN_NAME));
                }

                const hasEmailCol = sessionColumns.has('email');
                const hasDeviceIdCol = sessionColumns.has('deviceId');
                const hasMacCol = sessionColumns.has('macAddress');
                const hasDeviceNameCol = sessionColumns.has('deviceName');
                const hasIpCol = sessionColumns.has('ipAddress');
                const hasLoginTypeCol = sessionColumns.has('loginType');
                const hasCreatedAtCol = sessionColumns.has('createdAt');

                let accounts = [];
                let guestSessions = [];

                if (hasAccountSessionsTable && hasLoginTypeCol && hasCreatedAtCol && hasIpCol) {
                        const emailJoinClause = hasEmailCol
                                ? `(s2.userId = u.id OR (s2.email IS NOT NULL AND s2.email = u.email))`
                                : `(s2.userId = u.id)`;

                        const [accountsRows] = await sequelize.query(
                                `SELECT
                                        u.id,
                                        u.fname,
                                        u.lname,
                                        u.email,
                                        u.role,
                                        u.createdAt,
                                        s.ipAddress,
                                        ${hasDeviceIdCol ? 's.deviceId' : "'' AS deviceId"},
                                        ${hasMacCol ? 's.macAddress' : "'' AS macAddress"},
                                        ${hasDeviceNameCol ? 's.deviceName' : "'' AS deviceName"},
                                        s.loginType,
                                        s.createdAt AS lastSeenAt
                                 FROM users u
                                 LEFT JOIN account_sessions s
                                     ON s.id = (
                                                SELECT s2.id
                                                FROM account_sessions s2
                                                WHERE ${emailJoinClause}
                                                    AND s2.loginType <> 'guest'
                                                ORDER BY s2.id DESC
                                                LIMIT 1
                                     )
                                 WHERE u.deletedAt IS NULL
                                 ORDER BY u.createdAt DESC`
                        );
                        accounts = accountsRows || [];

                        const [guestRows] = await sequelize.query(
                                `SELECT
                                        id,
                                        ipAddress,
                                        ${hasDeviceIdCol ? 'deviceId' : "'' AS deviceId"},
                                        ${hasMacCol ? 'macAddress' : "'' AS macAddress"},
                                        ${hasDeviceNameCol ? 'deviceName' : "'' AS deviceName"},
                                        createdAt AS lastSeenAt
                                 FROM account_sessions
                                 WHERE loginType = 'guest'
                                 ORDER BY id DESC
                                 LIMIT 200`
                        );
                        guestSessions = guestRows || [];
                } else {
                        const [accountsOnlyRows] = await sequelize.query(
                                `SELECT id, fname, lname, email, role, createdAt
                                 FROM users
                                 WHERE deletedAt IS NULL
                                 ORDER BY createdAt DESC`
                        );
                        accounts = (accountsOnlyRows || []).map((u) => ({
                                ...u,
                                ipAddress: '',
                                deviceId: '',
                                macAddress: '',
                                deviceName: '',
                                loginType: 'google',
                                lastSeenAt: null
                        }));
                        guestSessions = [];
                }

        return res.json({
            accounts: (accounts || []).map((a) => ({
                id: a.id,
                type: 'account',
                fullName: `${a.fname || ''} ${a.lname || ''}`.trim() || a.email,
                email: a.email,
                role: a.role,
                ipAddress: a.ipAddress || '',
                deviceId: a.deviceId || '',
                macAddress: a.macAddress || '',
                deviceName: a.deviceName || '',
                loginType: a.loginType || 'google',
                createdAt: a.createdAt,
                lastSeenAt: a.lastSeenAt || null
            })),
            guests: (guestSessions || []).map((g) => ({
                id: g.id,
                type: 'guest',
                fullName: 'ضيف (بدون حساب)',
                email: '',
                role: 'guest',
                ipAddress: g.ipAddress || '',
                deviceId: g.deviceId || '',
                macAddress: g.macAddress || '',
                deviceName: g.deviceName || '',
                loginType: 'guest',
                createdAt: g.lastSeenAt,
                lastSeenAt: g.lastSeenAt
            }))
        });
    } catch (error) {
        logger.error('خطأ في جلب accounts-overview:', { error: error.message });
        return res.status(500).json({ error: 'تعذر جلب بيانات الحسابات.' });
    }
});

router.delete('/accounts/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
            return res.status(400).json({ error: 'معرّف الحساب غير صالح.' });
        }

        if (req.user.id === targetId) {
            return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي.' });
        }

        const targetUser = await User.findByPk(targetId);
        if (!targetUser) {
            return res.status(404).json({ error: 'الحساب غير موجود.' });
        }

        await targetUser.destroy();
        logger.info(`🗑️ تم حذف حساب بواسطة الأدمن: ${targetUser.email} بواسطة ${req.user.email}`);
        return res.json({ ok: true, message: 'تم حذف الحساب بنجاح.' });
    } catch (error) {
        logger.error('خطأ في حذف الحساب:', { error: error.message });
        return res.status(500).json({ error: 'تعذر حذف الحساب.' });
    }
});

router.post('/blocked-devices', authenticate, requireAdmin, async (req, res) => {
    try {
        const deviceId = sanitizeText(req.body?.deviceId, 120);
        const ipAddress = sanitizeText(req.body?.ipAddress, 64);
        const deviceName = sanitizeText(req.body?.deviceName, 120);
        const reason = sanitizeText(req.body?.reason, 255) || 'تم الحظر بواسطة الإدارة';

        if (!deviceId && !ipAddress) {
            return res.status(400).json({ error: 'يجب توفير deviceId أو ipAddress للحظر.' });
        }

        await sequelize.query(
            `INSERT INTO blocked_devices
                (deviceId, ipAddress, deviceName, reason, blockedBy, isActive, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
            {
                replacements: [
                    deviceId || null,
                    ipAddress || null,
                    deviceName || null,
                    reason,
                    req.user.email || 'admin'
                ]
            }
        );

        logger.warn(`⛔ Device blocked by ${req.user.email}: deviceId=${deviceId || '-'} ip=${ipAddress || '-'}`);
        return res.status(201).json({ ok: true, message: 'تم حظر الجهاز بنجاح.' });
    } catch (error) {
        logger.error('خطأ في حظر الجهاز:', { error: error.message });
        return res.status(500).json({ error: 'تعذر حظر الجهاز.' });
    }
});

router.get('/blocked-devices', authenticate, requireAdmin, async (req, res) => {
    try {
        const [rows] = await sequelize.query(
            `SELECT id, deviceId, ipAddress, deviceName, reason, blockedBy, isActive, createdAt
             FROM blocked_devices
             WHERE isActive = 1
             ORDER BY id DESC`
        );
        return res.json({ devices: rows || [] });
    } catch (error) {
        logger.error('خطأ في جلب الأجهزة المحظورة:', { error: error.message });
        return res.status(500).json({ error: 'تعذر جلب قائمة الأجهزة المحظورة.' });
    }
});

router.delete('/blocked-devices/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const blockId = Number(req.params.id);
        if (!Number.isInteger(blockId) || blockId <= 0) {
            return res.status(400).json({ error: 'معرّف الحظر غير صالح.' });
        }

        await sequelize.query(
            `UPDATE blocked_devices
             SET isActive = 0, updatedAt = NOW()
             WHERE id = ?`,
            { replacements: [blockId] }
        );

        return res.json({ ok: true, message: 'تم فك الحظر بنجاح.' });
    } catch (error) {
        logger.error('خطأ في فك الحظر:', { error: error.message });
        return res.status(500).json({ error: 'تعذر فك حظر الجهاز.' });
    }
});

// ============================================
//   PUT /api/auth/complete-profile — إكمال الاسم
// ============================================
/**
 * @route PUT /api/auth/complete-profile
 * @description Allows an authenticated user to set their first and last name, marking their profile as complete.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with `fname` and `lname` in body.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.put('/complete-profile', authenticate, validateCompleteProfile, async (req, res) => {
    try {
        const { fname, lname } = req.body;

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود.' });
        }

        user.fname = fname.trim().substring(0, 50);
        user.lname = lname.trim().substring(0, 50);
        user.isProfileComplete = true;
        await user.save();

        res.json({
            message: `أهلاً بك يا ${user.fname}! تم حفظ اسمك بنجاح.`,
            user: {
                id: user.id,
                fname: user.fname,
                lname: user.lname,
                fullName: `${user.fname} ${user.lname}`,
                avatar: user.avatar,
                role: user.role
            }
        });
    } catch (error) {
        logger.error('خطأ في إكمال البروفايل:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء حفظ الاسم.' });
    }
});

// ============================================
//   GET /api/auth/me — جلب بيانات المستخدم الحالي
// ============================================
/**
 * @route GET /api/auth/me
 * @description Returns the currently authenticated user's profile data.
 *   Admin users receive their email in the response; students do not.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with `req.user` set by authenticate.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
router.get('/me', authenticate, (req, res) => {
    const userData = {
        id: req.user.id,
        fname: req.user.fname,
        lname: req.user.lname,
        fullName: req.user.fname && req.user.lname ? `${req.user.fname} ${req.user.lname}` : '',
        avatar: req.user.avatar,
        role: req.user.role,
        isProfileComplete: req.user.isProfileComplete
    };

    if (req.user.role === 'admin') {
        userData.email = req.user.email;
    }

    res.json({ user: userData });
});

// ============================================
//   GET /api/auth/verify-admin
// ============================================
/**
 * @route GET /api/auth/verify-admin
 * @description Verifies whether the authenticated user has admin privileges.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with `{ isAdmin: boolean }`.
 * @returns {void}
 */
router.get('/verify-admin', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        logger.warn(`🚨 محاولة وصول لصلاحيات الأدمن — بواسطة: ${req.user.email}, IP: ${req.ip}`);
        return res.status(403).json({
            isAdmin: false,
            error: 'ليس لديك صلاحيات الإدارة. تواصل مع المعلم.'
        });
    }

    res.json({
        isAdmin: true,
        message: `مرحباً أستاذ ${req.user.fname}! صلاحيات الإدارة مفعّلة.`
    });
});

// ============================================
//   POST /api/auth/create-admin — إنشاء/ترقية أدمن
// ============================================
/**
 * @route POST /api/auth/create-admin
 * @description Creates a new admin account or promotes an existing user to admin.
 *   Requires the correct `ADMIN_CREATE_SECRET` in the request body.
 * @access Public (protected by secret).
 * @param {import('express').Request} req - Express request with `email`, `fname`, `lname`, `adminSecret` in body.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.post('/create-admin', createAdminLimiter, validateCreateAdmin, async (req, res) => {
    try {
        const { email, fname, lname, adminSecret } = req.body;

        const expectedSecret = process.env.ADMIN_CREATE_SECRET;
        if (!expectedSecret) {
            return res.status(503).json({ error: 'لم يتم تكوين مفتاح إنشاء الأدمن على السيرفر.' });
        }
        if (adminSecret !== expectedSecret) {
            logger.warn(`🚨 محاولة إنشاء أدمن بكلمة سر خاطئة — IP: ${req.ip}`);
            recordFailedAttempt(req.ip);
            return res.status(403).json({ error: 'كلمة السر السرية غير صحيحة.' });
        }

        const existing = await User.findOne({ where: { email: email.toLowerCase() } });
        if (existing) {
            existing.role = 'admin';
            existing.fname = fname.trim();
            existing.lname = lname.trim();
            existing.isProfileComplete = true;
            await existing.save();

            logger.info(`👑 تم ترقية ${email} إلى أدمن`);

            const token = generateToken(existing.id, existing.role, existing.tokenVersion);
            setTokenCookie(res, token);
            setCsrfCookie(res);
            return res.json({
                message: 'تم ترقية الحساب لمعلم بنجاح!',
                user: {
                    id: existing.id,
                    email: existing.email,
                    fname: existing.fname,
                    lname: existing.lname,
                    fullName: `${existing.fname} ${existing.lname}`,
                    role: existing.role
                }
            });
        }

        const user = await User.create({
            email: email.toLowerCase().trim(),
            fname: fname.trim(),
            lname: lname.trim(),
            isProfileComplete: true,
            role: 'admin'
        });

        logger.info(`👑 تم إنشاء حساب أدمن جديد: ${email}`);

        const token = generateToken(user.id, user.role, user.tokenVersion);
        setTokenCookie(res, token);
        setCsrfCookie(res);

        res.status(201).json({
            message: 'تم إنشاء حساب المعلم بنجاح!',
            user: {
                id: user.id,
                email: user.email,
                fname: user.fname,
                lname: user.lname,
                fullName: `${user.fname} ${user.lname}`,
                role: user.role
            }
        });
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.status(409).json({ error: 'هذا البريد مسجل بالفعل.' });
        }
        logger.error('خطأ في إنشاء الأدمن:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء إنشاء حساب المعلم.' });
    }
});

// ============================================
//   POST /api/auth/refresh — تجديد التوكن
/**
 * @route POST /api/auth/refresh
 * @description Refreshes the JWT for the authenticated user.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with `{ token: string }`.
 * @returns {Promise<void>}
 */
router.post('/refresh', authenticate, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(401).json({ error: 'المستخدم غير موجود.' });
        }
        const newToken = generateToken(user.id, user.role, user.tokenVersion);
        setTokenCookie(res, newToken);
        logger.info(`🔄 تجديد توكن — ${user.email}`);
        res.json({ message: 'تم تجديد الجلسة.' });
    } catch (error) {
        logger.error('خطأ في تجديد التوكن:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء تجديد الجلسة.' });
    }
});

// ============================================
//   POST /api/auth/logout — تسجيل الخروج (إلغاء كل التوكنات)
// ============================================
/**
 * @route POST /api/auth/logout
 * @description Logs the user out by incrementing their `tokenVersion`, effectively
 *   invalidating all previously issued JWTs.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.post('/logout', authenticate, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(401).json({ error: 'المستخدم غير موجود.' });
        }
        // زيادة tokenVersion لإلغاء كل التوكنات السابقة
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        clearTokenCookie(res);
        clearCsrfCookie(res);
        logger.info(`🚪 تسجيل خروج وإلغاء كل التوكنات — ${user.email}`);
        res.json({ message: 'تم تسجيل الخروج بنجاح.' });
    } catch (error) {
        logger.error('خطأ في تسجيل الخروج:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الخروج.' });
    }
});

module.exports = router;
