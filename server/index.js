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
const rateLimit = require('express-rate-limit');
const path = require('path');

// --- Sequelize + Models ---
const sequelize = require('./models/index');
const User = require('./models/User');
const Quiz = require('./models/Quiz');
const Score = require('./models/Score');
const Note = require('./models/Note');

// --- العلاقات (Associations) ---
Quiz.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Score.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Score.belongsTo(Quiz, { as: 'quiz', foreignKey: 'quizId' });
Note.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
User.hasMany(Score, { foreignKey: 'userId' });
Quiz.hasMany(Score, { foreignKey: 'quizId' });

// --- استيراد المسارات (Routes) ---
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quizzes');
const scoreRoutes = require('./routes/scores');
const noteRoutes = require('./routes/notes');

const app = express();

// ============================================
//         طبقات الأمان (Security Layers)
// ============================================

// 1. Helmet — هيدرز أمان تلقائية
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// 2. CORS — تحديد المصادر المسموحة
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
    : ['http://localhost:3000'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('غير مسموح بالوصول من هذا المصدر.'));
        }
    },
    credentials: true
}));

// 3. منع HTTP Parameter Pollution
app.use(hpp());

// 4. تحويل بيانات الطلبات لـ JSON مع حد آمن
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// 5. تقديم ملف HTML الخاص بالعميل (الواجهة)
app.use(express.static(path.join(__dirname, '../client')));

// 6. إخفاء معلومات السيرفر
app.disable('x-powered-by');

// ============================================
//         Rate Limiting — 3 مستويات
// ============================================

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'تم تجاوز عدد الطلبات المسموحة، حاول بعد قليل.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'محاولات دخول كثيرة، حاول بعد 15 دقيقة.' },
    skipSuccessfulRequests: true
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'تم تجاوز عدد طلبات الإدارة، حاول بعد قليل.' }
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);

// ============================================
//              ربط المسارات
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/notes', noteRoutes);

// --- مسار الصفحة الرئيسية ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// --- التعامل مع المسارات غير الموجودة ---
app.use((req, res) => {
    res.status(404).json({ error: 'المسار المطلوب غير موجود.' });
});

// --- التعامل مع الأخطاء العامة ---
app.use((err, req, res, next) => {
    console.error('❌ خطأ في السيرفر:', err.stack);
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

async function startServer() {
    try {
        // اختبار الاتصال
        await sequelize.authenticate();
        console.log('✅ تم الاتصال بقاعدة البيانات TiDB بنجاح.');

        // إنشاء الجداول تلقائياً (لو مش موجودة)
        await sequelize.sync({ alter: false });
        console.log('✅ تم مزامنة الجداول.');

        app.listen(PORT, () => {
            console.log(`🚀 السيرفر شغال على: http://localhost:${PORT}`);
            console.log(`📁 الواجهة متاحة على: http://localhost:${PORT}/`);
        });
    } catch (err) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message, err.stack);
        process.exit(1);
    }
}

startServer();
