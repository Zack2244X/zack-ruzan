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
const { body, param, query, validationResult } = require('express-validator');

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
            details: errors.array().map(e => ({ field: e.path, message: e.msg }))
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
    body('idToken')
        .isString().withMessage('توكن Google مطلوب.')
        .isLength({ min: 10, max: 4096 }).withMessage('توكن غير صالح.'),
    validate
];

/**
 * Validation chain for completing a user profile.
 * Validates `fname` and `lname` in the request body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateCompleteProfile = [
    body('fname')
        .trim()
        .isLength({ min: 2, max: 50 }).withMessage('الاسم الأول يجب أن يكون بين 2-50 حرف.')
        .matches(/^[\u0600-\u06FFa-zA-Z\s]+$/).withMessage('الاسم يحتوي على حروف فقط.'),
    body('lname')
        .trim()
        .isLength({ min: 2, max: 50 }).withMessage('الاسم الثاني يجب أن يكون بين 2-50 حرف.')
        .matches(/^[\u0600-\u06FFa-zA-Z\s]+$/).withMessage('الاسم يحتوي على حروف فقط.'),
    validate
];

/**
 * Validation chain for creating an admin account.
 * Validates `email`, `fname`, `lname`, and `adminSecret` in the request body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateCreateAdmin = [
    body('email').isEmail().withMessage('بريد إلكتروني غير صالح.').normalizeEmail(),
    body('fname').trim().isLength({ min: 2, max: 50 }).withMessage('الاسم الأول مطلوب.'),
    body('lname').trim().isLength({ min: 2, max: 50 }).withMessage('الاسم الثاني مطلوب.'),
    body('adminSecret').isString().withMessage('كلمة السر السرية مطلوبة.'),
    validate
];

/**
 * Validation chain for creating a new quiz.
 * Validates `title`, `subject`, `questions` (including deep structure), and optional `timeLimit`.
 * @type {Array<import('express').RequestHandler>}
 */
const validateCreateQuiz = [
    body('title').trim().notEmpty().withMessage('عنوان الامتحان مطلوب.')
        .isLength({ max: 255 }).withMessage('العنوان طويل جداً.'),
    body('subject').trim().notEmpty().withMessage('المادة مطلوبة.')
        .isLength({ max: 100 }).withMessage('اسم المادة طويل جداً.'),
    body('questions').isArray({ min: 1, max: 200 }).withMessage('يجب إضافة سؤال واحد على الأقل (الحد الأقصى 200).'),
    // Deep validation — each question
    body('questions.*.text')
        .trim().notEmpty().withMessage('نص كل سؤال مطلوب.')
        .isLength({ max: 2000 }).withMessage('نص السؤال طويل جداً (الحد 2000 حرف).'),
    body('questions.*.answerOptions')
        .isArray({ min: 2, max: 6 }).withMessage('كل سؤال يجب أن يحتوي على خيارين على الأقل (الحد الأقصى 6).'),
    body('questions.*.answerOptions.*.text')
        .trim().notEmpty().withMessage('نص كل خيار مطلوب.')
        .isLength({ max: 500 }).withMessage('نص الخيار طويل جداً.'),
    body('questions.*.correctAnswer')
        .isInt({ min: 0, max: 5 }).withMessage('الإجابة الصحيحة يجب أن تكون رقماً بين 0 و 5.'),
    body('timeLimit').optional().isInt({ min: 60, max: 7200 }).withMessage('المدة بين 1-120 دقيقة.'),
    validate
];

/**
 * Validation chain for updating an existing quiz.
 * Validates `id` param and optional `title`, `subject`, `timeLimit` in the body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateUpdateQuiz = [
    param('id').isInt().withMessage('معرّف الامتحان غير صالح.'),
    body('title').optional().trim().isLength({ max: 255 }),
    body('subject').optional().trim().isLength({ max: 100 }),
    body('timeLimit').optional().isInt({ min: 60, max: 7200 }),
    validate
];

/**
 * Validation chain for renaming a subject across quizzes.
 * Validates `oldName` and `newName` in the request body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateRenameSubject = [
    body('oldName').trim().notEmpty().withMessage('الاسم القديم مطلوب.'),
    body('newName').trim().notEmpty().withMessage('الاسم الجديد مطلوب.')
        .isLength({ max: 100 }).withMessage('اسم المادة طويل جداً.'),
    validate
];

/**
 * Validation chain for submitting quiz answers.
 * Validates `quizId`, `answers`, and optional `timeTaken`.
 * @type {Array<import('express').RequestHandler>}
 */
const validateSubmitScore = [
    body('quizId').notEmpty().withMessage('معرّف الامتحان مطلوب.'),
    body('answers').isArray({ min: 1 }).withMessage('الإجابات مطلوبة.'),
    body('timeTaken').optional().isInt({ min: 0 }),
    validate
];

/**
 * Validation chain for creating a new note.
 * Validates `title`, `subject`, `link`, and optional `type`.
 * @type {Array<import('express').RequestHandler>}
 */
const validateCreateNote = [
    body('title').trim().notEmpty().withMessage('العنوان مطلوب.')
        .isLength({ max: 255 }).withMessage('العنوان طويل جداً.'),
    body('subject').trim().notEmpty().withMessage('المادة مطلوبة.')
        .isLength({ max: 100 }),
    body('link').trim().notEmpty().withMessage('الرابط مطلوب.')
        .isURL({ protocols: ['https', 'http'], require_protocol: true }).withMessage('رابط غير صالح. يجب أن يبدأ بـ https://')
        .custom((val) => {
            if (val.toLowerCase().startsWith('javascript:') || val.toLowerCase().startsWith('data:')) {
                throw new Error('رابط غير مسموح.');
            }
            return true;
        }),
    body('type').optional().isIn(['pdf', 'ppt', 'link']).withMessage('نوع الملف غير مدعوم.'),
    validate
];

/**
 * Validation chain for updating an existing note.
 * Validates `id` param and optional `link` in the body.
 * @type {Array<import('express').RequestHandler>}
 */
const validateUpdateNote = [
    param('id').isInt().withMessage('معرّف المذكرة غير صالح.'),
    body('link').optional().isURL({ protocols: ['https', 'http'], require_protocol: true })
        .withMessage('رابط غير صالح.'),
    validate
];

/**
 * Validation chain for paginated list endpoints.
 * Validates optional `page` and `limit` query parameters.
 * @type {Array<import('express').RequestHandler>}
 */
const validatePagination = [
    query('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صالح.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('حد النتائج بين 1-100.'),
    validate
];

/**
 * Validation for ID param in routes like DELETE /quizzes/:id, DELETE /scores/:id, DELETE /notes/:id
 * @type {Array<import('express').RequestHandler>}
 */
const validateIdParam = [
    param('id').isInt({ min: 1 }).withMessage('معرّف غير صالح.'),
    validate
];

/**
 * Validation for subject name param in DELETE /quizzes/subject/:name
 * @type {Array<import('express').RequestHandler>}
 */
const validateSubjectParam = [
    param('name').trim().notEmpty().withMessage('اسم المادة مطلوب.')
        .isLength({ max: 100 }).withMessage('اسم المادة طويل جداً.'),
    validate
];

/**
 * Validation for quizId param in GET /scores/quiz/:quizId
 * @type {Array<import('express').RequestHandler>}
 */
const validateQuizIdParam = [
    param('quizId').isInt({ min: 1 }).withMessage('معرّف الامتحان غير صالح.'),
    validate
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
    validatePagination,
    validateIdParam,
    validateSubjectParam,
    validateQuizIdParam
};
