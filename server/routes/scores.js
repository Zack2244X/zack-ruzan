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
const router = require("express").Router();
const scoresController = require("../controllers/scoresController");
const scoresService = require("../services/scoresService");

const sequelize = require("../models/index");
const Score = require("../models/Score");
const Quiz = require("../models/Quiz");
const User = require("../models/User");
const {
  authenticate,
  authenticateOrGuest,
  requireAdmin,
} = require("../middleware/auth");
const {
  validateSubmitScore,
  validatePagination,
  validateIdParam,
  validateQuizIdParam,
  validateScoresAttemptsQuery,
} = require("../middleware/validators");
const logger = require("../utils/logger");
const sendInternalError = require("../utils/errorResponse");

function handleInternalError(req, res, error, context) {
  return sendInternalError(res, error, req, { action: context });
}

const rejectGuestScoreSubmission = (req, res, next) => {
  if (String(req.headers["x-guest-mode"] || "").toLowerCase() === "true") {
    return res.status(403).json({
      error: "وضع الضيف مخصص للقراءة فقط. سجّل دخولك لإرسال الدرجات.",
    });
  }
  return next();
};

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
 * @access Private — authenticated users only.
 * @param {import('express').Request}  req - body: { quizId, answers, timeTaken? }
 * @param {import('express').Response} res - { message, result, details, meta }
 * @returns {Promise<void>}
 */
