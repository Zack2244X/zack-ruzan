const { randomUUID } = require("crypto");
const logger = require("./logger");
const isProduction = process.env.NODE_ENV === "production";
const isDebug = String(process.env.LOG_LEVEL || "").toLowerCase() === "debug";

const SENSITIVE_FIELDS = new Set([
  "password",
  "confirmpassword",
  "token",
  "refreshtoken",
]);

function cloneSafe(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function redactSensitive(input) {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((item) => redactSensitive(item));

  const redacted = { ...input };
  Object.keys(redacted).forEach((key) => {
    const lowered = String(key).toLowerCase();
    if (SENSITIVE_FIELDS.has(lowered)) {
      redacted[key] = "[REDACTED]";
      return;
    }
    if (redacted[key] && typeof redacted[key] === "object") {
      redacted[key] = redactSensitive(redacted[key]);
    }
  });
  return redacted;
}

function sendInternalError(res, err, req, additionalContext = {}) {
  const incidentId = randomUUID();

  const safeBody = redactSensitive(cloneSafe(req?.body));
  const safeQuery = redactSensitive(cloneSafe(req?.query));

  const logContext = {
    incidentId,
    message: err?.message || "Unknown error",
    stack: !isProduction && isDebug ? err?.stack : undefined,
    path: req?.path,
    method: req?.method,
    ip: req?.ip,
    userAgent: req?.get ? req.get("user-agent") : undefined,
    userId: req?.user?.id || req?.user?.userId || null,
    query: safeQuery,
    body: safeBody,
    ...additionalContext,
  };

  logger.error("Internal server error", logContext);

  return res.status(500).json({
    error: "حدث خطأ داخلي، تم تسجيل المشكلة",
    incidentId,
  });
}

module.exports = sendInternalError;