/**
 * @file Request body sanitization middleware
 * @description Provides middleware and utilities to recursively strip all HTML tags from
 *   request body values, preventing XSS attacks.
 * @module middleware/sanitize
 */

// ============================================
//   Sanitization Middleware — منع XSS
// ============================================
const sanitizeHtml = require('sanitize-html');

const sanitizeOptions = {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'recursiveEscape'
};

/**
 * Recursively sanitize all string values in an object, array, or primitive.
 * Strips all HTML tags and trims whitespace from strings.
 * @param {*} obj - The value to sanitize (string, array, object, or other primitive).
 * @returns {*} The sanitized value with the same structure.
 */
function deepSanitize(obj) {
    if (typeof obj === 'string') {
        return sanitizeHtml(obj, sanitizeOptions).trim();
    }
    if (Array.isArray(obj)) {
        return obj.map(deepSanitize);
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = deepSanitize(value);
        }
        return result;
    }
    return obj;
}

/**
 * Express middleware that sanitizes `req.body` by stripping HTML tags from all string values.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 */
function sanitizeBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = deepSanitize(req.body);
    }
    next();
}

module.exports = { sanitizeBody, deepSanitize };
