/**
 * @file Authentication and authorization middleware
 * @description Provides JWT-based authentication, admin authorization, token generation,
 *   and brute-force login protection (in-memory tracking with auto-cleanup).
 * @module middleware/auth
 */

// ============================================
//   Middleware التوثيق والصلاحيات — محصّن
//   — Sequelize + TiDB —
// ============================================
const jwt = require("jsonwebtoken");
const dbLayer = require("../services/safeQueryLayer");
const crypto = require("crypto");
const User = require("../models/User");
const logger = require("../utils/logger");

/**
 * JWT secret key.
 * In production, must be set via the JWT_SECRET environment variable.
 * In development, falls back to a random value if not configured.
 * @type {string}
 * @constant
 */
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    logger.error("❌ يجب ضبط JWT_SECRET في بيئة الإنتاج!");
    process.exit(1);
  }
  logger.warn("⚠️ JWT_SECRET غير محدد — استخدام قيمة عشوائية (تطوير فقط)");
  return crypto.randomBytes(32).toString("hex");
})();

if (process.env.NODE_ENV === "production" && JWT_SECRET.length < 32) {
  logger.error("❌ JWT_SECRET ضعيف. يجب ألا يقل عن 32 حرفًا في الإنتاج.");
  process.exit(1);
}

const JWT_ISSUER = process.env.JWT_ISSUER || "quiz-platform-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "quiz-platform-client";
const DEFAULT_JWT_EXPIRES_IN = "2h";
const MAX_PRODUCTION_JWT_TTL_SECONDS = 12 * 60 * 60;
const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,120}$/;

function parseDurationToSeconds(duration) {
  if (duration === undefined || duration === null) return null;
  const raw = String(duration).trim().toLowerCase();
  if (!raw) return null;

  // Support formats like: 7200, 15m, 2h, 1d
  const match = raw.match(/^(\d+)([smhd])?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2] || "s";
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 60 * 60;
  if (unit === "d") return amount * 24 * 60 * 60;
  return null;
}

function resolveJwtExpiresIn() {
  const configured = String(process.env.JWT_EXPIRES_IN || "").trim();
  if (!configured) return DEFAULT_JWT_EXPIRES_IN;

  const ttlSeconds = parseDurationToSeconds(configured);
  if (!ttlSeconds) {
    logger.warn(
      `⚠️ JWT_EXPIRES_IN غير صالح (${configured}) — استخدام القيمة الافتراضية ${DEFAULT_JWT_EXPIRES_IN}`,
    );
    return DEFAULT_JWT_EXPIRES_IN;
  }

  if (
    process.env.NODE_ENV === "production" &&
    ttlSeconds > MAX_PRODUCTION_JWT_TTL_SECONDS
  ) {
    logger.warn(
      `⚠️ JWT_EXPIRES_IN طويل في الإنتاج (${configured}) — تم تقليصه تلقائياً إلى ${DEFAULT_JWT_EXPIRES_IN}`,
    );
    return DEFAULT_JWT_EXPIRES_IN;
  }

  return configured;
}

const JWT_EXPIRES_IN = resolveJwtExpiresIn();

// ============================================
//   سجل محاولات الدخول الفاشلة (قاعدة البيانات)
//   — DB-backed: يبقى بعد restart وعبر instances —
// ============================================
const MAX_FAILED = 5;
const LOCKOUT_TIME = 30 * 60 * 1000; // 30 minutes
const inMemoryLoginAttempts = new Map();

function getRecentMemoryAttempt(ip) {
  const entry = inMemoryLoginAttempts.get(ip);
  if (!entry) return null;
  if (Date.now() - Number(entry.lastAttempt || 0) > LOCKOUT_TIME) {
    inMemoryLoginAttempts.delete(ip);
    return null;
  }
  return entry;
}

function recordFailedAttemptInMemory(ip) {
  const entry = getRecentMemoryAttempt(ip);
  if (!entry) {
    inMemoryLoginAttempts.set(ip, { count: 1, lastAttempt: Date.now() });
    return;
  }
  inMemoryLoginAttempts.set(ip, {
    count: Number(entry.count || 0) + 1,
    lastAttempt: Date.now(),
  });
}

