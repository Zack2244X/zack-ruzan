/**
 * @file Score and results routes
 * @description Express router for quiz score submission, retrieval, leaderboard,
 *   admin statistics, and score management. Scores are graded server-side to prevent cheating.
 *   Supports unlimited retakes — first attempt is official (leaderboard), subsequent are practice only.
 * @module routes/scores
 *
 * @requires Score model — يجب إضافة الحقلَين التاليَين في migration:
 *   • isOfficial   BOOLEAN NOT NULL DEFAULT true
 *   • attemptNumber INTEGER NOT NULL DEFAULT 1
 *   وحذف أي UNIQUE CONSTRAINT على (userId, quizId) إن وُجد.
 */

// ============================================
//   مسارات الدرجات والنتائج
//   — Sequelize + TiDB —
// ============================================
const router = require('express').Router();
const { Op } = require('sequelize');
const sequelize = require('../models/index');
const Score = require('../models/Score');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const { authenticate, authenticateOrGuest, requireAdmin } = require('../middleware/auth');
const { validateSubmitScore, validatePagination, validateIdParam, validateQuizIdParam } = require('../middleware/validators');
const logger = require('../utils/logger');

// ============================================
//   resolveAttemptMeta — تحديد رقم المحاولة وطبيعتها
// ============================================
/**
 * يحسب رقم المحاولة الحالية ويحدد إن كانت رسمية أم تدريبية.
 * المحاولة الأولى دائماً رسمية (isOfficial = true) وتُحتسب في لوحة الشرف.
 * المحاولات التالية تدريبية (isOfficial = false) ولا تؤثر على الترتيب.
 *
 * @param {number} userId  — معرّف المستخدم
 * @param {number} quizId  — معرّف الاختبار
 * @returns {Promise<{ attemptNumber: number, isOfficial: boolean }>}
 */
async function resolveAttemptMeta(userId, quizId) {
    const existingCount = await Score.count({ where: { userId, quizId } });
    const attemptNumber = existingCount + 1;
    return { attemptNumber, isOfficial: attemptNumber === 1 };
}

// ============================================
//   POST /api/scores — تسليم إجابات الامتحان
//   (السيرفر يحسب الدرجة لمنع الغش)
//   يقبل محاولات متعددة — الأولى رسمية، التالية تدريبية
// ============================================
/**
 * @route POST /api/scores
 * @description Submits a student's quiz answers. The server fetches the quiz, grades each
 *   answer against the stored correct options, and creates a Score record.
 *   First attempt per user per quiz is marked isOfficial = true (counts for leaderboard).
 *   Subsequent attempts are marked isOfficial = false (practice only, no leaderboard effect).
 * @access Private — requires authentication.
 * @param {import('express').Request}  req - body: { quizId, answers, timeTaken? }
 * @param {import('express').Response} res - { message, result, details, meta }
 * @returns {Promise<void>}
 */
// middleware لمعالجة الضيف قبل التحقق من التوكن
const handleGuestMode = (req, res, next) => {
    if (req.headers['x-guest-mode'] === 'true') {
        return res.status(200).json({
            message: 'تم الدخول كضيف. لن يتم حفظ أي درجات أو بيانات.',
            result: null,
            meta: { isOfficial: false, attemptNumber: 0 },
            details: []
        });
    }
    next();
};

