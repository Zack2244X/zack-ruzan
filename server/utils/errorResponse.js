const { randomUUID } = require("crypto");
const logger = require("./logger");
const isProduction = process.env.NODE_ENV === "production";
const isDebug = String(process.env.LOG_LEVEL || "").toLowerCase() === "debug";

const SENSITIVE_FIELDS = new Set([
  "password",
  "confirmpassword",
  "passcode",
  "authorization",
  "cookie",
  "set-cookie",
  "secret",
  "clientsecret",
  "apikey",
  "api_key",
  "access_token",
  "token",
  "refreshtoken",
  "idtoken",
  "session",
  "sessionid",
  "deviceid",
  "otp",
  "pin",
  "privatekey",
  "private_key",
  "signature",
  "csrf",
  "csrftoken",
]);

const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "cookie",
  "session",
  "authorization",
  "api_key",
  "apikey",
  "clientkey",
  "privatekey",
  "csrf",
  "otp",
  "pin",
  "signature",
];

function isSensitiveKey(key) {
  if (SENSITIVE_FIELDS.has(key)) return true;
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => key.includes(fragment));
}

function looksSensitiveValue(value) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/^bearer\s+\S+/i.test(trimmed)) return true;
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return true;
  if (trimmed.length >= 80 && !trimmed.includes(" ")) return true;

  return false;
}

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
    if (isSensitiveKey(lowered)) {
      redacted[key] = "[REDACTED]";
      return;
    }
    if (looksSensitiveValue(redacted[key])) {
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
  const safeAdditionalContext =
    redactSensitive(cloneSafe(additionalContext)) || {};

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
    ...safeAdditionalContext,
  };

  logger.error("Internal server error", logContext);

  return res.status(500).json({
    error: "حدث خطأ داخلي، تم تسجيل المشكلة",
    incidentId,
  });
}

module.exports = sendInternalError;