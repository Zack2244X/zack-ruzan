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
    checkBruteForce,
    recordFailedAttempt,
    clearFailedAttempts
} = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- قائمة إيميلات الأدمن المعتمدة ---
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

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
router.post('/google', async (req, res) => {
    try {
        if (checkBruteForce(req.ip)) {
            return res.status(429).json({ error: 'تم حظرك مؤقتاً بسبب محاولات كثيرة. انتظر 30 دقيقة.' });
        }

        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: 'توكن Google مطلوب.' });
        }

        if (typeof idToken !== 'string' || idToken.length > 4096) {
            recordFailedAttempt(req.ip);
            return res.status(400).json({ error: 'بيانات غير صالحة.' });
        }

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

            const token = generateToken(user.id, user.role);

            console.log(`✅ دخول ناجح — ${user.role === 'admin' ? '👑 أدمن' : '👤 طالب'}: ${user.email}`);

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

        console.log(`🆕 تسجيل جديد — ${isAdminEmail ? '👑 أدمن' : '👤 طالب'}: ${googleData.email}`);

        const token = generateToken(user.id, user.role);

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
        console.error('خطأ في تسجيل Google:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء التسجيل بالجيميل.' });
    }
});

// ============================================
//   PUT /api/auth/complete-profile — إكمال الاسم
// ============================================
router.put('/complete-profile', authenticate, async (req, res) => {
    try {
        const { fname, lname } = req.body;

        if (!fname || !lname) {
            return res.status(400).json({ error: 'الاسم الأول والثاني مطلوبان.' });
        }

        const cleanFname = fname.trim().replace(/<[^>]*>/g, '').substring(0, 50);
        const cleanLname = lname.trim().replace(/<[^>]*>/g, '').substring(0, 50);

        if (cleanFname.length < 2 || cleanLname.length < 2) {
            return res.status(400).json({ error: 'كل اسم يجب أن يكون حرفين على الأقل.' });
        }

        const nameRegex = /^[\u0600-\u06FFa-zA-Z\s]+$/;
        if (!nameRegex.test(cleanFname) || !nameRegex.test(cleanLname)) {
            return res.status(400).json({ error: 'الاسم يجب أن يحتوي على حروف فقط (عربي أو إنجليزي).' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود.' });
        }

        user.fname = cleanFname;
        user.lname = cleanLname;
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
        console.error('خطأ في إكمال البروفايل:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء حفظ الاسم.' });
    }
});

// ============================================
//   GET /api/auth/me — جلب بيانات المستخدم الحالي
// ============================================
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
router.get('/verify-admin', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        console.warn(`🚨 محاولة وصول لصلاحيات الأدمن — بواسطة: ${req.user.email}, IP: ${req.ip}`);
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
router.post('/create-admin', async (req, res) => {
    try {
        const { email, fname, lname, adminSecret } = req.body;

        const expectedSecret = process.env.ADMIN_CREATE_SECRET || 'create-admin-secret-2024';
        if (adminSecret !== expectedSecret) {
            console.warn(`🚨 محاولة إنشاء أدمن بكلمة سر خاطئة — IP: ${req.ip}`);
            recordFailedAttempt(req.ip);
            return res.status(403).json({ error: 'كلمة السر السرية غير صحيحة.' });
        }

        if (!email || !fname || !lname) {
            return res.status(400).json({ error: 'البريد الإلكتروني والاسم مطلوبان.' });
        }

        const existing = await User.findOne({ where: { email: email.toLowerCase() } });
        if (existing) {
            existing.role = 'admin';
            existing.fname = fname.trim();
            existing.lname = lname.trim();
            existing.isProfileComplete = true;
            await existing.save();

            console.log(`👑 تم ترقية ${email} إلى أدمن`);

            const token = generateToken(existing.id, existing.role);
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

        console.log(`👑 تم إنشاء حساب أدمن جديد: ${email}`);

        const token = generateToken(user.id, user.role);

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
        console.error('خطأ في إنشاء الأدمن:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء إنشاء حساب المعلم.' });
    }
});

module.exports = router;