router.post('/', handleGuestMode, authenticate, validateSubmitScore, async (req, res) => {
    try {
        const { quizId, answers, timeTaken } = req.body;

        // 1. تحديد رقم المحاولة وطبيعتها (رسمية أم تدريبية)
        const { attemptNumber, isOfficial } = await resolveAttemptMeta(req.user.id, quizId);

        // 2. جلب الامتحان
        const quiz = await Quiz.findByPk(quizId);
        if (!quiz) {
            return res.status(404).json({ error: 'الامتحان غير موجود.' });
        }

        // 3. حساب الدرجة في السيرفر (منع الغش)
        let correctCount = 0;
        const gradedAnswers = [];
        const questions = quiz.questions; // JSON array

        for (const answer of answers) {
            const question = questions.find(q => q.id === answer.questionId);
            if (!question) continue;

            const selectedOption = question.answerOptions[answer.selectedIndex];
            const isCorrect = selectedOption ? selectedOption.isCorrect : false;

            if (isCorrect) correctCount++;

            gradedAnswers.push({
                questionId:    answer.questionId,
                selectedIndex: answer.selectedIndex,
                isCorrect
            });
        }

        // 4. حفظ السجل مع تمييز الرسمية والتدريبية
        const score = await Score.create({
            userId:        req.user.id,
            quizId,
            answers:       gradedAnswers,
            score:         correctCount,
            total:         questions.length,
            timeTaken:     timeTaken || 0,
            isOfficial,      // true للأولى فقط
            attemptNumber    // 1، 2، 3، ...
        });

        logger.info(
            `[Score] userId=${req.user.id} quizId=${quizId}` +
            ` attempt=${attemptNumber} isOfficial=${isOfficial}` +
            ` score=${correctCount}/${questions.length}`
        );

        // 5. بناء التفاصيل للرد
        const detailedResults = questions.map(q => {
            const studentAnswer = gradedAnswers.find(a => a.questionId === q.id);
            return {
                question:      q.question,
                hint:          q.hint,
                options:       q.answerOptions,
                selectedIndex: studentAnswer ? studentAnswer.selectedIndex : -1,
                isCorrect:     studentAnswer ? studentAnswer.isCorrect : false
            };
        });

        res.status(201).json({
            message: isOfficial
                ? 'تم تسليم الامتحان بنجاح! تم احتساب نتيجتك في لوحة الشرف.'
                : `تم تسليم المحاولة التدريبية رقم ${attemptNumber} بنجاح. لن تؤثر على لوحة الشرف.`,
            result: {
                score:          correctCount,
                total:          questions.length,
                percentage:     Math.round((correctCount / questions.length) * 100),
                closingMessage: quiz.closingMessage
            },
            // meta تُستهلك بواسطة quiz.js لعرض لافتة النتائج
            meta: {
                isOfficial,
                attemptNumber
            },
            details: detailedResults
        });

    } catch (error) {
        const dbMsg = error.original?.message || error.message;
        logger.error('خطأ في تسليم الامتحان:', { error: dbMsg, stack: error.stack });
        res.status(500).json({
            error: 'حدث خطأ أثناء تسليم الامتحان.',
            ...(process.env.NODE_ENV !== 'production' && { debug: dbMsg })
        });
    }
});

// ============================================
//   GET /api/scores/my — درجاتي (الطالب الحالي)
//   يعيد كل المحاولات (رسمية وتدريبية)
// ============================================
/**
 * @route GET /api/scores/my
 * @description Retrieves all score records for the currently authenticated student,
 *   including official and practice attempts, with quiz details. Ordered by most recent.
 *   The client uses `isOfficial` and `attemptNumber` to build state.attemptsMap.
 * @access Private — requires authentication.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res - Array of score objects with isOfficial, attemptNumber.
 * @returns {Promise<void>}
 */
router.get('/my', authenticate, async (req, res) => {
    try {
        const scores = await Score.findAll({
            where: { userId: req.user.id },
            include: [{ model: Quiz, as: 'quiz', attributes: ['title', 'subject'] }],
            order: [['createdAt', 'DESC']]
        });

        // يُرجع كل الحقول من نموذج Score (بما فيها isOfficial وattemptNumber)
        res.json(scores);
    } catch (error) {
        const dbMsg = error.original?.message || error.parent?.message || error.message;
        logger.error('خطأ في جلب الدرجات:', { error: dbMsg, stack: error.stack });
        res.status(500).json({
            error: 'حدث خطأ.',
            ...(process.env.NODE_ENV !== 'production' && { debug: dbMsg })
        });
    }
});

// ============================================
//   GET /api/scores/my/attempts — عدد محاولاتي لكل اختبار
//   يُستخدم لتعبئة state.attemptsMap عند تحميل التطبيق
// ============================================
/**
 * @route GET /api/scores/my/attempts
 * @description Returns attempt counts per quiz for the current user.
 *   Used by the frontend to populate state.attemptsMap and decide isOfficial before starting.
 * @access Private — requires authentication.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res - Array of { quizId, attemptCount, hasOfficial }
 * @returns {Promise<void>}
 */
