/**
 * @file Request validation middleware using express-validator
 * @description Provides validation chains for all API endpoints: auth, quizzes, scores, notes,
 *   and pagination. Each validator array ends with a `validate` middleware that returns 400
 *   on validation failure.
 * @module middleware/validators
 */

// ============================================
//   Input Validation — express-validator
// ============================================
const { body, param, query, validationResult } = require("express-validator");
const { z } = require("zod");

const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,120}$/;

const quizFeedbackSchema = z
  .record(z.string().trim().min(1).max(500))
  .refine((obj) => Object.keys(obj).length <= 30, {
    message: "feedback يحتوي على عدد مفاتيح أكبر من المسموح.",
  });

const safeHttpUrl = z.string().trim().url().refine((value) => {
  try {
    const parsed = new URL(value);
    const scheme = parsed.protocol.toLowerCase();
    return scheme === "http:" || scheme === "https:";
  } catch {
    return false;
  }
}, "رابط غير صالح. يجب أن يبدأ بـ https:// أو http://");

function formatZodErrors(issues) {
  return issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));
}

function validateZodBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      const details = formatZodErrors(parsed.error.issues);
      return res.status(400).json({
        error: details[0]?.message || "بيانات الطلب غير صالحة.",
        details,
      });
    }
    req.body = parsed.data;
    next();
  };
}

/**
 * Express middleware that checks for validation errors from express-validator chains.
 * Returns a 400 response with the first error message and full details if validation fails.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

/**
 * Validation chain for Google OAuth login.
 * Validates `idToken` in the request body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateGoogleLogin = [
  validateZodBody(
    z
      .object({
        idToken: z.string().trim().min(10).max(4096),
        deviceId: z.string().regex(DEVICE_ID_REGEX),
        deviceName: z.string().trim().max(120).optional(),
        securityConsent: z
          .union([z.boolean(), z.literal("true")])
          .transform((v) => v === true || v === "true")
          .refine((v) => v === true, {
            message: "يجب الموافقة على سياسة الأمان والخصوصية قبل المتابعة.",
          }),
        consentVersion: z.string().trim().min(1).max(40).optional(),
        consentTs: z
          .string()
          .datetime({ offset: true })
          .or(z.string().datetime())
          .optional(),
      })
      .strict(),
  ),
  validate,
];

/**
 * Validation chain for completing a user profile.
 * Validates `fname` and `lname` in the request body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateCompleteProfile = [
  body("fname")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("الاسم الأول يجب أن يكون بين 2-50 حرف.")
    .matches(/^[\u0600-\u06FFa-zA-Z\s]+$/)
    .withMessage("الاسم يحتوي على حروف فقط."),
  body("lname")
    .trim()
    .isLength({ min: 0, max: 50 })
    .withMessage("الاسم الثاني (اختياري) حتى 50 حرف.")
    .optional({ checkFalsy: true })
    .matches(/^[\u0600-\u06FFa-zA-Z\s]*$/)
    .withMessage("الاسم يحتوي على حروف فقط."),
  validate,
];

/**
 * Validation chain for creating an admin account.
 * Validates `email`, `fname`, and `lname` in the request body.
 * NOTE: Authorization is now enforced via middleware (authenticate + requireAdmin).
 * The `adminSecret` field is no longer used (deprecated as of security hardening).
 * @type {Array<import('express').RequestHandler>}
 */
const validateCreateAdmin = [
  body("email")
    .isEmail()
    .withMessage("بريد إلكتروني غير صالح.")
    .normalizeEmail(),
  body("fname")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("الاسم الأول مطلوب."),
  body("lname")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("الاسم الثاني مطلوب."),
  validate,
];

/**
 * Validation chain for creating a new quiz.
 * Validates `title`, `subject`, `questions` (including deep structure), and optional `timeLimit`.
 * @type {Array<import('express').RequestHandler>}
 */
const validateCreateQuiz = [
  validateZodBody(
    z
      .object({
        title: z.string().trim().min(1).max(255),
        subject: z.string().trim().min(1).max(100),
        description: z.string().trim().max(3000).optional(),
        timeLimit: z.number().int().min(60).max(7200).optional(),
        closingMessage: z.string().trim().max(1000).optional(),
        streakGoal: z.number().int().min(1).max(365).optional(),
        feedback: quizFeedbackSchema.optional(),
        questions: z
          .array(
            z
              .object({
                id: z.string().uuid().optional(),
                question: z.string().trim().min(1).max(2000),
                hint: z.string().trim().max(1000).optional(),
                answerOptions: z
                  .array(
                    z
                      .object({
                        text: z.string().trim().min(1).max(500),
                        isCorrect: z.boolean(),
                        rationale: z.string().trim().max(1000).optional(),
                      })
                      .strict(),
                  )
                  .min(2)
                  .max(6),
              })
              .strict()
              .superRefine((question, ctx) => {
                if (!question.answerOptions.some((opt) => opt.isCorrect)) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "كل سؤال يجب أن يحتوي على إجابة صحيحة واحدة على الأقل.",
                    path: ["answerOptions"],
                  });
                }
              }),
          )
          .min(1)
          .max(200),
      })
      .strict(),
  ),
  validate,
];

