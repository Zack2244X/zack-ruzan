const router = require("express").Router();
const { randomUUID } = require("crypto");
const Score = require("../models/Score");
const User = require("../models/User");
const QuizProgress = require("../models/QuizProgress");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");
const scoresService = require("../services/scoresService");
const { buildSanitizedErrorLog } = require("../utils/secureErrorLog");

function handleInternalError(res, error, context) {
  const incidentId = randomUUID();
  logger.error(
    `${context} [incidentId=${incidentId}]`,
    buildSanitizedErrorLog(error, context, incidentId),
  );
  return res.status(500).json({
    error: "حدث خطأ داخلي في الخادم",
    incidentId,
  });
}

// GET /api/attempts?quizId=...(&email=...)
// Allows unauthenticated callers to receive `{ attempts: 0 }` when no credentials
// are present. If credentials exist (cookie or Authorization header) we run
// the regular `authenticate` flow to return the real count. Admin-only
// `email` queries still require successful authentication as an admin.
router.get("/", async (req, res) => {
  try {
    const { quizId, email } = req.query;
    if (!quizId) return res.status(400).json({ error: "quizId مطلوب." });

    // If no credentials provided and no email param, return 0 to avoid
    // noisy 401 errors from unauthenticated clients (client may call
    // this before login completes).
    const hasCookie = Boolean(req.cookies && req.cookies.jwt);
    const hasAuthHeader = Boolean(
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer "),
    );
    if (!hasCookie && !hasAuthHeader && !email) {
      return res.json({ attempts: 0 });
    }

    // If credentials are present, attempt authentication. `authenticate`
    // sends a response on failure (401), so abort if headers were sent.
    if (hasCookie || hasAuthHeader) {
      await new Promise((resolve) => {
        // Call authenticate middleware inline
        const { authenticate } = require("../middleware/auth");
        authenticate(req, res, () => resolve());
      });
      if (res.headersSent) return; // authentication failed and response sent
    }

    // At this point: either req.user is set (authenticated) or email was
    // not provided and we returned early. If email is provided, ensure
    // caller is admin (must be authenticated above).
    let targetUserId;
    if (email) {
      if (!req.user || req.user.role !== "admin")
        return res
          .status(403)
          .json({ error: "غير مصرح. هذه الميزة للأدمن فقط." });
      const targetUser = await User.findOne({ where: { email } });
      if (!targetUser)
        return res.status(404).json({ error: "المستخدم غير موجود." });
      targetUserId = targetUser.id;
    } else {
      // authenticated user's own attempts
      targetUserId = req.user ? req.user.id : null;
      if (!targetUserId) return res.json({ attempts: 0 });
    }

    const attempts = await Score.count({
      where: { userId: targetUserId, quizId: String(quizId) },
    });
    logger.info(
      `[GET /api/attempts] userId=${targetUserId} quizId=${quizId} requestedBy=${req.user ? req.user.id : "anonymous"}`,
    );
    res.json({ attempts });
  } catch (error) {
    return handleInternalError(res, error, "GET /api/attempts failed");
  }
});

// POST /api/attempts { quizId, email? }
// Creates a lightweight placeholder Score representing an attempt (for older clients).
router.post("/", authenticate, async (req, res) => {
  try {
    const { quizId, email } = req.body || {};
    if (!quizId) return res.status(400).json({ error: "quizId مطلوب" });

    let userId = req.user.id;
    if (email) {
      if (req.user.role !== "admin")
        return res.status(403).json({ error: "غير مصرح." });
      const u = await User.findOne({ where: { email } });
      if (!u) return res.status(404).json({ error: "المستخدم غير موجود" });
      userId = u.id;
    }

    const { attemptNumber, isOfficial } = await scoresService.createAttempt(
      userId,
      quizId,
      {
        answers: [],
        score: 0,
        total: 0,
        timeTaken: 0,
      },
    );

    const updatedCount = await Score.count({ where: { userId, quizId } });
    logger.info(
      `[POST /api/attempts] recorded placeholder userId=${userId} quizId=${quizId} attempt=${attemptNumber}`,
    );
    res.status(201).json({
      attempts: Number(updatedCount),
      attemptNumber,
      isOfficial,
    });
  } catch (error) {
    return handleInternalError(res, error, "POST /api/attempts failed");
  }
});

// GET /api/attempts/progress/:quizId
router.get("/progress/:quizId", authenticate, async (req, res) => {
  try {
    const { quizId } = req.params;
    // Security: for authenticated users, never trust deviceId ownership.
    // Future hardening: require HMAC-signed device token for guest linkage.
    const progress = await QuizProgress.findOne({
      where: {
        quizId,
        userId: req.user.id,
      },
      order: [["updatedAt", "DESC"]],
    });
    res.json(
      progress || { answers: [], timeRemaining: null, currentQuestionIndex: 0 },
    );
  } catch (error) {
    return handleInternalError(res, error, "GET /api/attempts/progress failed");
  }
});

// POST /api/attempts/progress
router.post("/progress", authenticate, async (req, res) => {
  try {
    const { quizId, answers, timeRemaining, currentQuestionIndex, deviceId } =
      req.body;
    if (!quizId) return res.status(400).json({ error: "quizId مطلوب" });

    let progress = await QuizProgress.findOne({
      where: {
        quizId,
        userId: req.user.id,
      },
      order: [["updatedAt", "DESC"]],
    });

    if (progress) {
      progress.answers = answers;
      progress.timeRemaining = timeRemaining;
      progress.currentQuestionIndex = currentQuestionIndex;
      progress.userId = req.user.id;
      progress.deviceId = deviceId || progress.deviceId;
      await progress.save();
    } else {
      progress = await QuizProgress.create({
        userId: req.user.id,
        deviceId,
        quizId,
        answers,
        timeRemaining,
        currentQuestionIndex,
      });
    }
    res.json({ message: "تم حفظ التقدم" });
  } catch (error) {
    return handleInternalError(res, error, "POST /api/attempts/progress failed");
  }
});

// DELETE /api/attempts/progress/:quizId
router.delete("/progress/:quizId", authenticate, async (req, res) => {
  try {
    const { quizId } = req.params;
    await QuizProgress.destroy({
      where: {
        quizId,
        userId: req.user.id,
      },
    });
    res.json({ message: "تم الحذف" });
  } catch (error) {
    return handleInternalError(res, error, "DELETE /api/attempts/progress failed");
  }
});

module.exports = router;