router.get('/my/attempts', authenticate, async (req, res) => {
    try {
        const [rows] = await sequelize.query(
            `SELECT
                 quizId,
                 COUNT(id)                                          AS attemptCount,
                 MAX(CASE WHEN isOfficial = 1 THEN 1 ELSE 0 END)   AS hasOfficial
             FROM scores
             WHERE userId = :userId
               AND deletedAt IS NULL
             GROUP BY quizId`,
            { replacements: { userId: req.user.id } }
        );

        const result = rows.map(r => ({
            quizId:       r.quizId,
            attemptCount: parseInt(r.attemptCount) || 0,
            hasOfficial:  Boolean(parseInt(r.hasOfficial))
        }));

        res.json(result);
    } catch (error) {
        const dbMsg = error.original?.message || error.message;
        logger.error('خطأ في جلب عدد المحاولات:', { error: dbMsg, stack: error.stack });
        res.status(500).json({
            error: 'حدث خطأ.',
            ...(process.env.NODE_ENV !== 'production' && { debug: dbMsg })
        });
    }
});

// ============================================
//   GET /api/attempts — عدد محاولات اختبار محدد
//   يدعم العميل الحالي مباشرةً بدون تغيير في api.js
//
//   ملاحظة: هذا المسار يُعيد { attempts: number } لاختبار واحد بعينه.
//   في حين يُعيد /api/scores/my/attempts مصفوفة كاملة لجميع الاختبارات.
//   الأفضل معمارياً هو الاعتماد على /api/scores/my/attempts وتخزين النتائج
//   مؤقتاً في state.attemptsMap، لتقليل عدد الطلبات إلى السيرفر.
//
//   @example استدعاء Curl:
//     # طالب يجلب محاولاته الخاصة:
//     curl -X GET "https://api.example.com/api/attempts?quizId=123" \
//          -H "Cookie: token=<jwt>" \
//          -H "X-CSRF-Token: <csrf>"
//
//     # أدمن يجلب محاولات طالب آخر:
//     curl -X GET "https://api.example.com/api/attempts?quizId=123&email=student@example.com" \
//          -H "Cookie: token=<jwt>" \
//          -H "X-CSRF-Token: <csrf>"
//
//   @example استجابة ناجحة:
//     HTTP 200 — { "attempts": 3 }
//
//   @example استجابة خطأ:
//     HTTP 400 — { "error": "quizId مطلوب." }
//     HTTP 403 — { "error": "غير مصرح." }
//     HTTP 404 — { "error": "المستخدم غير موجود." }
// ============================================
/**
 * @route GET /api/attempts
 * @description Returns the number of attempts a user has made for a specific quiz.
 *   - إذا كان المستخدم أدمناً ومرّر email، يُحسب العدد لذلك المستخدم.
 *   - خلاف ذلك يُستخدم req.user.id (الطالب الحالي).
 *   - يُعيد { attempts: number } متوافقاً مع توقعات دالة getAttempts() في api.js.
 * @access Private — requires authentication.
 * @param {import('express').Request}  req - query: { quizId, email? }
 * @param {import('express').Response} res - { attempts: number }
 * @returns {Promise<void>}
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { quizId, email } = req.query;

        // ── التحقق من quizId ──────────────────────────────────────────────
        if (!quizId) {
            return res.status(400).json({ error: 'quizId مطلوب.' });
        }

        // ── تحديد userId المستهدف ─────────────────────────────────────────
        let targetUserId = req.user.id;

        if (email) {
            // فقط الأدمن يمكنه الاستعلام باستخدام email طالب آخر
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'غير مصرح. هذه الميزة للأدمن فقط.' });
            }

            // البحث عن المستخدم بالإيميل
            const targetUser = await User.findOne({ where: { email } });
            if (!targetUser) {
                return res.status(404).json({ error: 'المستخدم غير موجود.' });
            }

            targetUserId = targetUser.id;
        }

        // ── عدّ المحاولات باستخدام Score.count ───────────────────────────
        // نستخدم String() على quizId لضمان التوافق مع أنواع البيانات المختلفة
        const attempts = await Score.count({
            where: {
                userId: targetUserId,
                quizId: String(quizId)
            }
        });

        logger.info(
            `[GET /api/attempts] userId=${targetUserId}` +
            ` quizId=${quizId}` +
            ` requestedBy=${req.user.id}` +
            ` (${req.user.role})` +
            ` → ${attempts} محاولة`
        );

        // ── الرد بالعدد ───────────────────────────────────────────────────
        // الشكل { attempts: number } متوافق مع ما تتوقعه دالة getAttempts() في api.js:
        //   const count = Number(data?.attempts) || 0;
        res.json({ attempts });

    } catch (error) {
        const dbMsg = error.original?.message || error.message;
        logger.error('خطأ في GET /api/attempts:', { error: dbMsg, stack: error.stack });
        res.status(500).json({
            error: 'حدث خطأ أثناء جلب عدد المحاولات.',
            ...(process.env.NODE_ENV !== 'production' && { debug: dbMsg })
        });
    }
});

// ============================================
//   GET /api/scores/leaderboard — لوحة الشرف
//   تعتمد على المحاولات الرسمية فقط (isOfficial = 1)
// ============================================
/**
 * @route GET /api/scores/leaderboard
 * @description Returns the top 50 students ranked by average percentage.
 *   ONLY official scores (first attempt per quiz) are included — practice attempts are excluded.
 *   Aggregates total score, exam count, average percentage, and full-marks count.
 * @access Private — requires authentication.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res - Array of leaderboard entries.
 * @returns {Promise<void>}
 */