function clearFailedAttemptInMemory(ip) {
  inMemoryLoginAttempts.delete(ip);
}

function isLockedInMemory(ip) {
  const entry = getRecentMemoryAttempt(ip);
  return entry ? Number(entry.count || 0) >= MAX_FAILED : false;
}

/**
 * Checks whether the given IP is locked out (DB-backed, table: login_attempts).
 * Uses DB as source of truth with in-memory fallback if DB is unavailable.
 * @param {string} ip
 * @returns {Promise<boolean>}
 */
async function checkBruteForce(ip) {
  if (isLockedInMemory(ip)) return true;

  try {
    const [[record]] = await dbLayer.executeReadOnlyQuery(
      "SELECT `count`, `last_attempt` FROM `login_attempts` WHERE `ip` = ?",
      { replacements: [ip] },
    );
    if (!record) return false;
    if (Date.now() - Number(record.last_attempt) > LOCKOUT_TIME) {
      try {
        await dbLayer.executeWriteQuery(
          "DELETE FROM `login_attempts` WHERE `ip` = ?",
          {
            replacements: [ip],
          },
        );
      } catch (cleanupErr) {
        logger.warn(
          `⚠️ Failed to cleanup expired brute-force record for ip=${ip}: ${cleanupErr.message}`,
        );
      }
      return false;
    }
    return Number(record.count) >= MAX_FAILED;
  } catch (err) {
    logger.warn(
      `⚠️ Brute-force DB check failed for ip=${ip}: ${err.message}`,
    );
    // In production, fail closed when DB is unavailable to prevent brute-force bypass.
    if (process.env.NODE_ENV === "production") return true;
    return isLockedInMemory(ip);
  }
}

/**
 * Records a failed login attempt via DB UPSERT.
 * @param {string} ip
 * @returns {Promise<void>}
 */
async function recordFailedAttempt(ip) {
  recordFailedAttemptInMemory(ip);

  try {
    await dbLayer.executeWriteQuery(
    "INSERT INTO `login_attempts` (`ip`, `count`, `last_attempt`) VALUES (?, 1, ?)" +
        " ON DUPLICATE KEY UPDATE `count` = `count` + 1, `last_attempt` = ?",
      { replacements: [ip, Date.now(), Date.now()] },
    );
  } catch (err) {
    logger.warn(
      `⚠️ Failed to record failed login attempt for ip=${ip}: ${err.message}`,
    );
  }
}

/**
 * Clears failed login attempts for the given IP after a successful login.
 * @param {string} ip
 * @returns {Promise<void>}
 */
async function clearFailedAttempts(ip) {
  clearFailedAttemptInMemory(ip);

  try {
    await dbLayer.executeWriteQuery("DELETE FROM `login_attempts` WHERE `ip` = ?",
 {
      replacements: [ip],
    });
  } catch (err) {
    logger.warn(
      `⚠️ Failed to clear failed login attempts for ip=${ip}: ${err.message}`,
    );
  }
}

// ============================================
//   CSRF Protection — Double Submit Cookie
// ============================================
/**
 * Sets a non-httpOnly CSRF token cookie that client JS reads and echoes
 * back as the X-CSRF-Token header on every mutating request.
 * The server compares header === cookie (Double Submit Cookie Pattern).
 * Attackers from other origins cannot read our cookies, so they cannot forge the header.
 * @param {import('express').Response} res
 */
const setCsrfCookie = (res) => {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrf_token", token, {
    httpOnly: false, // JS يجب أن يقرأ هذه القيمة
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return token;
};

/**
 * Clears the CSRF cookie on logout.
 * @param {import('express').Response} res
 */
const clearCsrfCookie = (res) => {
  res.clearCookie("csrf_token", { path: "/" });
};

/**
 * Middleware: enforces CSRF double-submit cookie on mutating requests.
 * GET / HEAD / OPTIONS are always allowed.
 * POST /api/auth/google is exempt (handled in index.js) — no cookie on first login.
 */
