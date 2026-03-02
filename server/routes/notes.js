// ============================================
//   مسارات المذكرات والملفات (CRUD)
//   — Sequelize + TiDB —
// ============================================
const router = require('express').Router();
const sequelize = require('../models/index');
const Note = require('../models/Note');
const User = require('../models/User');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ============================================
//   GET /api/notes — جلب كل المذكرات
// ============================================
router.get('/', authenticate, async (req, res) => {
    try {
        const { subject } = req.query;
        const where = {};

        if (subject && subject !== 'الكل') {
            where.subject = subject;
        }

        const notes = await Note.findAll({
            where,
            order: [['createdAt', 'DESC']],
            include: [{ model: User, as: 'creator', attributes: ['fname', 'lname'] }]
        });

        res.json(notes);
    } catch (error) {
        console.error('خطأ في جلب المذكرات:', error.message);
        res.status(500).json({ error: 'حدث خطأ في جلب المذكرات.' });
    }
});

// ============================================
//   GET /api/notes/subjects/list — قائمة مواد المذكرات
// ============================================
router.get('/subjects/list', authenticate, async (req, res) => {
    try {
        const results = await Note.findAll({
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
//   GET /api/notes/:id — جلب مذكرة واحدة
// ============================================
router.get('/:id', authenticate, async (req, res) => {
    try {
        const note = await Note.findByPk(req.params.id, {
            include: [{ model: User, as: 'creator', attributes: ['fname', 'lname'] }]
        });

        if (!note) {
            return res.status(404).json({ error: 'المذكرة غير موجودة.' });
        }

        res.json(note);
    } catch (error) {
        console.error('خطأ في جلب المذكرة:', error.message);
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// ============================================
//   POST /api/notes — إضافة مذكرة جديدة (أدمن فقط)
// ============================================
router.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const { title, subject, link, type, description } = req.body;

        if (!title || !subject || !link) {
            return res.status(400).json({ error: 'العنوان والمادة والرابط مطلوبة.' });
        }

        const note = await Note.create({
            title: title.trim(),
            subject: subject.trim(),
            link: link.trim(),
            type: type || 'pdf',
            description: description ? description.trim() : '',
            createdBy: req.user.id
        });

        res.status(201).json({
            message: 'تم إضافة المذكرة بنجاح!',
            note
        });
    } catch (error) {
        console.error('خطأ في إضافة المذكرة:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء إضافة المذكرة.' });
    }
});

// ============================================
//   PUT /api/notes/:id — تعديل مذكرة (أدمن فقط)
// ============================================
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const note = await Note.findByPk(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'المذكرة غير موجودة.' });
        }

        const allowedFields = ['title', 'subject', 'link', 'type', 'description'];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                note[field] = typeof req.body[field] === 'string'
                    ? req.body[field].trim()
                    : req.body[field];
            }
        });

        await note.save();

        res.json({
            message: 'تم تحديث المذكرة بنجاح!',
            note
        });
    } catch (error) {
        console.error('خطأ في تعديل المذكرة:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء تعديل المذكرة.' });
    }
});

// ============================================
//   DELETE /api/notes/:id — حذف مذكرة (أدمن فقط)
// ============================================
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const deleted = await Note.destroy({ where: { id: req.params.id } });
        if (!deleted) {
            return res.status(404).json({ error: 'المذكرة غير موجودة.' });
        }
        res.json({ message: 'تم حذف المذكرة بنجاح.' });
    } catch (error) {
        console.error('خطأ في حذف المذكرة:', error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء حذف المذكرة.' });
    }
});

module.exports = router;