router.get('/leaderboard', authenticateOrGuest, async (req, res) => {
    try {
        // نأخذ فقط أول محاولة رسمية لكل طالب لكل اختبار
        const [rows] = await sequelize.query(`
            SELECT
                s.userId,
                u.fname,
                u.lname,
                SUM(s.score)      AS totalScore,
                SUM(s.total)      AS totalMax,
                COUNT(s.id)       AS examsCount,
                (SUM(s.score) / NULLIF(SUM(s.total), 0)) * 100 AS avgPercentage,
                SUM(CASE WHEN s.score = s.total THEN 1 ELSE 0 END) AS fullMarksCount
            FROM (
                SELECT s.*
                FROM scores s
                INNER JOIN (
                    SELECT userId, quizId, MIN(attemptNumber) AS minAttempt
                    FROM scores
                    WHERE isOfficial = 1 AND deletedAt IS NULL
                    GROUP BY userId, quizId
                ) first_attempt ON s.userId = first_attempt.userId AND s.quizId = first_attempt.quizId AND s.attemptNumber = first_attempt.minAttempt
                WHERE s.isOfficial = 1 AND s.deletedAt IS NULL
            ) s
            INNER JOIN users u ON s.userId = u.id AND u.deletedAt IS NULL
            GROUP BY s.userId, u.fname, u.lname
            ORDER BY fullMarksCount DESC, avgPercentage DESC, totalScore DESC
            LIMIT 50
        `);

        const result = rows.map(entry => ({
            userName:       entry.fname
                ? `${entry.fname} ${entry.lname || ''}`.trim()
                : 'مستخدم محذوف',
            totalScore:     parseInt(entry.totalScore)    || 0,
            totalMax:       parseInt(entry.totalMax)      || 0,
            examsCount:     parseInt(entry.examsCount)    || 0,
            avgPercentage:  Math.round(parseFloat(entry.avgPercentage) || 0),
            fullMarksCount: parseInt(entry.fullMarksCount) || 0
        }));

        res.json(result);
    } catch (error) {
        const dbMsg = error.original?.message || error.parent?.message || error.message;
        logger.error('خطأ في جلب لوحة الشرف:', { error: dbMsg, stack: error.stack });
        res.status(500).json({
            error: 'حدث خطأ.',
            ...(process.env.NODE_ENV !== 'production' && { debug: dbMsg })
        });
    }
});

// ============================================
//   GET /api/scores/quiz/:quizId — نتائج امتحان (أدمن فقط)
// ============================================
/**
 * @route GET /api/scores/quiz/:quizId
 * @description Retrieves all scores for a specific quiz (official and practice),
 *   sorted by percentage descending. Includes student names, isOfficial, attemptNumber.
 *   Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request}  req - `quizId` param
 * @param {import('express').Response} res - Array of score result objects.
 * @returns {Promise<void>}
 */
