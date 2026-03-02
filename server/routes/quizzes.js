// ============================================
//   مسارات الامتحانات (CRUD)
//   — Sequelize + TiDB —
// ============================================
const router = require('express').Router();
const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../models/index');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ============================================
//   GET /api/quizzes — جلب كل الامتحانات
// ============================================
router.get('/', authenticate, async (req, res) => {
    try {
        const { subject, active } = req.query;
        const where = {};

        if (req.user.role === 'student') {
            where.isActive = true;
        } else if (active !== undefined) {
            where.isActive = active === 'true';
        }

        if (subject && subject !== 'الكل') {
            where.subject = subject;
        }

        const quizzes = await Quiz.findAll({
            where,
            order: [['createdAt', 'DESC']],
            include: [{ model: User, as: 'creator', attributes: ['fname', 'lname'] }]
        });

        // للطلاب: إخفاء الإجابات الصحيحة
        if (req.user.role === 'student') {
            const sanitized = quizzes.map(quiz => {
                const q = quiz.toJSON();
                q.questions = q.questions.map(question => ({
                    ...question,
                    answerOptions: question.answerOptions.map(opt => ({
                        text: opt.text,
                        rationale: ''
                    }))
                }));
                return q;
            });
            return res.json(sanitized);
        }

        res.json(quizzes);
    } catch (error) {
        console.error('خطأ في جلب الامتحانات:', error.message);
        res.status(500).json({ error: 'حدث خطأ في جلب الامتحانات.' });
    }
});

// ============================================
//   GET /api/quizzes/subjects/list — قائمة المواد
//   (يجب أن يكون قبل /:id حتى لا يتم التقاطه كـ id)
// ============================================
router.get('/subjects/list', authenticate, async (req, res) => {
    try {
        const results = await Quiz.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('subject')), 'subject']],
            raw: true
        });
        const subjects = results.map(r => r.subject);
        res.json(subjects);
    } catch (error) {
        console.error('خطأ في جلب المواد:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   GET /api/quizzes/:id — جلب امتحان واحد
// ============================================
router.get('/:id', authenticate, async (req, res) => {
    try {
        const quiz = await Quiz.findByPk(req.params.id, {
            include: [{ model: User, as: 'creator', attributes: ['fname', 'lname'] }]
        });

        if (!quiz) {
            return res.status(404).json({ error: 'الامتحان غير موجود.' });
        }

        if (req.user.role === 'student') {
            const q = quiz.toJSON();
            q.questions = q.questions.map(question => ({
                ...question,
                answerOptions: question.answerOptions.map(opt => ({
                    text: opt.text,
                    rationale: ''
                }))
            }));
            return res.json(q);
        }

        res.json(quiz);
    } catch (error) {
        console.error('خطأ في جلب الامتحان:', error.message);
        res.status(500).json({ error: 'حدث خطأ في جلب الامتحان.' });
    }
});

// ============================================
//   POST /api/quizzes — إنشاء امتحان جديد (أدمن فقط)
// ============================================
router.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const {
            title, subject, description, timeLimit,
            closingMessage, streakGoal, feedback, questions
        } = req.body;

        if (!title || !subject || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'العنوان والمادة والأسئلة مطلوبة.' });
        }

        // التحقق من صحة كل سؤال + إضافة ID فريد
        const processedQuestions = [];
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.question || !q.question.trim()) {
                return res.status(400).json({ error: `السؤال رقم ${i + 1} فارغ.` });
            }
            if (!q.answerOptions || q.answerOptions.length < 2) {
                return res.status(400).json({ error: `السؤال رقم ${i + 1} يحتاج خيارين على الأقل.` });
            }
            const hasCorrect = q.answerOptions.some(opt => opt.isCorrect);
            if (!hasCorrect) {
                return res.status(400).json({ error: `السؤال رقم ${i + 1} ليس له إجابة صحيحة محددة.` });
            }

            processedQuestions.push({
                id: q.id || crypto.randomUUID(),   // إضافة ID فريد لكل سؤال
                question: q.question,
                hint: q.hint || '',
                answerOptions: q.answerOptions.map(opt => ({
                    text: opt.text,
                    isCorrect: !!opt.isCorrect,
                    rationale: opt.rationale || ''
                }))
            });
        }

        const quiz = await Quiz.create({
            title,
            subject,
            description: description || '',
            timeLimit: timeLimit || 1800,
            closingMessage: closingMessage || 'شكراً لمشاركتك في الاختبار!',
            streakGoal: streakGoal || 3,
            feedback: feedback || {},
            questions: processedQuestions,
            createdBy: req.user.id
        });

        res.status(201).json({
            message: 'تم إنشاء الامتحان بنجاح!',
            quiz
        });
    } catch (error) {
        console.error('خطأ في إنشاء الامتحان:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الامتحان.' });
    }
});

