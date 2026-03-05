const router = require('express').Router();
const Score = require('../models/Score');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Simple helper: compute next attempt number and whether it's official
 */
async function resolveAttemptMeta(userId, quizId) {
    const existingCount = await Score.count({ where: { userId, quizId } });
    const attemptNumber = existingCount + 1;
    return { attemptNumber, isOfficial: attemptNumber === 1 };
}

// GET /api/attempts?quizId=...(&email=...)
router.get('/', authenticate, async (req, res) => {
    try {
        const { quizId, email } = req.query;
        if (!quizId) return res.status(400).json({ error: 'quizId مطلوب.' });

        let targetUserId = req.user.id;
        if (email) {
            if (req.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح. هذه الميزة للأدمن فقط.' });
            const targetUser = await User.findOne({ where: { email } });
            if (!targetUser) return res.status(404).json({ error: 'المستخدم غير موجود.' });
            targetUserId = targetUser.id;
        }

        const attempts = await Score.count({ where: { userId: targetUserId, quizId: String(quizId) } });

        logger.info(`[GET /api/attempts] userId=${targetUserId} quizId=${quizId} requestedBy=${req.user.id}`);
        res.json({ attempts });
    } catch (error) {
        logger.error('خطأ في GET /api/attempts:', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

// POST /api/attempts { quizId, email? }
// Creates a lightweight placeholder Score representing an attempt (for older clients).
router.post('/', authenticate, async (req, res) => {
    try {
        const { quizId, email } = req.body || {};
        if (!quizId) return res.status(400).json({ error: 'quizId مطلوب' });

        let userId = req.user.id;
        if (email) {
            if (req.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح.' });
            const u = await User.findOne({ where: { email } });
            if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
            userId = u.id;
        }

        const { attemptNumber, isOfficial } = await resolveAttemptMeta(userId, quizId);

        await Score.create({
            userId,
            quizId,
            answers: [],
            score: 0,
            total: 0,
            timeTaken: 0,
            isOfficial,
            attemptNumber
        });

        const updatedCount = await Score.count({ where: { userId, quizId } });
        logger.info(`[POST /api/attempts] recorded placeholder userId=${userId} quizId=${quizId} attempt=${attemptNumber}`);
        res.status(201).json({ attempts: Number(updatedCount) });
    } catch (error) {
        logger.error('خطأ في POST /api/attempts:', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'حدث خطأ.' });
    }
});

module.exports = router;