router.post(
  "/",
  rejectGuestScoreSubmission,
  authenticate,
  validateSubmitScore,
  async (req, res) => {
    try {
      const { quizId, answers, timeTaken } = req.body;

      // 1. جلب الامتحان
      const quiz = await Quiz.findByPk(quizId);
      if (!quiz) {
        return res.status(404).json({ error: "الامتحان غير موجود." });
      }

      // 2. حساب الدرجة في السيرفر (منع الغش)
      let correctCount = 0;
      const gradedAnswers = [];
      const questions = quiz.questions; // JSON array

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "الامتحان لا يحتوي على أسئلة صالحة للتصحيح." });
      }
      if (answers.length > questions.length) {
        return res.status(400).json({ error: "عدد الإجابات يتجاوز عدد أسئلة الامتحان." });
      }

      const questionMap = new Map(questions.map((q) => [String(q.id), q]));
      const seenQuestionIds = new Set();

      for (const answer of answers) {
        const questionId = String(answer.questionId);
        if (!questionMap.has(questionId)) {
          return res.status(400).json({ error: "توجد إجابة لسؤال غير موجود في الامتحان." });
        }
        if (seenQuestionIds.has(questionId)) {
          return res.status(400).json({ error: "لا يمكن إرسال إجابتين للسؤال نفسه." });
        }

        const question = questionMap.get(questionId);
        if (
          answer.selectedIndex < 0 ||
          answer.selectedIndex >= (question.answerOptions || []).length
        ) {
          return res.status(400).json({ error: "خيار إجابة غير صالح لأحد الأسئلة." });
        }

        seenQuestionIds.add(questionId);
      }

      for (const answer of answers) {
        const question = questionMap.get(String(answer.questionId));

        const selectedOption = question.answerOptions[answer.selectedIndex];
        const isCorrect = selectedOption ? selectedOption.isCorrect : false;

        if (isCorrect) correctCount++;

        gradedAnswers.push({
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          isCorrect,
        });
      }

      // SECURITY: delegate to atomic service implementation to avoid duplicate race logic.
      const {
        attemptNumber,
        isOfficial,
      } = await scoresService.createAttempt(req.user.id, quizId, {
        answers: gradedAnswers,
        score: correctCount,
        total: questions.length,
        timeTaken: timeTaken || 0,
      });

      logger.info(
        `[Score] userId=${req.user.id} quizId=${quizId}` +
          ` attempt=${attemptNumber} isOfficial=${isOfficial}` +
          ` score=${correctCount}/${questions.length}`,
      );

      // 5. بناء التفاصيل للرد
      const detailedResults = questions.map((q) => {
        const studentAnswer = gradedAnswers.find((a) => a.questionId === q.id);
        return {
          question: q.question,
          hint: q.hint,
          options: q.answerOptions,
          selectedIndex: studentAnswer ? studentAnswer.selectedIndex : -1,
          isCorrect: studentAnswer ? studentAnswer.isCorrect : false,
        };
      });


      res.status(201).json({
        message: isOfficial
          ? "تم تسليم الامتحان بنجاح! تم احتساب نتيجتك في لوحة الشرف."
          : `تم تسليم المحاولة التدريبية رقم ${attemptNumber} بنجاح. لن تؤثر على لوحة الشرف.`,
        result: {
          score: correctCount,
          total: questions.length,
          percentage: Math.round((correctCount / questions.length) * 100),
          closingMessage: quiz.closingMessage,
        },
        // meta تُستهلك بواسطة quiz.js لعرض لافتة النتائج
        meta: {
          isOfficial,
          attemptNumber,
        },
        details: detailedResults,
      });
    } catch (error) {
      return handleInternalError(req, res, error, "POST /api/scores failed");
    }
  },
);

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
router.get("/my", authenticate, validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { count, rows: scores } = await Score.findAndCountAll({
      where: { userId: req.user.id },
      include: [{ model: Quiz, as: "quiz", attributes: ["title", "subject"] }],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    res.json({
      data: scores,
      total_count: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    return handleInternalError(req, res, error, "GET /api/scores/my failed");
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
router.get("/my/attempts", authenticate, scoresController.getMyAttemptsCount);

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
router.get("/", authenticate, validateScoresAttemptsQuery, async (req, res) => {
  try {
    const { quizId, email } = req.query;
    const normalizedQuizId = Number(quizId);

    // ── تحديد userId المستهدف ─────────────────────────────────────────
    let targetUserId = req.user.id;

    if (email) {
      // فقط الأدمن يمكنه الاستعلام باستخدام email طالب آخر
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({ error: "غير مصرح. هذه الميزة للأدمن فقط." });
      }

      // البحث عن المستخدم بالإيميل
      const targetUser = await User.findOne({ where: { email } });
      if (!targetUser) {
        return res.status(404).json({ error: "المستخدم غير موجود." });
      }

      targetUserId = targetUser.id;
    }

    // ── عدّ المحاولات باستخدام Score.count ───────────────────────────
    const attempts = await Score.count({
      where: {
        userId: targetUserId,
        quizId: normalizedQuizId,
      },
    });

    logger.info(
      `[GET /api/attempts] userId=${targetUserId}` +
        ` quizId=${quizId}` +
        ` requestedBy=${req.user.id}` +
        ` (${req.user.role})` +
        ` → ${attempts} محاولة`,
    );

    // ── الرد بالعدد ───────────────────────────────────────────────────
    // الشكل { attempts: number } متوافق مع ما تتوقعه دالة getAttempts() في api.js:
    //   const count = Number(data?.attempts) || 0;
    res.json({ attempts });
  } catch (error) {
    return handleInternalError(req, res, error, "GET /api/scores/attempts failed");
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
router.get("/leaderboard", authenticateOrGuest, scoresController.getLeaderboard);

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
router.get(
  "/quiz/:quizId",
  authenticate,
  requireAdmin,
  validateQuizIdParam,
  validatePagination,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const { count, rows: scores } = await Score.findAndCountAll({
        limit,
        offset,
        where: { quizId: req.params.quizId },
        include: [{ model: User, as: "user", attributes: ["fname", "lname"] }],
        order: [
          ["isOfficial", "DESC"], // الرسمية أولاً
          ["percentage", "DESC"],
          ["attemptNumber", "ASC"],
        ],
      });

      const results = scores.map((s) => ({
        userName: s.user ? `${s.user.fname} ${s.user.lname}` : "محذوف",
        score: s.score,
        total: s.total,
        percentage: s.percentage,
        timeTaken: s.timeTaken,
        isOfficial: s.isOfficial,
        attemptNumber: s.attemptNumber,
        date: s.createdAt,
      }));

      res.json({
        data: results,
        total_count: count,
        current_page: page,
        total_pages: Math.ceil(count / limit)
      });
    } catch (error) {
      return handleInternalError(req, res, error, "GET /api/scores/quiz/:quizId failed");
    }
  },
);

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
router.get(
  "/all",
  authenticate,
  requireAdmin,
  validatePagination,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      // فلتر اختياري للأدمن: officialOnly=true
      const where = {};
      if (req.query.officialOnly === "true") {
        where.isOfficial = true;
      }

      const { count, rows: scores } = await Score.findAndCountAll({
        where,
        include: [
          { model: User, as: "user", attributes: ["fname", "lname"] },
          { model: Quiz, as: "quiz", attributes: ["title", "subject"] },
        ],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      const results = scores.map((s) => ({
        userName: s.user ? `${s.user.fname} ${s.user.lname}` : "محذوف",
        quizTitle: s.quiz ? s.quiz.title : "محذوف",
        quizSubject: s.quiz ? s.quiz.subject : "",
        score: s.score,
        total: s.total,
        percentage: s.percentage,
        isOfficial: s.isOfficial,
        attemptNumber: s.attemptNumber,
        date: s.createdAt,
      }));

      res.json({
        data: results,
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
      });
    } catch (error) {
      return handleInternalError(req, res, error, "GET /api/scores/all failed");
    }
  },
);

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
router.get("/stats", authenticate, requireAdmin, async (req, res) => {
  try {
    const [
      totalStudents,
      totalExams,
      totalOfficialScores,
      totalPracticeScores,
      avgResult,
    ] = await Promise.all([
      User.count({ where: { role: "student" } }),
      Quiz.count(),
      Score.count({ where: { isOfficial: true } }),
      Score.count({ where: { isOfficial: false } }),
      // متوسط النسبة يعتمد على المحاولات الرسمية فقط لدقة أعلى
      Score.findAll({
        attributes: [[sequelize.fn("AVG", sequelize.col("percentage")), "avg"]],
        where: { isOfficial: true },
        raw: true,
      }),
    ]);

    res.json({
      totalStudents,
      totalExams,
      totalOfficialScores,
      totalPracticeScores,
      totalScores: totalOfficialScores + totalPracticeScores,
      avgPercentage: avgResult[0]?.avg
        ? Math.round(parseFloat(avgResult[0].avg))
        : 0,
    });
  } catch (error) {
    return handleInternalError(req, res, error, "GET /api/scores/stats failed");
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
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  validateIdParam,
  async (req, res) => {
    try {
      const score = await Score.findByPk(req.params.id);
      if (!score) {
        return res.status(404).json({ error: "النتيجة غير موجودة." });
      }
      await score.destroy();
      if (typeof scoresService.invalidateLeaderboardCache === "function") {
        scoresService.invalidateLeaderboardCache();
      }
      logger.info(`🗑️ حذف نتيجة #${req.params.id} — بواسطة: ${req.user.email}`);
      res.json({ message: "تم حذف النتيجة بنجاح." });
    } catch (error) {
      return handleInternalError(req, res, error, "DELETE /api/scores/:id failed");
    }
  },
);

module.exports = router;
