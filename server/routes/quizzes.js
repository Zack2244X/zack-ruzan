/**
 * @file Quiz CRUD routes
 * @description Express router for managing quizzes/exams.
 *   Students see only active quizzes with answers hidden; admins have full CRUD access
 *   including subject renaming and bulk deletion.
 * @module routes/quizzes
 */

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
const { validateCreateQuiz, validateUpdateQuiz, validateRenameSubject, validatePagination, validateIdParam, validateSubjectParam } = require('../middleware/validators');
const logger = require('../utils/logger');

// ============================================
//   GET /api/quizzes — جلب كل الامتحانات
// ============================================
/**
 * @route GET /api/quizzes
 * @description Retrieves a paginated list of quizzes, optionally filtered by subject and active status.
 *   Students only see active quizzes with correct answers stripped; admins see full data.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with optional `subject`, `active`, `page`, `limit` query params.
 * @param {import('express').Response} res - Express response with `{ data, total, page, totalPages }`.
 * @returns {Promise<void>}
 */
router.get('/', authenticate, validatePagination, async (req, res) => {
    try {
        const { subject, active } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const where = {};

        if (req.user.role === 'student') {
            where.isActive = true;
        } else if (active !== undefined) {
            where.isActive = active === 'true';
        }

        if (subject && subject !== 'الكل') {
            where.subject = subject;
        }

        const { count, rows: quizzes } = await Quiz.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            include: [{ model: User, as: 'creator', attributes: ['fname', 'lname'] }],
            limit,
            offset
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
            return res.json({ data: sanitized, total: count, page, totalPages: Math.ceil(count / limit) });
        }

        res.json({ data: quizzes, total: count, page, totalPages: Math.ceil(count / limit) });
    } catch (error) {
        const dbMsg = error.original?.message || error.parent?.message || error.message;
        logger.error('خطأ في جلب الامتحانات:', { error: dbMsg, stack: error.stack });
        res.status(500).json({ error: 'حدث خطأ في جلب الامتحانات.', ...(process.env.NODE_ENV !== 'production' && { debug: dbMsg }) });
    }
});

// ============================================
//   GET /api/quizzes/subjects/list — قائمة المواد
//   (يجب أن يكون قبل /:id حتى لا يتم التقاطه كـ id)
// ============================================
/**
 * @route GET /api/quizzes/subjects/list
 * @description Returns a list of distinct subject names from all quizzes.
 *   Must be defined before `/:id` to avoid being captured as an ID parameter.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with an array of subject strings.
 * @returns {Promise<void>}
 */
router.get('/subjects/list', authenticate, async (req, res) => {
    try {
        const results = await Quiz.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('subject')), 'subject']],
            raw: true
        });
        const subjects = results.map(r => r.subject);
        res.json(subjects);
    } catch (error) {
        logger.error('خطأ في جلب المواد:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   PUT /api/quizzes/subject/rename — تعديل اسم مادة (أدمن فقط)
//   (يجب أن يكون قبل /:id حتى لا يتم التقاطه كـ id)
// ============================================
/**
 * @route PUT /api/quizzes/subject/rename
 * @description Renames a subject across all quizzes. Requires admin privileges.
 *   Must be defined before `/:id` to avoid being captured as an ID parameter.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with `oldName` and `newName` in body.
 * @param {import('express').Response} res - Express response with `{ message, modifiedCount }`.
 * @returns {Promise<void>}
 */
router.put('/subject/rename', authenticate, requireAdmin, validateRenameSubject, async (req, res) => {
    try {
        const { oldName, newName } = req.body;

        const [affectedCount] = await Quiz.update(
            { subject: newName },
            { where: { subject: oldName } }
        );

        res.json({
            message: `تم تعديل اسم المادة من "${oldName}" إلى "${newName}".`,
            modifiedCount: affectedCount
        });
    } catch (error) {
        logger.error('خطأ في تعديل اسم المادة:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   DELETE /api/quizzes/subject/:name — حذف كل امتحانات مادة (أدمن فقط)
//   (يجب أن يكون قبل /:id حتى لا يتم التقاطه كـ id)
// ============================================
/**
 * @route DELETE /api/quizzes/subject/:name
 * @description Deletes all quizzes belonging to a specific subject. Requires admin privileges.
 *   Must be defined before `/:id` to avoid being captured as an ID parameter.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with URL-encoded `name` param.
 * @param {import('express').Response} res - Express response with `{ message, deletedCount }`.
 * @returns {Promise<void>}
 */
router.delete('/subject/:name', authenticate, requireAdmin, validateSubjectParam, async (req, res) => {
    try {
        const subjectName = decodeURIComponent(req.params.name);
        const deletedCount = await Quiz.destroy({ where: { subject: subjectName } });

        res.json({
            message: `تم حذف مجلد "${subjectName}" وجميع امتحاناته.`,
            deletedCount
        });
    } catch (error) {
        logger.error('خطأ في حذف المادة:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   GET /api/quizzes/:id — جلب امتحان واحد
// ============================================
/**
 * @route GET /api/quizzes/:id
 * @description Retrieves a single quiz by its ID.
 *   Students see the quiz with correct answers hidden; admins see the full quiz.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with `id` param.
 * @param {import('express').Response} res - Express response with the quiz object.
 * @returns {Promise<void>}
 */
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
        logger.error('خطأ في جلب الامتحان:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ في جلب الامتحان.' });
    }
});

// ============================================
//   POST /api/quizzes — إنشاء امتحان جديد (أدمن فقط)
// ============================================
/**
 * @route POST /api/quizzes
 * @description Creates a new quiz with validated questions. Requires admin privileges.
 *   Each question receives a unique UUID if not already provided.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with quiz data in body.
 * @param {import('express').Response} res - Express response with `{ message, quiz }`.
 * @returns {Promise<void>}
 */
router.post('/', authenticate, requireAdmin, validateCreateQuiz, async (req, res) => {
    try {
        const {
            title, subject, description, timeLimit,
            closingMessage, streakGoal, feedback, questions
        } = req.body;

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
        logger.error('خطأ في إنشاء الامتحان:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الامتحان.' });
    }
});

// ============================================
//   PUT /api/quizzes/:id — تعديل امتحان (أدمن فقط)
// ============================================
/**
 * @route PUT /api/quizzes/:id
 * @description Updates an existing quiz. Requires admin privileges.
 *   Only allowed fields are updated; new questions get auto-generated UUIDs.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with `id` param and update fields in body.
 * @param {import('express').Response} res - Express response with `{ message, quiz }`.
 * @returns {Promise<void>}
 */
router.put('/:id', authenticate, requireAdmin, validateUpdateQuiz, async (req, res) => {
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
        logger.error('خطأ في تعديل الامتحان:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء تعديل الامتحان.' });
    }
});

// ============================================
//   DELETE /api/quizzes/:id — حذف امتحان (أدمن فقط)
// ============================================
/**
 * @route DELETE /api/quizzes/:id
 * @description Deletes a quiz by its ID. Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with `id` param.
 * @param {import('express').Response} res - Express response with `{ message }`.
 * @returns {Promise<void>}
 */
router.delete('/:id', authenticate, requireAdmin, validateIdParam, async (req, res) => {
    try {
        const deleted = await Quiz.destroy({ where: { id: req.params.id } });
        if (!deleted) {
            return res.status(404).json({ error: 'الامتحان غير موجود.' });
        }
        res.json({ message: 'تم حذف الامتحان بنجاح.' });
    } catch (error) {
        logger.error('خطأ في حذف الامتحان:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء حذف الامتحان.' });
    }
});

module.exports = router;
