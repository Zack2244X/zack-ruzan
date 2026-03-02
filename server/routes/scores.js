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

// ============================================
//   POST /api/scores — تسليم إجابات الامتحان
//   (السيرفر يحسب الدرجة لمنع الغش)
// ============================================
router.post('/', authenticate, async (req, res) => {
    try {
        const { quizId, answers, timeTaken } = req.body;

        if (!quizId || !answers || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'بيانات الامتحان غير مكتملة.' });
        }

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
        console.error('خطأ في تسليم الامتحان:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء تسليم الامتحان.' });
    }
});

// ============================================
//   GET /api/scores/my — درجاتي (الطالب الحالي)
// ============================================
router.get('/my', authenticate, async (req, res) => {
    try {
        const scores = await Score.findAll({
            where: { userId: req.user.id },
            include: [{ model: Quiz, as: 'quiz', attributes: ['title', 'subject'] }],
            order: [['createdAt', 'DESC']]
        });

        res.json(scores);
    } catch (error) {
        console.error('خطأ في جلب الدرجات:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   GET /api/scores/leaderboard — لوحة الشرف
// ============================================
router.get('/leaderboard', authenticate, async (req, res) => {
    try {
        // تجميع النتائج حسب المستخدم
        const leaderboard = await Score.findAll({
            attributes: [
                'userId',
                [sequelize.fn('SUM', sequelize.col('score')), 'totalScore'],
                [sequelize.fn('SUM', sequelize.col('total')), 'totalMax'],
                [sequelize.fn('COUNT', sequelize.col('Score.id')), 'examsCount'],
                [sequelize.fn('AVG', sequelize.col('percentage')), 'avgPercentage'],
                [sequelize.fn('SUM',
                    sequelize.literal('CASE WHEN `Score`.`score` = `Score`.`total` THEN 1 ELSE 0 END')
                ), 'fullMarksCount']
            ],
            include: [{
                model: User,
                as: 'user',
                attributes: ['fname', 'lname']
            }],
            group: ['userId', 'user.id', 'user.fname', 'user.lname'],
            order: [[sequelize.fn('AVG', sequelize.col('percentage')), 'DESC']],
            limit: 50,
            raw: true,
            nest: true
        });

        const result = leaderboard.map(entry => ({
            userName: entry.user && entry.user.fname
                ? `${entry.user.fname} ${entry.user.lname}`
                : 'مستخدم محذوف',
            totalScore: parseInt(entry.totalScore) || 0,
            totalMax: parseInt(entry.totalMax) || 0,
            examsCount: parseInt(entry.examsCount) || 0,
            avgPercentage: Math.round(parseFloat(entry.avgPercentage) || 0),
            fullMarksCount: parseInt(entry.fullMarksCount) || 0
        }));

        res.json(result);
    } catch (error) {
        console.error('خطأ في جلب لوحة الشرف:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   GET /api/scores/quiz/:quizId — نتائج امتحان (أدمن فقط)
// ============================================
router.get('/quiz/:quizId', authenticate, requireAdmin, async (req, res) => {
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
        console.error('خطأ في جلب نتائج الامتحان:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   GET /api/scores/all — كل النتائج (أدمن فقط)
// ============================================
router.get('/all', authenticate, requireAdmin, async (req, res) => {
    try {
        const scores = await Score.findAll({
            include: [
                { model: User, as: 'user', attributes: ['fname', 'lname'] },
                { model: Quiz, as: 'quiz', attributes: ['title', 'subject'] }
            ],
            order: [['createdAt', 'DESC']]
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

        res.json(results);
    } catch (error) {
        console.error('خطأ في جلب كل النتائج:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   GET /api/scores/stats — إحصائيات عامة (أدمن فقط)
// ============================================
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
        console.error('خطأ في الإحصائيات:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

module.exports = router;
