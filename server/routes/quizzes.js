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
const router = require("express").Router();
const crypto = require("crypto");
const { Op } = require("sequelize");
const sequelize = require("../models/index");
const Quiz = require("../models/Quiz");
const User = require("../models/User");
const {
  authenticate,
  authenticateOrGuest,
  requireAdmin,
} = require("../middleware/auth");
const {
  validateCreateQuiz,
  validateUpdateQuiz,
  validateRenameSubject,
  validatePagination,
  validateIdParam,
  validateSubjectParam,
} = require("../middleware/validators");
const sendInternalError = require("../utils/errorResponse");
const { getCache, setCache, clearCache } = require("../utils/cache");

function clearQuizzesCache() {
  clearCache();
}

function handleInternalError(req, res, error, context) {
  return sendInternalError(res, error, req, { action: context });
}

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
router.get("/", authenticateOrGuest, validatePagination, async (req, res) => {
  try {
    const { subject, active } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const viewerRole = req.user?.role || "guest";
    const isRestrictedViewer = viewerRole !== "admin";
    const cacheKey = `quizzes:${viewerRole}:${subject || "all"}:${active || "all"}:${page}:${limit}`;

    const cachedResponse = getCache(cacheKey);
    if (cachedResponse) {
        return res.json(cachedResponse);
    }

    const where = {};

    if (isRestrictedViewer) {
      where.isActive = true;
    } else if (active !== undefined) {
      where.isActive = active === "true";
    }

    if (subject && subject !== "الكل") {
      where.subject = subject;
    }

    const { count, rows: quizzes } = await Quiz.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [{ model: User, as: "creator", attributes: ["fname", "lname"] }],
      limit,
      offset,
    });

    // للطلاب: إخفاء التبريرات والأجوبة الصحيحة لمنع الغش (يتم التقييم في الخادم)
    if (isRestrictedViewer) {
      const sanitized = quizzes.map((quiz) => {
        const q = quiz.toJSON();
        q.questions = q.questions.map((question) => ({
          ...question,
          answerOptions: question.answerOptions.map((opt) => ({
            text: opt.text,
          })),
        }));
        return q;
      });
      const payload = {
        data: sanitized,
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
      };
      setCache(cacheKey, payload, 60);
      return res.json(payload);
    }

    const payload = {
      data: quizzes,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    };
    setCache(cacheKey, payload, 60);
    res.json(payload);
  } catch (error) {
    return handleInternalError(req, res, error, "GET /api/quizzes failed");
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
router.get("/subjects/list", authenticate, async (req, res) => {
  try {
    const results = await Quiz.findAll({
      attributes: [
        [sequelize.fn("DISTINCT", sequelize.col("subject")), "subject"],
      ],
      raw: true,
      limit: 100,
    });
    const subjects = results.map((r) => r.subject);
    res.json(subjects);
  } catch (error) {
    return handleInternalError(req, res, error, "GET /api/quizzes/subjects/list failed");
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
router.put(
  "/subject/rename",
  authenticate,
  requireAdmin,
  validateRenameSubject,
  async (req, res) => {
    try {
      const { oldName, newName } = req.body;

      const [affectedCount] = await Quiz.update(
        { subject: newName },
        { where: { subject: oldName } },
      );
      clearQuizzesCache();

      res.json({
        message: `تم تعديل اسم المادة من "${oldName}" إلى "${newName}".`,
        modifiedCount: affectedCount,
      });
    } catch (error) {
      return handleInternalError(req, res, error, "PUT /api/quizzes/subject/rename failed");
    }
  },
);

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
router.delete(
  "/subject/:name",
  authenticate,
  requireAdmin,
  validateSubjectParam,
  async (req, res) => {
    try {
      const subjectName = decodeURIComponent(req.params.name);
      const deletedCount = await Quiz.destroy({
        where: { subject: subjectName },
      });
      clearQuizzesCache();

      res.json({
        message: `تم حذف مجلد "${subjectName}" وجميع امتحاناته.`,
        deletedCount,
      });
    } catch (error) {
      return handleInternalError(req, res, error, "DELETE /api/quizzes/subject/:name failed");
    }
  },
);

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
router.get("/:id", authenticate, validateIdParam, async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id, {
      include: [{ model: User, as: "creator", attributes: ["fname", "lname"] }],
    });

    if (!quiz) {
      return res.status(404).json({ error: "الامتحان غير موجود." });
    }

    if (req.user.role === "student") {
      const q = quiz.toJSON();
      q.questions = q.questions.map((question) => ({
        ...question,
        answerOptions: question.answerOptions.map((opt) => ({
          text: opt.text,
        })),
      }));
      return res.json(q);
    }

    res.json(quiz);
  } catch (error) {
    return handleInternalError(req, res, error, "GET /api/quizzes/:id failed");
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
router.post(
  "/",
  authenticate,
  requireAdmin,
  validateCreateQuiz,
  async (req, res) => {
    try {
      const {
        title,
        subject,
        description,
        timeLimit,
        closingMessage,
        streakGoal,
        feedback,
        questions,
      } = req.body;

      // تحقق من عدم وجود امتحان بنفس العنوان
      const existingQuiz = await Quiz.findOne({ where: { title } });
      if (existingQuiz) {
        return res
          .status(409)
          .json({
            error: "يوجد بالفعل امتحان بهذا العنوان. يرجى اختيار عنوان مختلف.",
          });
      }

      // التحقق من أن questions هي array صحيح وتحتوي على عناصر
      if (!Array.isArray(questions) || questions.length === 0) {
        return res
          .status(400)
          .json({ error: "يجب توفير سؤال واحد على الأقل." });
      }
      if (questions.length > 200) {
        return res
          .status(400)
          .json({ error: "الحد الأقصى للأسئلة هو 200 سؤال." });
      }

      // التحقق من صحة كل سؤال + إضافة ID فريد
      const processedQuestions = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question || !q.question.trim()) {
          return res.status(400).json({ error: `السؤال رقم ${i + 1} فارغ.` });
        }
        if (!q.answerOptions || q.answerOptions.length < 2) {
          return res
            .status(400)
            .json({ error: `السؤال رقم ${i + 1} يحتاج خيارين على الأقل.` });
        }
        const hasCorrect = q.answerOptions.some((opt) => opt.isCorrect);
        if (!hasCorrect) {
          return res
            .status(400)
            .json({ error: `السؤال رقم ${i + 1} ليس له إجابة صحيحة محددة.` });
        }

        processedQuestions.push({
          id: q.id || crypto.randomUUID(), // إضافة ID فريد لكل سؤال
          question: q.question,
          hint: q.hint || "",
          answerOptions: q.answerOptions.map((opt) => ({
            text: opt.text,
            isCorrect: !!opt.isCorrect,
            rationale: opt.rationale || "",
          })),
        });
      }

      const quiz = await Quiz.create({
        title,
        subject,
        description: description || "",
        timeLimit: timeLimit || 1800,
        closingMessage: closingMessage || "شكراً لمشاركتك في الاختبار!",
        streakGoal: streakGoal || 3,
        feedback: feedback || {},
        questions: processedQuestions,
        createdBy: req.user.id,
      });
      clearQuizzesCache();

      res.status(201).json({
        message: "تم إنشاء الامتحان بنجاح!",
        quiz,
      });
    } catch (error) {
      return handleInternalError(req, res, error, "POST /api/quizzes failed");
    }
  },
);

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
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validateUpdateQuiz,
  async (req, res) => {
    try {
      const quiz = await Quiz.findByPk(req.params.id);
      if (!quiz) {
        return res.status(404).json({ error: "الامتحان غير موجود." });
      }

      if (quiz.createdBy && quiz.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ error: "غير مصرح لك بتعديل امتحان أنشأه أدمن آخر." });
      }

      // DTO (Object نقل البيانات) مع التحقق الصارم من الأنواع
      const safeUpdateData = {
        title: typeof req.body.title === 'string' ? req.body.title.trim() : undefined,
        description: typeof req.body.description === 'string' ? req.body.description.trim() : undefined,
        subject: typeof req.body.subject === 'string' ? req.body.subject.trim() : undefined,
        timeLimit: typeof req.body.timeLimit === 'number' ? req.body.timeLimit : undefined,
        isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : undefined,
        streakGoal: typeof req.body.streakGoal === 'number' ? req.body.streakGoal : undefined,
        feedback: req.body.feedback && typeof req.body.feedback === 'object' && !Array.isArray(req.body.feedback)
          ? req.body.feedback
          : undefined,
        closingMessage: typeof req.body.closingMessage === 'string' ? req.body.closingMessage.trim() : undefined
      };

      // حذف الحقول غير المعرفة لتجنب التحديث غير الضروري
      Object.keys(safeUpdateData).forEach(key => 
        safeUpdateData[key] === undefined && delete safeUpdateData[key]
      );

      if (req.body.questions && Array.isArray(req.body.questions)) {
        safeUpdateData.questions = req.body.questions.map((q) => ({
          id: q.id || crypto.randomUUID(),
          question: typeof q.question === 'string' ? q.question.trim() : '',
          hint: typeof q.hint === 'string' ? q.hint.trim() : '',
          answerOptions: Array.isArray(q.answerOptions) ? q.answerOptions.map((opt) => ({
            text: typeof opt.text === 'string' ? opt.text.trim() : '',
            isCorrect: !!opt.isCorrect,
            rationale: typeof opt.rationale === 'string' ? opt.rationale.trim() : ''
          })) : []
        }));
      }

      Object.assign(quiz, safeUpdateData);

      // Sequelize يحتاج changed() للـ JSON columns
      quiz.changed("questions", true);
      quiz.changed("feedback", true);
      await quiz.save();
      clearQuizzesCache();

      res.json({
        message: "تم تحديث الامتحان بنجاح!",
        quiz,
      });
    } catch (error) {
      return handleInternalError(req, res, error, "PUT /api/quizzes/:id failed");
    }
  },
);

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
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  validateIdParam,
  async (req, res) => {
    try {
      const quiz = await Quiz.findByPk(req.params.id);
      if (!quiz) {
        return res.status(404).json({ error: "الامتحان غير موجود." });
      }

      if (quiz.createdBy && quiz.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ error: "غير مصرح لك بحذف امتحان أنشأه أدمن آخر." });
      }

      await quiz.destroy();
      clearQuizzesCache();
      res.json({ message: "تم حذف الامتحان بنجاح." });
    } catch (error) {
      return handleInternalError(req, res, error, "DELETE /api/quizzes/:id failed");
    }
  },
);

module.exports = router;
