const { randomUUID } = require("crypto");

/**
 * Build a sanitized error object suitable for logs.
 * Never include raw SQL or full stack traces unless debug logging is explicitly enabled.
 */
function buildSanitizedErrorLog(error, context, operationId = randomUUID()) {
  const isProduction = process.env.NODE_ENV === "production";
  const isDebug = String(process.env.LOG_LEVEL || "").toLowerCase() === "debug";
  const sanitized = {
    operationId,
    context,
    timestamp: new Date().toISOString(),
    message: error?.message || "Unknown error",
    code: error?.code || error?.name || "INTERNAL_ERROR",
  };

  if (error?.sql || error?.original?.sql || error?.parent?.sql) {
    sanitized.database = "Database Operation Failed";
  }

  if (!isProduction && isDebug && error?.stack) {
    sanitized.stack = error.stack;
  }

  return sanitized;
}

module.exports = {
  buildSanitizedErrorLog,
};