/**
 * Validation chain for updating an existing quiz.
 * Validates `id` param and optional `title`, `subject`, `timeLimit` in the body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateUpdateQuiz = [
  param("id").isInt().withMessage("معرّف الامتحان غير صالح."),
  validateZodBody(
    z
      .object({
        title: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(3000).optional(),
        subject: z.string().trim().min(1).max(100).optional(),
        timeLimit: z.number().int().min(60).max(7200).optional(),
        isActive: z.boolean().optional(),
        streakGoal: z.number().int().min(1).max(365).optional(),
        closingMessage: z.string().trim().max(1000).optional(),
        feedback: quizFeedbackSchema.optional(),
        questions: z
          .array(
            z
              .object({
                id: z.string().uuid().optional(),
                question: z.string().trim().min(1).max(2000),
                hint: z.string().trim().max(1000).optional(),
                answerOptions: z
                  .array(
                    z
                      .object({
                        text: z.string().trim().min(1).max(500),
                        isCorrect: z.boolean(),
                        rationale: z.string().trim().max(1000).optional(),
                      })
                      .strict(),
                  )
                  .min(2)
                  .max(6),
              })
              .strict()
              .superRefine((question, ctx) => {
                if (!question.answerOptions.some((opt) => opt.isCorrect)) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "كل سؤال يجب أن يحتوي على إجابة صحيحة واحدة على الأقل.",
                    path: ["answerOptions"],
                  });
                }
              }),
          )
          .min(1)
          .max(200)
          .optional(),
      })
      .strict()
      .refine((payload) => Object.keys(payload).length > 0, {
        message: "لا توجد حقول صالحة للتحديث.",
      }),
  ),
  validate,
];

/**
 * Validation chain for renaming a subject across quizzes.
 * Validates `oldName` and `newName` in the request body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateRenameSubject = [
  body("oldName").trim().notEmpty().withMessage("الاسم القديم مطلوب."),
  body("newName")
    .trim()
    .notEmpty()
    .withMessage("الاسم الجديد مطلوب.")
    .isLength({ max: 100 })
    .withMessage("اسم المادة طويل جداً."),
  validate,
];

/**
 * Validation chain for submitting quiz answers.
 * Validates `quizId`, `answers`, and optional `timeTaken`.
 * @type {Array<import('express').RequestHandler>}
 */
const validateSubmitScore = [
  validateZodBody(
    z
      .object({
        quizId: z.coerce.number().int().positive(),
        answers: z
          .array(
            z
              .object({
                questionId: z.string().uuid("معرّف السؤال غير صالح."),
                selectedIndex: z.number().int().min(0).max(5),
              })
              .strict(),
          )
          .min(1)
          .max(200),
        timeTaken: z.number().int().min(0).max(86400).optional(),
      })
      .strict(),
  ),
  validate,
];

/**
 * Validation chain for creating a new note.
 * Validates `title`, `subject`, `link`, and optional `type`.
 * @type {Array<import('express').RequestHandler>}
 */
const validateCreateNote = [
  validateZodBody(
    z
      .object({
        title: z.string().trim().min(1).max(255),
        subject: z.string().trim().min(1).max(100),
        link: safeHttpUrl,
        type: z.enum(["pdf", "ppt", "link"]).optional(),
        description: z.string().trim().max(2000).optional(),
      })
      .strict(),
  ),
  validate,
];

/**
 * Validation chain for updating an existing note.
 * Validates `id` param and optional `link` in the body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateUpdateNote = [
  param("id").isInt().withMessage("معرّف المذكرة غير صالح."),
  validateZodBody(
    z
      .object({
        title: z.string().trim().min(1).max(255).optional(),
        subject: z.string().trim().min(1).max(100).optional(),
        link: safeHttpUrl.optional(),
        type: z.enum(["pdf", "ppt", "link"]).optional(),
        description: z.string().trim().max(2000).optional(),
      })
      .strict()
      .refine((payload) => Object.keys(payload).length > 0, {
        message: "لا توجد حقول صالحة للتحديث.",
      }),
  ),
  validate,
];

/**
 * Validation schema for saving quiz progress.
 * Allows strict payload only and rejects unknown fields.
 */
