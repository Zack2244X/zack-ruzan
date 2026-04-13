/**
 * @file Notes CRUD routes
 * @description Express router for managing educational notes/resources.
 *   Students can view notes; admins can create, update, and delete them.
 * @module routes/notes
 */

// ============================================
//   مسارات المذكرات والملفات (CRUD)
//   — Sequelize + TiDB —
// ============================================
const router = require("express").Router();
const { randomUUID } = require("crypto");
const sequelize = require("../models/index");
const Note = require("../models/Note");
const User = require("../models/User");
const {
  authenticate,
  authenticateOrGuest,
  requireAdmin,
} = require("../middleware/auth");
const {
  validateCreateNote,
  validateUpdateNote,
  validatePagination,
  validateIdParam,
} = require("../middleware/validators");
const logger = require("../utils/logger");

function handleInternalError(res, error, context) {
  const incidentId = randomUUID();
  logger.error(`${context} [incidentId=${incidentId}]`, {
    incidentId,
    message: error.message,
    stack: error.stack,
    sql: error.sql || null,
    dbMessage: error.original?.message || error.parent?.message || null,
  });
  return res.status(500).json({
    error: "Internal Server Error",
    incidentId,
  });
}

// ============================================
//   GET /api/notes — جلب كل المذكرات
// ============================================
/**
 * @route GET /api/notes
 * @description Retrieves a paginated list of notes, optionally filtered by subject.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with optional `subject`, `page`, `limit` query params.
 * @param {import('express').Response} res - Express response with `{ data, total, page, totalPages }`.
 * @returns {Promise<void>}
 */
router.get("/", authenticateOrGuest, validatePagination, async (req, res) => {
  try {
    const { subject } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const where = {};

    if (subject && subject !== "الكل") {
      where.subject = subject;
    }

    const { count, rows: notes } = await Note.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [{ model: User, as: "creator", attributes: ["fname", "lname"] }],
      limit,
      offset,
    });

    res.json({
      data: notes,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    return handleInternalError(res, error, "GET /api/notes failed");
  }
});

// ============================================
//   GET /api/notes/subjects/list — قائمة مواد المذكرات
// ============================================
/**
 * @route GET /api/notes/subjects/list
 * @description Returns a list of distinct subject names from all notes.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with an array of subject strings.
 * @returns {Promise<void>}
 */
router.get("/subjects/list", authenticate, async (req, res) => {
  try {
    const results = await Note.findAll({
      attributes: [
        [sequelize.fn("DISTINCT", sequelize.col("subject")), "subject"],
      ],
      raw: true,
      limit: 100,
    });
    const subjects = results.map((r) => r.subject);
    res.json(subjects);
  } catch (error) {
    return handleInternalError(res, error, "GET /api/notes/subjects/list failed");
  }
});

// ============================================
//   GET /api/notes/:id — جلب مذكرة واحدة
// ============================================
/**
 * @route GET /api/notes/:id
 * @description Retrieves a single note by its ID, including the creator's name.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with `id` param.
 * @param {import('express').Response} res - Express response with the note object.
 * @returns {Promise<void>}
 */
router.get("/:id", authenticate, async (req, res) => {
  try {
    const note = await Note.findByPk(req.params.id, {
      include: [{ model: User, as: "creator", attributes: ["fname", "lname"] }],
    });

    if (!note) {
      return res.status(404).json({ error: "المذكرة غير موجودة." });
    }

    res.json(note);
  } catch (error) {
    return handleInternalError(res, error, "GET /api/notes/:id failed");
  }
});

// ============================================
//   POST /api/notes — إضافة مذكرة جديدة (أدمن فقط)
// ============================================
/**
 * @route POST /api/notes
 * @description Creates a new note/resource. Requires admin privileges.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with `title`, `subject`, `link`, optional `type` and `description` in body.
 * @param {import('express').Response} res - Express response with `{ message, note }`.
 * @returns {Promise<void>}
 */
router.post(
  "/",
  authenticate,
  requireAdmin,
  validateCreateNote,
  async (req, res) => {
    try {
      const { title, subject, link, type, description } = req.body;

      const note = await Note.create({
        title: title.trim(),
        subject: subject.trim(),
        link: link.trim(),
        type: type || "pdf",
        description: description ? description.trim() : "",
        createdBy: req.user.id,
      });

      res.status(201).json({
        message: "تم إضافة المذكرة بنجاح!",
        note,
      });
    } catch (error) {
      return handleInternalError(res, error, "POST /api/notes failed");
    }
  },
);

// ============================================
//   PUT /api/notes/:id — تعديل مذكرة (أدمن فقط)
// ============================================
/**
 * @route PUT /api/notes/:id
 * @description Updates an existing note. Requires admin privileges.
 *   Only allowed fields (`title`, `subject`, `link`, `type`, `description`) are updated.
 * @access Private — requires authentication + admin role.
 * @param {import('express').Request} req - Express request with `id` param and update fields in body.
 * @param {import('express').Response} res - Express response with `{ message, note }`.
 * @returns {Promise<void>}
 */
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validateUpdateNote,
  async (req, res) => {
    try {
      const note = await Note.findByPk(req.params.id);
      if (!note) {
        return res.status(404).json({ error: "المذكرة غير موجودة." });
      }

      const allowedFields = ["title", "subject", "link", "type", "description"];
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          note[field] =
            typeof req.body[field] === "string"
              ? req.body[field].trim()
              : req.body[field];
        }
      });

      await note.save();

      res.json({
        message: "تم تحديث المذكرة بنجاح!",
        note,
      });
    } catch (error) {
      return handleInternalError(res, error, "PUT /api/notes/:id failed");
    }
  },
);

// ============================================
//   DELETE /api/notes/:id — حذف مذكرة (أدمن فقط)
// ============================================
/**
 * @route DELETE /api/notes/:id
 * @description Deletes a note by its ID. Requires admin privileges.
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
      const deleted = await Note.destroy({ where: { id: req.params.id } });
      if (!deleted) {
        return res.status(404).json({ error: "المذكرة غير موجودة." });
      }
      res.json({ message: "تم حذف المذكرة بنجاح." });
    } catch (error) {
      return handleInternalError(res, error, "DELETE /api/notes/:id failed");
    }
  },
);

module.exports = router;
