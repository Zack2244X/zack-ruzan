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
    setTokenCookie,
    clearTokenCookie,
    checkBruteForce,
    recordFailedAttempt,
    clearFailedAttempts
} = require('../middleware/auth');
const { validateGoogleLogin, validateCompleteProfile, validateCreateAdmin } = require('../middleware/validators');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');

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
        if (checkBruteForce(req.ip)) {
            return res.status(429).json({ error: 'تم حظرك مؤقتاً بسبب محاولات كثيرة. انتظر 30 دقيقة.' });
        }

        const { idToken } = req.body;

        let googleData;
        try {
            googleData = await verifyGoogleToken(idToken);
        } catch (err) {
            recordFailedAttempt(req.ip);
            return res.status(401).json({ error: 'توكن Google غير صالح أو منتهي.' });
        }

        clearFailedAttempts(req.ip);

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
            await user.save();

            const token = generateToken(user.id, user.role, user.tokenVersion);
            setTokenCookie(res, token);
            logger.info(`تسجيل دخول — ${user.role === 'admin' ? '👑 أدمن' : '👤 طالب'}: ${user.email}`);

            return res.json({
                message: `مرحباً بك مجدداً يا ${user.fname || 'صديقنا'}!`,
                isNew: false,
                isProfileComplete: user.isProfileComplete,
                token,
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

        const token = generateToken(user.id, user.role, user.tokenVersion);
        setTokenCookie(res, token);

        res.status(201).json({
            message: 'تم التسجيل بنجاح! يرجى إكمال اسمك.',
            isNew: true,
            isProfileComplete: false,
            token,
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
            debug: mysqlMsg || error.message || 'unknown error'
        });
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
            return res.json({
                message: 'تم ترقية الحساب لمعلم بنجاح!',
                token,
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

        res.status(201).json({
            message: 'تم إنشاء حساب المعلم بنجاح!',
            token,
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
        res.json({ token: newToken });
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
        logger.info(`🚪 تسجيل خروج وإلغاء كل التوكنات — ${user.email}`);
        res.json({ message: 'تم تسجيل الخروج بنجاح.' });
    } catch (error) {
        logger.error('خطأ في تسجيل الخروج:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الخروج.' });
    }
});

module.exports = router;
