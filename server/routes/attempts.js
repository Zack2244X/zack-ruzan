const router = require("express").Router();
const Score = require("../models/Score");
const User = require("../models/User");
const QuizProgress = require("../models/QuizProgress");
const Quiz = require("../models/Quiz");
const { authenticate } = require("../middleware/auth");
const {
  validateProgressSchema,
  validateAttemptsQuery,
  validateAttemptPlaceholder,
  validateQuizProgressParam,
} = require("../middleware/validators");
const logger = require("../utils/logger");
const scoresService = require("../services/scoresService");
const sendInternalError = require("../utils/errorResponse");

function handleInternalError(req, res, error, context) {
  return sendInternalError(res, error, req, { action: context });
}

function runAuthenticateInline(req, res) {
  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      res.off("finish", onResponseComplete);
      res.off("close", onResponseComplete);
    };

    const settle = (authenticated) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(authenticated);
    };

    const onResponseComplete = () => settle(false);

    res.once("finish", onResponseComplete);
    res.once("close", onResponseComplete);

    authenticate(req, res, () => settle(true));

    // Fast path when middleware already sent the response synchronously.
    if (res.headersSent) {
      settle(false);
    }
  });
}

// GET /api/attempts?quizId=...(&email=...)
// Allows unauthenticated callers to receive `{ attempts: 0 }` when no credentials
// are present. If credentials exist (cookie or Authorization header) we run
// the regular `authenticate` flow to return the real count. Admin-only
// `email` queries still require successful authentication as an admin.
router.get("/", validateAttemptsQuery, async (req, res) => {
  try {
    const { quizId, email } = req.query;
    const normalizedQuizId = Number(quizId);

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
    // sends a response on failure (401), so abort cleanly when it fails.
    if (hasCookie || hasAuthHeader) {
      const authenticated = await runAuthenticateInline(req, res);
      if (!authenticated || res.headersSent) return;
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
      where: { userId: targetUserId, quizId: normalizedQuizId },
    });
    logger.info(
      `[GET /api/attempts] userId=${targetUserId} quizId=${quizId} requestedBy=${req.user ? req.user.id : "anonymous"}`,
    );
    res.json({ attempts });
  } catch (error) {
    return handleInternalError(req, res, error, "GET /api/attempts failed");
  }
});

// POST /api/attempts { quizId, email? }
// Creates a lightweight placeholder Score representing an attempt (for older clients).
router.post("/", authenticate, validateAttemptPlaceholder, async (req, res) => {
  try {
    const { quizId, email } = req.body || {};
    const normalizedQuizId = Number(quizId);

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
      normalizedQuizId,
      {
        answers: [],
        score: 0,
        total: 0,
        timeTaken: 0,
      },
    );

    const updatedCount = await Score.count({ where: { userId, quizId: normalizedQuizId } });
    logger.info(
      `[POST /api/attempts] recorded placeholder userId=${userId} quizId=${quizId} attempt=${attemptNumber}`,
    );
    res.status(201).json({
      attempts: Number(updatedCount),
      attemptNumber,
      isOfficial,
    });
  } catch (error) {
    return handleInternalError(req, res, error, "POST /api/attempts failed");
  }
});

// GET /api/attempts/progress/:quizId
router.get("/progress/:quizId", authenticate, validateQuizProgressParam, async (req, res) => {
  try {
    const quizId = Number(req.params.quizId);
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
    return handleInternalError(req, res, error, "GET /api/attempts/progress failed");
  }
});

// POST /api/attempts/progress
router.post("/progress", authenticate, validateProgressSchema, async (req, res) => {
  try {
    const { quizId, answers, timeRemaining, currentQuestionIndex, deviceId } =
      req.body;
    const normalizedQuizId = Number(quizId);

    const quiz = await Quiz.findByPk(normalizedQuizId, {
      attributes: ["id", "questions"],
    });
    if (!quiz) {
      return res.status(404).json({ error: "الامتحان غير موجود." });
    }

    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    if (questions.length === 0) {
      return res.status(400).json({ error: "الامتحان لا يحتوي على أسئلة صالحة." });
    }

    const questionMap = new Map(questions.map((q) => [String(q.id), q]));
    for (const answer of answers) {
      const q = questionMap.get(String(answer.questionId));
      if (!q) {
        return res.status(400).json({ error: "توجد إجابة لسؤال غير تابع لهذا الامتحان." });
      }
      if (
        !Array.isArray(q.answerOptions) ||
        answer.selectedIndex < 0 ||
        answer.selectedIndex >= q.answerOptions.length
      ) {
        return res.status(400).json({ error: "قيمة selectedIndex غير صالحة." });
      }
    }

    await QuizProgress.upsert({
      userId: req.user.id,
      deviceId: deviceId || null,
      quizId: normalizedQuizId,
      answers,
      timeRemaining,
      currentQuestionIndex,
    });

    res.json({ message: "تم حفظ التقدم" });
  } catch (error) {
    return handleInternalError(req, res, error, "POST /api/attempts/progress failed");
  }
});

// DELETE /api/attempts/progress/:quizId
router.delete("/progress/:quizId", authenticate, validateQuizProgressParam, async (req, res) => {
  try {
    const quizId = Number(req.params.quizId);
    await QuizProgress.destroy({
      where: {
        quizId,
        userId: req.user.id,
      },
    });
    res.json({ message: "تم الحذف" });
  } catch (error) {
    return handleInternalError(req, res, error, "DELETE /api/attempts/progress failed");
  }
});

module.exports = router;