const validateProgressSchema = [
  validateZodBody(
    z
      .object({
        quizId: z.union([
          z.number().int().positive(),
          z.string().regex(/^\d+$/).transform((v) => Number(v)),
        ]),
        answers: z
          .array(
            z
              .object({
                questionId: z.string().uuid(),
                selectedIndex: z.number().int().min(0).max(5),
              })
              .strict(),
          )
          .max(200),
        timeRemaining: z.number().int().min(0).max(7200),
        currentQuestionIndex: z.number().int().min(0).max(199),
        deviceId: z.string().regex(DEVICE_ID_REGEX).optional(),
      })
      .strict(),
  ),
  validate,
];

/**
 * Validation for attempts query (quizId required, optional admin email).
 */
const validateAttemptsQuery = [
  query("quizId")
    .exists({ checkFalsy: true })
    .withMessage("quizId مطلوب.")
    .isInt({ min: 1 })
    .withMessage("معرّف الامتحان غير صالح."),
  query("email")
    .optional()
    .isEmail()
    .withMessage("البريد الإلكتروني غير صالح.")
    .isLength({ max: 255 })
    .withMessage("البريد الإلكتروني طويل جداً."),
  validate,
];

/**
 * Validation for legacy attempts placeholder creation.
 */
const validateAttemptPlaceholder = [
  body("quizId")
    .exists({ checkFalsy: true })
    .withMessage("quizId مطلوب")
    .isInt({ min: 1 })
    .withMessage("معرّف الامتحان غير صالح."),
  body("email")
    .optional()
    .isEmail()
    .withMessage("البريد الإلكتروني غير صالح.")
    .isLength({ max: 255 })
    .withMessage("البريد الإلكتروني طويل جداً."),
  validate,
];

/**
 * Validation for quiz progress path parameter.
 */
const validateQuizProgressParam = [
  param("quizId").isInt({ min: 1 }).withMessage("معرّف الامتحان غير صالح."),
  validate,
];

/**
 * Validation for scores attempts summary query.
 */
const validateScoresAttemptsQuery = [
  query("quizId")
    .exists({ checkFalsy: true })
    .withMessage("quizId مطلوب.")
    .isInt({ min: 1 })
    .withMessage("معرّف الامتحان غير صالح."),
  query("email")
    .optional()
    .isEmail()
    .withMessage("البريد الإلكتروني غير صالح.")
    .isLength({ max: 255 })
    .withMessage("البريد الإلكتروني طويل جداً."),
  validate,
];

/**
 * Validation chain for paginated list endpoints.
 * Validates optional `page` and `limit` query parameters.
 * @type {Array<import('express').RequestHandler>}
 */
const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("رقم الصفحة غير صالح."),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("حد النتائج بين 1-100."),
  validate,
];

/**
 * Validation for ID param in routes like DELETE /quizzes/:id, DELETE /scores/:id, DELETE /notes/:id
 * @type {Array<import('express').RequestHandler>}
 */
const validateIdParam = [
  param("id").isInt({ min: 1 }).withMessage("معرّف غير صالح."),
  validate,
];

/**
 * Validation for subject name param in DELETE /quizzes/subject/:name
 * @type {Array<import('express').RequestHandler>}
 */
const validateSubjectParam = [
  param("name")
    .trim()
    .notEmpty()
    .withMessage("اسم المادة مطلوب.")
    .isLength({ max: 100 })
    .withMessage("اسم المادة طويل جداً."),
  validate,
];

/**
 * Validation for quizId param in GET /scores/quiz/:quizId
 * @type {Array<import('express').RequestHandler>}
 */
const validateQuizIdParam = [
  param("quizId").isInt({ min: 1 }).withMessage("معرّف الامتحان غير صالح."),
  validate,
];

module.exports = {
  validate,
  validateGoogleLogin,
  validateCompleteProfile,
  validateCreateAdmin,
  validateCreateQuiz,
  validateUpdateQuiz,
  validateRenameSubject,
  validateSubmitScore,
  validateCreateNote,
  validateUpdateNote,
  validateProgressSchema,
  validateAttemptsQuery,
  validateAttemptPlaceholder,
  validateQuizProgressParam,
  validateScoresAttemptsQuery,
  validatePagination,
  validateIdParam,
  validateSubjectParam,
  validateQuizIdParam,
};