const verifyCsrf = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.warn(`🚨 CSRF mismatch — IP: ${req.ip}, ${req.method} ${req.path}`);
    return res
      .status(403)
      .json({ error: "طلب غير صالح. أعد تحميل الصفحة وحاول مرة أخرى." });
  }
  next();
};

// ============================================
//   1. التحقق من تسجيل الدخول (أي مستخدم)
// ============================================
/**
 * Express middleware that verifies the JWT from the httpOnly cookie or
 * Authorization header, looks up the user in the database, validates
 * role and tokenVersion, and attaches the user object to the request.
 */

/**
 * Cookie options for the JWT httpOnly cookie.
 * @type {Object}
 */
const COOKIE_OPTIONS = {
  httpOnly: true, // لمنع وصول JavaScript للكوكي
  secure: process.env.NODE_ENV === "production", // للتشفير عبر HTTPS في الإنتاج
  sameSite: "strict", // لمنع هجمات CSRF
  maxAge: 2 * 60 * 60 * 1000, // 2 hours (ليس أبدياً)
  path: "/",
};

/**
 * Sets the JWT token as an httpOnly cookie on the response.
 * @param {import('express').Response} res - Express response object.
 * @param {string} token - The JWT token to set.
 */
const setTokenCookie = (res, token) => {
  res.cookie("jwt", token, COOKIE_OPTIONS);
};

/**
 * Clears the JWT cookie from the response.
 * @param {import('express').Response} res - Express response object.
 */
const clearTokenCookie = (res) => {
  res.clearCookie("jwt", { ...COOKIE_OPTIONS, maxAge: 0 });
};

/**
 * Express middleware that verifies the JWT from httpOnly cookie or Authorization header.
 * Supports both mechanisms for mobile/API compatibility.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 * @throws {401} If the token is missing, invalid, expired, or the user is not found.
 */
const authenticate = async (req, res, next) => {
  try {
    // Priority: httpOnly cookie > Authorization header
    let token = null;

    if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }

    if (!token) {
      return res.status(401).json({ error: "يجب تسجيل الدخول أولاً." });
    }

    if (token.length > 2048) {
      return res.status(401).json({ error: "توكن غير صالح." });
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!decoded.userId || !decoded.role) {
      return res.status(401).json({ error: "توكن غير صالح." });
    }

    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "المستخدم غير موجود." });
    }

    if (decoded.role !== user.role) {
      logger.warn(
        `⚠️ محاولة تلاعب بالتوكن — IP: ${req.ip}, User: ${user.email}, Token role: ${decoded.role}, DB role: ${user.role}`,
      );
      return res
        .status(401)
        .json({ error: "توكن غير صالح. سجل دخولك مرة أخرى." });
    }

    if (
      typeof decoded.tokenVersion === "number" &&
      decoded.tokenVersion !== user.tokenVersion
    ) {
      return res
        .status(401)
        .json({ error: "تم إلغاء هذا التوكن. سجل دخولك مرة أخرى." });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: "انتهت صلاحية الجلسة، سجل دخولك مرة أخرى." });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "توكن غير صالح." });
    }
    return res.status(401).json({ error: "خطأ في التحقق من الهوية." });
  }
};

// ============================================
//   2. التحقق من صلاحيات الأدمن (المعلم)
// ============================================
/**
 * Express middleware that checks whether the authenticated user has the 'admin' role.
 * Must be used after the `authenticate` middleware.
 * @param {import('express').Request} req - Express request object (must have `req.user`).
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 * @throws {403} If the user is not an admin.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    logger.warn(
      `🚨 محاولة وصول غير مصرح للأدمن — IP: ${req.ip}, User: ${req.user ? req.user.email : "unknown"}, Path: ${req.originalUrl}`,
    );
    return res
      .status(403)
      .json({ error: "ليس لديك صلاحية الوصول. هذا الإجراء للمعلم فقط." });
  }
  logger.info(
    `👑 عملية أدمن — ${req.method} ${req.originalUrl} — بواسطة: ${req.user.email}`,
  );
  next();
};

// ============================================
//   3. إنشاء توكن JWT
// ============================================
/**
 * Generates a signed JWT for the given user.
 * @param {number} userId - The user's database ID.
 * @param {string} role - The user's role ('student' or 'admin').
 * @param {number} [tokenVersion=0] - The current token version for revocation support.
 * @param {string} [email=''] - Optional user email for cross-middleware policies.
 * @returns {string} A signed JWT string.
 */