// ============================================
//   PUT /api/quizzes/:id — تعديل امتحان (أدمن فقط)
// ============================================
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const quiz = await Quiz.findByPk(req.params.id);
        if (!quiz) {
            return res.status(404).json({ error: 'الامتحان غير موجود.' });
        }

        const allowedFields = [
            'title', 'subject', 'description', 'timeLimit',
            'closingMessage', 'streakGoal', 'feedback', 'questions', 'isActive'
        ];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                // لو عدّل الأسئلة، نضيف IDs للأسئلة الجديدة
                if (field === 'questions' && Array.isArray(req.body.questions)) {
                    quiz.questions = req.body.questions.map(q => ({
                        id: q.id || crypto.randomUUID(),
                        question: q.question,
                        hint: q.hint || '',
                        answerOptions: q.answerOptions.map(opt => ({
                            text: opt.text,
                            isCorrect: !!opt.isCorrect,
                            rationale: opt.rationale || ''
                        }))
                    }));
                } else {
                    quiz[field] = req.body[field];
                }
            }
        });

        // Sequelize يحتاج changed() للـ JSON columns
        quiz.changed('questions', true);
        quiz.changed('feedback', true);
        await quiz.save();

        res.json({
            message: 'تم تحديث الامتحان بنجاح!',
            quiz
        });
    } catch (error) {
        console.error('خطأ في تعديل الامتحان:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء تعديل الامتحان.' });
    }
});

// ============================================
//   DELETE /api/quizzes/:id — حذف امتحان (أدمن فقط)
// ============================================
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const deleted = await Quiz.destroy({ where: { id: req.params.id } });
        if (!deleted) {
            return res.status(404).json({ error: 'الامتحان غير موجود.' });
        }
        res.json({ message: 'تم حذف الامتحان بنجاح.' });
    } catch (error) {
        console.error('خطأ في حذف الامتحان:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء حذف الامتحان.' });
    }
});

// ============================================
//   PUT /api/quizzes/subject/rename — تعديل اسم مادة (أدمن فقط)
// ============================================
router.put('/subject/rename', authenticate, requireAdmin, async (req, res) => {
    try {
        const { oldName, newName } = req.body;
        if (!oldName || !newName) {
            return res.status(400).json({ error: 'الاسم القديم والجديد مطلوبان.' });
        }

        const [affectedCount] = await Quiz.update(
            { subject: newName },
            { where: { subject: oldName } }
        );

        res.json({
            message: `تم تعديل اسم المادة من "${oldName}" إلى "${newName}".`,
            modifiedCount: affectedCount
        });
    } catch (error) {
        console.error('خطأ في تعديل اسم المادة:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   DELETE /api/quizzes/subject/:name — حذف كل امتحانات مادة (أدمن فقط)
// ============================================
router.delete('/subject/:name', authenticate, requireAdmin, async (req, res) => {
    try {
        const subjectName = decodeURIComponent(req.params.name);
        const deletedCount = await Quiz.destroy({ where: { subject: subjectName } });

        res.json({
            message: `تم حذف مجلد "${subjectName}" وجميع امتحاناته.`,
            deletedCount
        });
    } catch (error) {
        console.error('خطأ في حذف المادة:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

module.exports = router;
