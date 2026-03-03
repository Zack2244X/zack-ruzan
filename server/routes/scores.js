/**
 * @file Score and results routes
 * @description Express router for quiz score submission, retrieval, leaderboard,
 *   admin statistics, and score management. Scores are graded server-side to prevent cheating.
 * @module routes/scores
 */

// ============================================
//   مسارات الدرجات والنتائج
//   — Sequelize + TiDB —
// ============================================
const router = require('express').Router();
const { UniqueConstraintError } = require('sequelize');
const sequelize = require('../models/index');
const Score = require('../models/Score');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateSubmitScore, validatePagination, validateIdParam, validateQuizIdParam } = require('../middleware/validators');
const logger = require('../utils/logger');

// ============================================
//   POST /api/scores — تسليم إجابات الامتحان
//   (السيرفر يحسب الدرجة لمنع الغش)
// ============================================
/**
 * @route POST /api/scores
 * @description Submits a student's quiz answers. The server fetches the quiz, grades each
 *   answer against the stored correct options, and creates a Score record.
 *   Prevents duplicate submissions per user per quiz.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with `quizId`, `answers`, and optional `timeTaken` in body.
 * @param {import('express').Response} res - Express response with `{ message, result, details }`.
 * @returns {Promise<void>}
 */
router.post('/', authenticate, validateSubmitScore, async (req, res) => {
    try {
        const { quizId, answers, timeTaken } = req.body;

        // التحقق من أن الطالب لم يجب من قبل
        const existingScore = await Score.findOne({
            where: { userId: req.user.id, quizId }
        });
        if (existingScore) {
            return res.status(409).json({
                error: 'لقد أجبت على هذا الامتحان من قبل.',
                score: existingScore
            });
        }

        // جلب الامتحان
        const quiz = await Quiz.findByPk(quizId);
        if (!quiz) {
            return res.status(404).json({ error: 'الامتحان غير موجود.' });
        }

        // === حساب الدرجة في السيرفر (منع الغش) ===
        let correctCount = 0;
        const gradedAnswers = [];
        const questions = quiz.questions; // JSON array

        for (const answer of answers) {
            // البحث عن السؤال في الـ JSON بالـ id
            const question = questions.find(q => q.id === answer.questionId);
            if (!question) continue;

            const selectedOption = question.answerOptions[answer.selectedIndex];
            const isCorrect = selectedOption ? selectedOption.isCorrect : false;

            if (isCorrect) correctCount++;

            gradedAnswers.push({
                questionId: answer.questionId,
                selectedIndex: answer.selectedIndex,
                isCorrect
            });
        }

        // إنشاء سجل النتيجة
        const score = await Score.create({
            userId: req.user.id,
            quizId,
            answers: gradedAnswers,
            score: correctCount,
            total: questions.length,
            timeTaken: timeTaken || 0
        });

        // إرجاع النتيجة مع التفاصيل
        const detailedResults = questions.map(q => {
            const studentAnswer = gradedAnswers.find(
                a => a.questionId === q.id
            );
            return {
                question: q.question,
                hint: q.hint,
                options: q.answerOptions,
                selectedIndex: studentAnswer ? studentAnswer.selectedIndex : -1,
                isCorrect: studentAnswer ? studentAnswer.isCorrect : false
            };
        });

        res.status(201).json({
            message: 'تم تسليم الامتحان بنجاح!',
            result: {
                score: correctCount,
                total: questions.length,
                percentage: Math.round((correctCount / questions.length) * 100),
                closingMessage: quiz.closingMessage
            },
            details: detailedResults
        });
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.status(409).json({ error: 'لقد أجبت على هذا الامتحان من قبل.' });
        }
        logger.error('خطأ في تسليم الامتحان:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء تسليم الامتحان.' });
    }
});

// ============================================
//   GET /api/scores/my — درجاتي (الطالب الحالي)
// ============================================
/**
 * @route GET /api/scores/my
 * @description Retrieves all scores for the currently authenticated student,
 *   including associated quiz titles and subjects, ordered by most recent.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with an array of score objects.
 * @returns {Promise<void>}
 */
router.get('/my', authenticate, async (req, res) => {
    try {
        const scores = await Score.findAll({
            where: { userId: req.user.id },
            include: [{ model: Quiz, as: 'quiz', attributes: ['title', 'subject'] }],
            order: [['createdAt', 'DESC']]
        });

        res.json(scores);
    } catch (error) {
        const dbMsg = error.original?.message || error.parent?.message || error.message;
        logger.error('خطأ في جلب الدرجات:', { error: dbMsg, stack: error.stack });
        res.status(500).json({ error: 'حدث خطأ.', debug: dbMsg });
    }
});

// ============================================
//   GET /api/scores/leaderboard — لوحة الشرف
// ============================================
/**
 * @route GET /api/scores/leaderboard
 * @description Returns the top 50 students ranked by average percentage.
 *   Aggregates total score, exam count, average percentage, and full-marks count.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with an array of leaderboard entries.
 * @returns {Promise<void>}
 */