const generateToken = (userId, role, tokenVersion = 0, email = "") => {
  return jwt.sign(
    {
      userId,
      role,
      tokenVersion,
      email: email ? String(email).toLowerCase().substring(0, 255) : undefined,
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomBytes(8).toString("hex"),
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
};

function isTrustedGuestRequestOrigin(req) {
  const isLikelyLegacyClient = (request) => {
    const ua = String(request.get("user-agent") || "").toLowerCase();
    const xrw = String(request.get("x-requested-with") || "").toLowerCase();
    if (xrw && xrw !== "null") return true;
    return (
      ua.includes("wv") ||
      ua.includes("webview") ||
      ua.includes("okhttp") ||
      ua.includes("cfnetwork")
    );
  };

  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );

  allowed.add("http://localhost:3000");
  allowed.add("http://localhost:5173");
  allowed.add("http://127.0.0.1:3000");
  allowed.add("http://127.0.0.1:5173");

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowed.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }

  const host = req.get("host");
  const protocol = req.protocol || "https";
  const sameOrigin = host ? `${protocol}://${host}` : null;

  const origin = req.get("origin");
  if (origin) {
    if (sameOrigin && origin === sameOrigin) return true;
    return allowed.has(origin);
  }

  const referer = req.get("referer");
  if (!referer) {
    const fetchSite = (req.get("sec-fetch-site") || "").toLowerCase();
    if (fetchSite === "same-origin" || fetchSite === "same-site") return true;
    if (
      process.env.NODE_ENV !== "production" &&
      sameOrigin &&
      isLikelyLegacyClient(req)
    ) {
      return true;
    }
    return false;
  }

  try {
    const refOrigin = new URL(referer).origin;
    if (sameOrigin && refOrigin === sameOrigin) return true;
    return allowed.has(refOrigin);
  } catch {
    return false;
  }
}

function hasSuspiciousGuestSignals(req) {
  const userAgent = String(req.get("user-agent") || "").toLowerCase();
  if (!userAgent) return true;

  const blockedAgents = [
    "curl/",
    "wget/",
    "python-requests",
    "httpie",
    "postmanruntime",
    "insomnia",
    "axios/",
  ];
  if (blockedAgents.some((sig) => userAgent.includes(sig))) return true;

  const deviceId = String(req.get("x-device-id") || "").trim();
  return !DEVICE_ID_REGEX.test(deviceId);
}

// ============================================
//   authenticateOrGuest — قراءة عامة للضيوف
// ============================================
/**
 * Like `authenticate`, but also allows requests with the X-Guest-Mode: true header.
 * Used for public read-only routes (GET quizzes, notes, leaderboard) so guest users
 * can browse content without a JWT.
 * Attaches req.user = { role: 'guest' } for downstream middleware.
 */
const authenticateOrGuest = async (req, res, next) => {
  const isReadOnlyMethod = req.method === "GET" || req.method === "HEAD";
  const wantsGuestMode =
    String(req.headers["x-guest-mode"] || "").toLowerCase() === "true";

  if (isReadOnlyMethod && wantsGuestMode) {
    if (!isTrustedGuestRequestOrigin(req)) {
      return res.status(403).json({
        error: "مصدر الطلب غير موثوق لوضع الضيف.",
      });
    }

    if (hasSuspiciousGuestSignals(req)) {
      return res.status(403).json({
        error: "تعذر التحقق من جلسة الضيف. استخدم التطبيق الرسمي.",
      });
    }

    req.user = { role: "guest", id: null, email: null, isGuest: true };
    return next();
  }

  return authenticate(req, res, next);
};

module.exports = {
  authenticate,
  authenticateOrGuest,
  requireAdmin,
  generateToken,
  setTokenCookie,
  clearTokenCookie,
  setCsrfCookie,
  clearCsrfCookie,
  verifyCsrf,
  COOKIE_OPTIONS,
  checkBruteForce,
  recordFailedAttempt,
  clearFailedAttempts,
};