router.get('/quiz/:quizId', authenticate, requireAdmin, validateQuizIdParam, async (req, res) => {
    try {
        const scores = await Score.findAll({
            where: { quizId: req.params.quizId },
            include: [{ model: User, as: 'user', attributes: ['fname', 'lname'] }],
            order: [
                ['isOfficial',   'DESC'],   // الرسمية أولاً
                ['percentage',   'DESC'],
                ['attemptNumber','ASC']
            ]
        });

        const results = scores.map(s => ({
            userName:      s.user ? `${s.user.fname} ${s.user.lname}` : 'محذوف',
            score:         s.score,
            total:         s.total,
            percentage:    s.percentage,
            timeTaken:     s.timeTaken,
            isOfficial:    s.isOfficial,
            attemptNumber: s.attemptNumber,
            date:          s.createdAt
        }));

        res.json(results);
    } catch (error) {
        logger.error('خطأ في جلب نتائج الامتحان:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   GET /api/scores/all — كل النتائج (أدمن فقط)
// ============================================
/**
 * @route GET /api/scores/all
 * @description Retrieves a paginated list of all scores (official and practice).
 *   Includes student names, quiz details, isOfficial, and attemptNumber.
 *   Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request}  req - optional `page`, `limit` query params.
 *   Optional filter: `?officialOnly=true` to return only official attempts.
 * @param {import('express').Response} res - { data, total, page, totalPages }
 * @returns {Promise<void>}
 */
router.get('/all', authenticate, requireAdmin, validatePagination, async (req, res) => {
    try {
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // فلتر اختياري للأدمن: officialOnly=true
        const where = {};
        if (req.query.officialOnly === 'true') {
            where.isOfficial = true;
        }

        const { count, rows: scores } = await Score.findAndCountAll({
            where,
            include: [
                { model: User, as: 'user', attributes: ['fname', 'lname'] },
                { model: Quiz, as: 'quiz', attributes: ['title', 'subject'] }
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        const results = scores.map(s => ({
            userName:      s.user ? `${s.user.fname} ${s.user.lname}` : 'محذوف',
            quizTitle:     s.quiz ? s.quiz.title   : 'محذوف',
            quizSubject:   s.quiz ? s.quiz.subject : '',
            score:         s.score,
            total:         s.total,
            percentage:    s.percentage,
            isOfficial:    s.isOfficial,
            attemptNumber: s.attemptNumber,
            date:          s.createdAt
        }));

        res.json({ data: results, total: count, page, totalPages: Math.ceil(count / limit) });
    } catch (error) {
        const dbMsg = error.original?.message || error.parent?.message || error.message;
        logger.error('خطأ في جلب كل النتائج:', { error: dbMsg, stack: error.stack });
        res.status(500).json({
            error: 'حدث خطأ.',
            ...(process.env.NODE_ENV !== 'production' && { debug: dbMsg })
        });
    }
});

// ============================================
//   GET /api/scores/stats — إحصائيات عامة (أدمن فقط)
// ============================================
/**
 * @route GET /api/scores/stats
 * @description Returns platform-wide statistics: total students, total exams,
 *   total official scores, total practice scores, and overall average percentage.
 *   Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res - stats object
 * @returns {Promise<void>}
 */
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
    try {
        const [
            totalStudents,
            totalExams,
            totalOfficialScores,
            totalPracticeScores,
            avgResult
        ] = await Promise.all([
            User.count({ where: { role: 'student' } }),
            Quiz.count(),
            Score.count({ where: { isOfficial: true  } }),
            Score.count({ where: { isOfficial: false } }),
            // متوسط النسبة يعتمد على المحاولات الرسمية فقط لدقة أعلى
            Score.findAll({
                attributes: [[sequelize.fn('AVG', sequelize.col('percentage')), 'avg']],
                where: { isOfficial: true },
                raw: true
            })
        ]);

        res.json({
            totalStudents,
            totalExams,
            totalOfficialScores,
            totalPracticeScores,
            totalScores: totalOfficialScores + totalPracticeScores,
            avgPercentage: avgResult[0]?.avg
                ? Math.round(parseFloat(avgResult[0].avg))
                : 0
        });
    } catch (error) {
        logger.error('خطأ في الإحصائيات:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   DELETE /api/scores/:id — حذف نتيجة (أدمن فقط)
// ============================================
/**
 * @route DELETE /api/scores/:id
 * @description Deletes a single score record by its ID. Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request}  req - `id` param
 * @param {import('express').Response} res - { message }
 * @returns {Promise<void>}
 */
router.delete('/:id', authenticate, requireAdmin, validateIdParam, async (req, res) => {
    try {
        const score = await Score.findByPk(req.params.id);
        if (!score) {
            return res.status(404).json({ error: 'النتيجة غير موجودة.' });
        }
        await score.destroy();
        logger.info(`🗑️ حذف نتيجة #${req.params.id} — بواسطة: ${req.user.email}`);
        res.json({ message: 'تم حذف النتيجة بنجاح.' });
    } catch (error) {
        logger.error('خطأ في حذف النتيجة:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء حذف النتيجة.' });
    }
});

module.exports = router;