router.get('/leaderboard', authenticate, async (req, res) => {
    try {
        const [rows] = await sequelize.query(`
            SELECT
                s.userId,
                u.fname,
                u.lname,
                SUM(s.score)      AS totalScore,
                SUM(s.total)      AS totalMax,
                COUNT(s.id)       AS examsCount,
                AVG(s.percentage) AS avgPercentage,
                SUM(CASE WHEN s.score = s.total THEN 1 ELSE 0 END) AS fullMarksCount
            FROM scores s
            INNER JOIN users u ON s.userId = u.id
            WHERE s.deletedAt IS NULL
            GROUP BY s.userId, u.fname, u.lname
            ORDER BY avgPercentage DESC
            LIMIT 50
        `);

        const result = rows.map(entry => ({
            userName: entry.fname ? `${entry.fname} ${entry.lname || ''}`.trim() : 'مستخدم محذوف',
            totalScore: parseInt(entry.totalScore) || 0,
            totalMax: parseInt(entry.totalMax) || 0,
            examsCount: parseInt(entry.examsCount) || 0,
            avgPercentage: Math.round(parseFloat(entry.avgPercentage) || 0),
            fullMarksCount: parseInt(entry.fullMarksCount) || 0
        }));

        res.json(result);
    } catch (error) {
        const dbMsg = error.original?.message || error.parent?.message || error.message;
        logger.error('خطأ في جلب لوحة الشرف:', { error: dbMsg, stack: error.stack });
        res.status(500).json({ error: 'حدث خطأ.', debug: dbMsg });
    }
});

// ============================================
//   GET /api/scores/quiz/:quizId — نتائج امتحان (أدمن فقط)
// ============================================
/**
 * @route GET /api/scores/quiz/:quizId
 * @description Retrieves all scores for a specific quiz, sorted by percentage descending.
 *   Includes student names. Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with `quizId` param.
 * @param {import('express').Response} res - Express response with an array of score result objects.
 * @returns {Promise<void>}
 */
router.get('/quiz/:quizId', authenticate, requireAdmin, validateQuizIdParam, async (req, res) => {
    try {
        const scores = await Score.findAll({
            where: { quizId: req.params.quizId },
            include: [{ model: User, as: 'user', attributes: ['fname', 'lname'] }],
            order: [['percentage', 'DESC']]
        });

        const results = scores.map(s => ({
            userName: s.user ? `${s.user.fname} ${s.user.lname}` : 'محذوف',
            score: s.score,
            total: s.total,
            percentage: s.percentage,
            timeTaken: s.timeTaken,
            date: s.createdAt
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
 * @description Retrieves a paginated list of all scores across all quizzes.
 *   Includes student names and quiz details. Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with optional `page` and `limit` query params.
 * @param {import('express').Response} res - Express response with `{ data, total, page, totalPages }`.
 * @returns {Promise<void>}
 */
router.get('/all', authenticate, requireAdmin, validatePagination, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const { count, rows: scores } = await Score.findAndCountAll({
            include: [
                { model: User, as: 'user', attributes: ['fname', 'lname'] },
                { model: Quiz, as: 'quiz', attributes: ['title', 'subject'] }
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        const results = scores.map(s => ({
            userName: s.user ? `${s.user.fname} ${s.user.lname}` : 'محذوف',
            quizTitle: s.quiz ? s.quiz.title : 'محذوف',
            quizSubject: s.quiz ? s.quiz.subject : '',
            score: s.score,
            total: s.total,
            percentage: s.percentage,
            date: s.createdAt
        }));

        res.json({ data: results, total: count, page, totalPages: Math.ceil(count / limit) });
    } catch (error) {
        const dbMsg = error.original?.message || error.parent?.message || error.message;
        logger.error('خطأ في جلب كل النتائج:', { error: dbMsg, stack: error.stack });
        res.status(500).json({ error: 'حدث خطأ.', debug: dbMsg });
    }
});

// ============================================
//   GET /api/scores/stats — إحصائيات عامة (أدمن فقط)
// ============================================
/**
 * @route GET /api/scores/stats
 * @description Returns platform-wide statistics: total students, total exams,
 *   total scores submitted, and overall average percentage. Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with `{ totalStudents, totalExams, totalScores, avgPercentage }`.
 * @returns {Promise<void>}
 */
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
    try {
        const [totalStudents, totalExams, totalScores, avgResult] = await Promise.all([
            User.count({ where: { role: 'student' } }),
            Quiz.count(),
            Score.count(),
            Score.findAll({
                attributes: [[sequelize.fn('AVG', sequelize.col('percentage')), 'avg']],
                raw: true
            })
        ]);

        res.json({
            totalStudents,
            totalExams,
            totalScores,
            avgPercentage: avgResult[0] && avgResult[0].avg
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
 * @param {import('express').Request} req - Express request with `id` param.
 * @param {import('express').Response} res - Express response with `{ message }`.
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
