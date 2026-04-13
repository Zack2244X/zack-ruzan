async function logAccountSession({ userId, email, loginType = "google", ipAddress, macAddress, deviceName, deviceId, userAgent }) {
  try {
    await AccountSession.create({
      userId: userId || null,
      email: sanitizeText(email, 255).toLowerCase(),
      loginType: sanitizeText(loginType, 30),
      ipAddress: sanitizeText(ipAddress, 64),
      macAddress: sanitizeText(macAddress, 64),
      deviceName: sanitizeText(deviceName, 120),
      deviceId: sanitizeText(deviceId, 120),
      userAgent: sanitizeText(userAgent, 500)
    });
  } catch (err) {
    logger.error(
      "Error logging account session",
      buildSanitizedErrorLog(err, "logAccountSession"),
    );
  }
}

/**
 * @file Authentication routes — Google OAuth
 * @description Express router handling Google OAuth login/registration, profile completion,
 *   admin creation/promotion, token refresh, and logout with token revocation.
 * @module routes/auth
 */

// ============================================
//   مسارات التوثيق — Google OAuth
//   — Sequelize + TiDB —
// ============================================
const router = require("express").Router();
const { OAuth2Client } = require("google-auth-library");
const { UniqueConstraintError } = require("sequelize");
const dbLayer = require("../services/safeQueryLayer");
const User = require("../models/User");
const BlockedDevice = require("../models/BlockedDevice");
const AccountSession = require("../models/AccountSession");
const { Op } = require("sequelize");
const {
  generateToken,
  authenticate,
  requireAdmin,
  setTokenCookie,
  clearTokenCookie,
  setCsrfCookie,
  clearCsrfCookie,
  checkBruteForce,
  recordFailedAttempt,
  clearFailedAttempts,
} = require("../middleware/auth");
const {
  validateGoogleLogin,
  validateCompleteProfile,
  validateCreateAdmin,
} = require("../middleware/validators");
const logger = require("../utils/logger");
const { buildSanitizedErrorLog } = require("../utils/secureErrorLog");
const sendInternalError = require("../utils/errorResponse");
const rateLimit = require("express-rate-limit");
const { isIP } = require("net");

function handleInternalError(req, res, error, context) {
  return sendInternalError(res, error, req, { action: context });
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Strict rate limiter for admin creation endpoint — 3 attempts per hour.
 * @type {import('express').RequestHandler}
 */
const createAdminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة لإنشاء أدمن. حاول بعد ساعة." },
});

/**
 * Moderate limiter for admin device/account management operations.
 * Helps prevent accidental bursts from UI loops and abuse.
 */
const adminOpsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات إدارية كثيرة جدًا. حاول بعد دقيقة." },
});

/**
 * Pre-approved admin email addresses loaded from the ADMIN_EMAILS environment variable.
 * @type {string[]}
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Checks whether request Origin/Referer belongs to trusted frontend origins.
 * Used to harden first-step auth flows that are exempt from CSRF.
 */
function isTrustedRequestOrigin(req) {
  function isLikelyLegacyClient(request) {
    const ua = String(request.get("user-agent") || "").toLowerCase();
    const xrw = String(request.get("x-requested-with") || "").toLowerCase();
    if (xrw && xrw !== "null") return true;
    return (
      ua.includes("wv") ||
      ua.includes("webview") ||
      ua.includes("okhttp") ||
      ua.includes("cfnetwork")
    );
  }

  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );

  // Reasonable defaults for local/dev runs.
  allowed.add("http://localhost:3000");
  allowed.add("http://localhost:5173");
  allowed.add("http://127.0.0.1:3000");
  allowed.add("http://127.0.0.1:5173");

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowed.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }

  const host = req.get("host");
  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
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
    if (sameOrigin && isLikelyLegacyClient(req)) return true;
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

function hasSuspiciousAutomationSignals(req, normalizedDeviceId = "") {
  const userAgent = sanitizeText(req.get("user-agent") || "", 500).toLowerCase();
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

  const headerDeviceId = sanitizeText(req.get("x-device-id") || "", 120);
  if (!headerDeviceId || !normalizedDeviceId || headerDeviceId !== normalizedDeviceId) {
    return true;
  }

  return false;
}

/**
 * Splits a full name string into first name and last name.
 * @param {string} [fullName=''] - The full name to split.
 * @returns {{ fname: string, lname: string }} Object with `fname` and `lname` properties (max 50 chars each).
 */
function splitName(fullName = "") {
  const clean = (fullName || "").trim();
  if (!clean) return { fname: "", lname: "" };
  const parts = clean.split(/\s+/);
  const fname = parts.shift() || "";
  const lname = parts.join(" ") || "";
  return {
    fname: fname.substring(0, 50),
    lname: lname.substring(0, 50),
  };
}

function getClientIp(req) {
  return (req.ip || "").toString().substring(0, 64);
}

function inferDeviceName(ua = "") {
  const u = String(ua || "").toLowerCase();
  if (!u) return "Unknown Device";

  let platform = "Unknown Device";
  if (u.includes("iphone")) platform = "iPhone";
  else if (u.includes("ipad")) platform = "iPad";
  else if (u.includes("android") && u.includes("mobile"))
    platform = "Android Phone";
  else if (u.includes("android")) platform = "Android Tablet";
  else if (u.includes("windows")) platform = "Windows PC";
  else if (u.includes("mac os") || u.includes("macintosh")) platform = "Mac";
  else if (u.includes("linux")) platform = "Linux PC";

  let browser = "Browser";
  if (u.includes("edg/")) browser = "Edge";
  else if (u.includes("opr/") || u.includes("opera")) browser = "Opera";
  else if (u.includes("chrome/") && !u.includes("edg/")) browser = "Chrome";
  else if (u.includes("safari/") && !u.includes("chrome/")) browser = "Safari";
  else if (u.includes("firefox/")) browser = "Firefox";

  return `${platform} - ${browser}`;
}

function normalizeDeviceName(rawName = "", ua = "") {
  const raw = sanitizeText(rawName, 120);
  const lower = raw.toLowerCase();
  const looksLikeUA =
    lower.includes("mozilla/") ||
    lower.includes("applewebkit") ||
    lower.includes("chrome/") ||
    lower.includes("safari/") ||
    lower.includes("firefox/");

  if (!raw || looksLikeUA || raw.length > 60) {
    return inferDeviceName(ua);
  }

  return raw;
}

function sanitizeText(value, maxLen = 255) {
  if (!value) return "";
  return String(value).trim().substring(0, maxLen);
}

function parsePageLimit(query, defaultLimit = 30, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(query?.limit, 10) || defaultLimit),
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

let blockedDevicesColumnsCache = null;
let accountSessionsColumnsCache = null;

async function getBlockedDevicesColumns() {
  if (blockedDevicesColumnsCache) return blockedDevicesColumnsCache;
  const [rows] = await dbLayer.executeReadOnlyQuery("SHOW COLUMNS FROM blocked_devices");
  blockedDevicesColumnsCache = new Set((rows || []).map((r) => r.Field));
  return blockedDevicesColumnsCache;
}

async function getAccountSessionsColumns() {
  if (accountSessionsColumnsCache) return accountSessionsColumnsCache;
  const [rows] = await dbLayer.executeReadOnlyQuery("SHOW COLUMNS FROM account_sessions");
  accountSessionsColumnsCache = new Set((rows || []).map((r) => r.Field));
  return accountSessionsColumnsCache;
}



async function findActiveBlock({ email = "", deviceId = "", ipAddress = "" }) {
  const normalizedEmail = sanitizeText(email, 255).toLowerCase();
  const normalizedDeviceId = sanitizeText(deviceId, 120);
  const normalizedIp = sanitizeText(ipAddress, 64);

  const whereConditions = [];
  if (normalizedEmail) whereConditions.push({ email: normalizedEmail });
  if (normalizedDeviceId) whereConditions.push({ deviceId: normalizedDeviceId });
  if (normalizedIp) whereConditions.push({ ipAddress: normalizedIp });

  if (whereConditions.length === 0) return null;

  const b = await BlockedDevice.findOne({
    attributes: ['id', 'reason', 'email', 'deviceId', 'ipAddress'],
    where: { isActive: true, [Op.or]: whereConditions },
    order: [['id', 'DESC']]
  });
  return b ? b.toJSON() : null;
}

async function recordAccountSession({
  userId = null,
  email = "",
  deviceId = "",
  loginType = "google",
  ipAddress = "",
  deviceName = "",
  userAgent = "",
}) {
  try {
    const normalizedEmail = sanitizeText(email.toLowerCase(), 255) || null;
    const normalizedDeviceId = sanitizeText(deviceId, 120);
    const normalizedIpAddress = sanitizeText(ipAddress, 64);
    
    await AccountSession.create({
      userId: userId || null,
      email: normalizedEmail,
      ipAddress: normalizedIpAddress,
      deviceId: normalizedDeviceId,
      loginType,
      deviceName,
      userAgent: sanitizeText(userAgent, 500)
    });
  } catch (err) {
    logger.warn(
      "⚠️ تعذر تسجيل account session audit:",
      buildSanitizedErrorLog(err, "recordAccountSession"),
    );
  }
}

async function touchAccountSessionIfNeeded(req, user, loginType = "activity") {
  try {
    if (!user || !user.id) return;

    const cols = await getAccountSessionsColumns();
    if (!cols.has("userId")) return;

    const userAgent = req.get("user-agent") || "";
    const deviceId = sanitizeText(
      req.get("x-device-id") || req.body?.deviceId || req.query?.deviceId,
      120,
    );
    const ipAddress = getClientIp(req);
    const email = sanitizeText(user.email || "", 255).toLowerCase();

    const uniqueClauses = ["userId = ?"];
    const replacements = [user.id];

    if (cols.has("deviceId") && deviceId) {
      uniqueClauses.push("deviceId = ?");
      replacements.push(deviceId);
    }
    if (cols.has("ipAddress") && ipAddress) {
      uniqueClauses.push("ipAddress = ?");
      replacements.push(ipAddress);
    }
    if (cols.has("email") && email) {
      uniqueClauses.push("email = ?");
      replacements.push(email);
    }

    const [rows] = await dbLayer.executeReadOnlyQuery(
      `SELECT id, ${cols.has("createdAt") ? "createdAt" : "NULL AS createdAt"}
             FROM account_sessions
             WHERE ${uniqueClauses.join(" AND ")}
             ORDER BY ${cols.has("createdAt") ? "createdAt DESC, id DESC" : "id DESC"}
             LIMIT 1`,
      { replacements },
    );

    if (rows && rows.length > 0 && rows[0].createdAt) {
      const lastAt = new Date(rows[0].createdAt).getTime();
      if (Number.isFinite(lastAt) && Date.now() - lastAt < 6 * 60 * 60 * 1000) {
        return;
      }
    }

    await recordAccountSession({
      userId: user.id,
      email,
      deviceId,
      loginType,
      ipAddress,
      deviceName: inferDeviceName(userAgent),
      userAgent,
    });
  } catch (err) {
    logger.warn(
      "⚠️ تعذر تحديث account session من /me:",
      buildSanitizedErrorLog(err, "touchAccountSessionIfNeeded"),
    );
  }
}

async function releaseBlocksForSession({
  email = "",
  deviceId = "",
  ipAddress = "",
}) {
  const cols = await getBlockedDevicesColumns();
  const whereParts = [];
  const replacements = [];

  if (cols.has("email") && email) {
    whereParts.push("email = ?");
    replacements.push(email);
  }
  if (cols.has("deviceId") && deviceId) {
    whereParts.push("deviceId = ?");
    replacements.push(deviceId);
  }
  if (cols.has("ipAddress") && ipAddress) {
    whereParts.push("ipAddress = ?");
    replacements.push(ipAddress);
  }

  if (whereParts.length === 0) return 0;

  await dbLayer.executeWriteQuery(
    `UPDATE blocked_devices
         SET isActive = 0, updatedAt = NOW(), reason = CONCAT(COALESCE(reason, ''), ' | auto-unblocked by admin login')
         WHERE isActive = 1
           AND (${whereParts.join(" OR ")})`,
    { replacements },
  );

  const [countRows] = await dbLayer.executeReadOnlyQuery(
    `SELECT COUNT(*) AS c
         FROM blocked_devices
         WHERE isActive = 0
           AND (${whereParts.join(" OR ")})`,
    { replacements },
  );
  return Number(countRows?.[0]?.c || 0);
}

async function targetHasAdminHistory({
  email = "",
  deviceId = "",
  ipAddress = "",
}) {
  const normalizedEmail = sanitizeText(email, 255).toLowerCase();
  if (normalizedEmail) {
    const directAdmin = await User.findOne({
      where: { email: normalizedEmail, role: "admin" },
    });
    if (directAdmin) return true;
  }

  if (!deviceId && !ipAddress) return false;

  const cols = await getAccountSessionsColumns();
  const targetFilters = [];
  const targetReplacements = [];

  if (cols.has("deviceId") && deviceId) {
    targetFilters.push("s.deviceId = ?");
    targetReplacements.push(deviceId);
  }
  if (cols.has("ipAddress") && ipAddress) {
    targetFilters.push("s.ipAddress = ?");
    targetReplacements.push(ipAddress);
  }

  if (targetFilters.length === 0) return false;

  if (cols.has("userId")) {
    const [rowsByUserId] = await dbLayer.executeReadOnlyQuery(
      `SELECT 1
             FROM account_sessions s
             JOIN users u ON u.id = s.userId
             WHERE (${targetFilters.join(" OR ")})
               AND u.role = 'admin'
               AND u.deletedAt IS NULL
             LIMIT 1`,
      { replacements: targetReplacements },
    );
    if (rowsByUserId && rowsByUserId.length > 0) return true;
  }

  if (cols.has("email")) {
    const [rowsByEmail] = await dbLayer.executeReadOnlyQuery(
      `SELECT 1
             FROM account_sessions s
             JOIN users u ON u.email = s.email
             WHERE (${targetFilters.join(" OR ")})
               AND COALESCE(s.email, '') <> ''
               AND u.role = 'admin'
               AND u.deletedAt IS NULL
             LIMIT 1`,
      { replacements: targetReplacements },
    );
    if (rowsByEmail && rowsByEmail.length > 0) return true;
  }

  return false;
}

// ============================================
//   دالة مساعدة: التحقق من توكن Google
// ============================================
/**
 * Verifies a Google OAuth ID token and extracts user information.
 * @async
 * @param {string} idToken - The Google ID token to verify.
 * @returns {Promise<{googleId: string, email: string, name: string, avatar: string}>}
 *   The extracted user data from the Google token payload.
 * @throws {Error} If the token is invalid or verification fails.
 */
async function verifyGoogleToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || "",
    avatar: payload.picture || "",
  };
}

// ============================================
//   POST /api/auth/google — تسجيل/دخول بالجيميل
// ============================================
router.get("/csrf-bootstrap", (req, res) => {
  const csrfToken = setCsrfCookie(res);
  return res.json({ csrfToken });
});

/**
 * @route POST /api/auth/google
 * @description Handles Google OAuth login and registration.
 *   - Checks for brute-force lockout.
 *   - Verifies the Google ID token.
 *   - Creates a new user or logs in an existing one.
 *   - Auto-assigns admin role if the email is in ADMIN_EMAILS.
 * @access Public
 * @param {import('express').Request} req - Express request with `idToken` in body.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.post(
  "/google",
  validateGoogleLogin,
  (req, res, next) => {
    if (!req.cookies?.csrf_token) {
      setCsrfCookie(res);
    }
    next();
  },
  async (req, res) => {
    try {
      if (!isTrustedRequestOrigin(req)) {
        logger.warn("🚫 Blocked /api/auth/google due to untrusted origin", {
          origin: req.get("origin") || null,
          referer: req.get("referer") || null,
          ip: req.ip,
        });
        return res.status(403).json({ error: "مصدر الطلب غير موثوق." });
      }

      if (await checkBruteForce(req.ip)) {
        return res
          .status(429)
          .json({
            error: "تم حظرك مؤقتاً بسبب محاولات كثيرة. انتظر 30 دقيقة.",
          });
      }

      const { idToken } = req.body;

      let googleData;
      try {
        googleData = await verifyGoogleToken(idToken);
      } catch (err) {
        await recordFailedAttempt(req.ip);
        return res
          .status(401)
          .json({ error: "توكن Google غير صالح أو منتهي." });
      }

      await clearFailedAttempts(req.ip);


    const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,50}$/;

    // استخراج المعرف من الطلب
    const { deviceId } = req.body;

    // التحقق من وجوده ومطابقته للنمط
    if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        logger.warn(`[Security] Rejected invalid Device ID: ${deviceId ? deviceId.substring(0, 10) + '...' : 'MISSING'}`);
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid Device ID format. Must be alphanumeric, 10-50 characters, allowing underscores and hyphens.' 
        });
    }

    const userAgent = req.get("user-agent") || "";
    const ipAddress = getClientIp(req);
    // Remove redeclaration since we did destructuring above


      const deviceName =
        sanitizeText(req.body?.deviceName, 120) || inferDeviceName(userAgent);
      const normalizedGoogleEmail = sanitizeText(
        googleData.email,
        255,
      ).toLowerCase();

      let user = await User.findOne({ where: { email: googleData.email } });
      const isAdminIdentity =
        ADMIN_EMAILS.includes(normalizedGoogleEmail) ||
        (user && user.role === "admin");

      const blockedEntry = await findActiveBlock({
        email: googleData.email,
        deviceId,
        ipAddress,
      });
      if (blockedEntry) {
        if (isAdminIdentity) {
          await releaseBlocksForSession({
            email: normalizedGoogleEmail,
            deviceId,
            ipAddress,
          });
          logger.warn("🔓 تم فك الحظر تلقائياً بعد دخول أدمن", {
            email: normalizedGoogleEmail,
            deviceId,
            ipAddress,
          });
        } else {
          logger.warn("🚫 محاولة دخول بحساب/جهاز/آيبي محظور", {
            email: normalizedGoogleEmail,
            deviceId,
            ipAddress,
            blockId: blockedEntry.id,
          });
          return res.status(403).json({
            error: "تم حظر هذا الحساب أو الجهاز من الدخول إلى المنصة.",
            reason: blockedEntry.reason || "سبب غير محدد",
          });
        }
      }

      if (!user) {
        user = await User.findOne({ where: { email: googleData.email } });
      }

      // البحث عن المستخدم بالإيميل
      if (user) {
        // === مستخدم موجود → تسجيل دخول ===
        if ((!user.fname || !user.lname) && googleData.name) {
          const { fname, lname } = splitName(googleData.name);
          if (fname) user.fname = fname;
          if (lname) user.lname = lname;
        }
        if (googleData.avatar && user.avatar !== googleData.avatar) {
          user.avatar = googleData.avatar;
        }
        // مزامنة الدور مع ADMIN_EMAILS عند كل تسجيل دخول
        const shouldBeAdmin = ADMIN_EMAILS.includes(
          googleData.email.toLowerCase(),
        );
        const correctRole = shouldBeAdmin ? "admin" : "student";
        if (user.role !== correctRole) {
          logger.info(
            `🔄 تحديث دور المستخدم: ${user.email} من ${user.role} إلى ${correctRole}`,
          );
          user.role = correctRole;
          user.tokenVersion = (user.tokenVersion || 0) + 1; // إلغاء الجلسات القديمة
        }
        await user.save();

        await recordAccountSession({
          userId: user.id,
          email: user.email,
          deviceId,
          loginType: "google",
          ipAddress,
          deviceName,
          userAgent,
        });

        const token = generateToken(
          user.id,
          user.role,
          user.tokenVersion,
          user.email,
        );
        setTokenCookie(res, token);
        setCsrfCookie(res);
        logger.info(
          `تسجيل دخول — ${user.role === "admin" ? "👑 أدمن" : "👤 طالب"}: ${user.email}`,
        );

        return res.json({
          message: `مرحباً بك مجدداً يا ${user.fname || "صديقنا"}!`,
          isNew: false,
          isProfileComplete: user.isProfileComplete,
          user: {
            id: user.id,
            fname: user.fname,
            lname: user.lname,
            fullName:
              user.fname && user.lname ? `${user.fname} ${user.lname}` : "",
            avatar: user.avatar,
            role: user.role,
            email: user.email,
          },
        });
      }

      // === مستخدم جديد → إنشاء حساب ===
      const isAdminEmail = ADMIN_EMAILS.includes(
        googleData.email.toLowerCase(),
      );
      const { fname, lname } = splitName(googleData.name);

      user = await User.create({
        email: googleData.email,
        googleId: googleData.googleId,
        avatar: googleData.avatar,
        fname: fname || "",
        lname: lname || "",
        isProfileComplete: false,
        role: isAdminEmail ? "admin" : "student",
      });

      logger.info(
        `🆕 تسجيل جديد — ${isAdminEmail ? "👑 أدمن" : "👤 طالب"}: ${googleData.email}`,
      );

      await recordAccountSession({
        userId: user.id,
        email: user.email,
        deviceId,
        loginType: "google",
        ipAddress,
        deviceName,
        userAgent,
      });

      const token = generateToken(
        user.id,
        user.role,
        user.tokenVersion,
        user.email,
      );
      setTokenCookie(res, token);
      setCsrfCookie(res);

      res.status(201).json({
        message: "تم التسجيل بنجاح! يرجى إكمال اسمك.",
        isNew: true,
        isProfileComplete: false,
        user: {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          fullName:
            user.fname && user.lname
              ? `${user.fname} ${user.lname}`
              : user.email,
          avatar: user.avatar,
          role: user.role,
          email: user.email,
        },
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return res.status(409).json({ error: "هذا الحساب مسجل بالفعل." });
      }
      return handleInternalError(req, res, error, "POST /api/auth/google failed");
    }
  },
);

// ============================================
//   POST /api/auth/guest-session — تسجيل دخول ضيف
// ============================================
router.post("/guest-session", async (req, res) => {
  try {
    const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,50}$/;

    // استخراج المعرف من الطلب
    const { deviceId } = req.body;

    // التحقق من وجوده ومطابقته للنمط
    if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        logger.warn(`[Security] Rejected invalid Device ID: ${deviceId ? deviceId.substring(0, 10) + '...' : 'MISSING'}`);
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid Device ID format. Must be alphanumeric, 10-50 characters, allowing underscores and hyphens.' 
        });
    }

    if (!isTrustedRequestOrigin(req)) {
      logger.warn("🚫 Blocked /api/auth/guest-session due to untrusted origin", {
        origin: req.get("origin") || null,
        referer: req.get("referer") || null,
        ip: req.ip,
      });
      return res.status(403).json({ error: "مصدر الطلب غير موثوق." });
    }

    if (hasSuspiciousAutomationSignals(req, deviceId)) {
      return res.status(403).json({
        error: "تعذر التحقق من هوية الجهاز. أعد المحاولة من التطبيق الرسمي.",
      });
    }

    const userAgent = req.get("user-agent") || "";
    const ipAddress = getClientIp(req);
    // Remove redeclaration since we did destructuring above

    // keep deviceName assignment below as is

    const deviceName =
      sanitizeText(req.body?.deviceName, 120) || inferDeviceName(userAgent);

    const blockedEntry = await findActiveBlock({ deviceId, ipAddress });
    if (blockedEntry) {
      return res.status(403).json({
        error: "تم حظر هذا الجهاز من الدخول إلى المنصة.",
        reason: blockedEntry.reason || "سبب غير محدد",
      });
    }

    await recordAccountSession({
      userId: null,
      email: "",
      deviceId,
      loginType: "guest",
      ipAddress,
      deviceName,
      userAgent,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    return handleInternalError(req, res, error, "POST /api/auth/guest-session failed");
  }
});

// ============================================
//   GET /api/auth/accounts-overview — لوحة إدارة الحسابات
// ============================================
router.get(
  "/accounts-overview",
  authenticate,
  requireAdmin,
  adminOpsLimiter,
  async (req, res) => {
    try {
      const q = sanitizeText(req.query?.q, 120).toLowerCase();
      const type = sanitizeText(req.query?.type, 20).toLowerCase();
      const { page, limit, offset } = parsePageLimit(req.query, 24, 100);

      const usersWhereParts = ["deletedAt IS NULL"];
      const usersWhereReplacements = [];
      if (q) {
        usersWhereParts.push(`(
                LOWER(COALESCE(fname, '')) LIKE ? OR
                LOWER(COALESCE(lname, '')) LIKE ? OR
                LOWER(COALESCE(email, '')) LIKE ? OR
                LOWER(COALESCE(role, '')) LIKE ?
            )`);
        const likeQ = `%${q}%`;
        usersWhereReplacements.push(likeQ, likeQ, likeQ, likeQ);
      }

      const usersSliceLimit = limit;
      const usersSliceOffset = offset;

      const [accountsOnlyRows] = await dbLayer.executeReadOnlyQuery(
        `SELECT id, fname, lname, email, role, createdAt
             FROM users
             WHERE ${usersWhereParts.join(" AND ")}
             ORDER BY createdAt DESC
             LIMIT ? OFFSET ?`,
        {
          replacements: usersWhereReplacements.concat([
            usersSliceLimit,
            usersSliceOffset,
          ]),
        },
      );

      const [usersCountRows] = await dbLayer.executeReadOnlyQuery(
        `SELECT COUNT(*) AS c
             FROM users
             WHERE ${usersWhereParts.join(" AND ")}`,
        { replacements: usersWhereReplacements },
      );

      const usersOnly = (accountsOnlyRows || []).map((u) => ({
        ...u,
        ipAddress: "",
        deviceId: "",
        deviceName: "",
        loginType: "google",
        lastSeenAt: null,
      }));

      let accounts = usersOnly;
      let guestSessions = [];

      // Try to enrich with account_sessions data. If schema differs in production,
      // keep serving users list instead of failing with 500.
      try {
        const [sessionColumnsRows] = await dbLayer.executeReadOnlyQuery(
          `SHOW COLUMNS FROM account_sessions`,
        );
        const sessionColumns = new Set(
          (sessionColumnsRows || []).map((r) => r.Field),
        );

        const hasUserIdCol = sessionColumns.has("userId");
        const hasEmailCol = sessionColumns.has("email");
        const hasDeviceIdCol = sessionColumns.has("deviceId");
        const hasDeviceNameCol = sessionColumns.has("deviceName");
        const hasUserAgentCol = sessionColumns.has("userAgent");
        const hasIpCol = sessionColumns.has("ipAddress");
        const hasLoginTypeCol = sessionColumns.has("loginType");
        const hasCreatedAtCol = sessionColumns.has("createdAt");

        const hasJoinKey = hasUserIdCol || hasEmailCol;
        const guestLastSeenExpr = hasCreatedAtCol
          ? "createdAt AS lastSeenAt"
          : "NULL AS lastSeenAt";

        if (hasJoinKey) {
          const sessionSelectFields = [
            hasUserIdCol ? "userId" : "NULL AS userId",
            hasEmailCol ? "email" : "'' AS email",
            hasIpCol ? "ipAddress" : "'' AS ipAddress",
            hasDeviceIdCol ? "deviceId" : "'' AS deviceId",
            hasDeviceNameCol ? "deviceName" : "'' AS deviceName",
            hasUserAgentCol ? "userAgent" : "'' AS userAgent",
            hasLoginTypeCol ? "loginType" : "'google' AS loginType",
            hasCreatedAtCol ? "createdAt AS lastSeenAt" : "NULL AS lastSeenAt",
          ].join(",\n                            ");

          const [sessionRows] = await dbLayer.executeReadOnlyQuery(
            `SELECT
                            ${sessionSelectFields}
                     FROM account_sessions
                     WHERE 1=1
                       ${hasLoginTypeCol ? "AND loginType <> 'guest'" : ""}
                     ORDER BY ${hasCreatedAtCol ? "createdAt DESC, id DESC" : "id DESC"}
                     LIMIT 500`,
          );

          const latestByUserId = new Map();
          const latestByEmail = new Map();

          const mergeSessionData = (base, candidate) => ({
            ...base,
            ipAddress: base?.ipAddress || candidate?.ipAddress || "",
            deviceId: base?.deviceId || candidate?.deviceId || "",
            deviceName:
              base?.deviceName ||
              candidate?.deviceName ||
              inferDeviceName(base?.userAgent || candidate?.userAgent || ""),
            loginType: base?.loginType || candidate?.loginType || "google",
            lastSeenAt: base?.lastSeenAt || candidate?.lastSeenAt || null,
          });

          for (const s of sessionRows || []) {
            const uid = Number(s.userId);
            const em = String(s.email || "")
              .trim()
              .toLowerCase();

            if (hasUserIdCol && Number.isInteger(uid) && uid > 0) {
              if (!latestByUserId.has(uid)) {
                latestByUserId.set(uid, s);
              } else {
                latestByUserId.set(
                  uid,
                  mergeSessionData(latestByUserId.get(uid), s),
                );
              }
            }

            if (hasEmailCol && em) {
              if (!latestByEmail.has(em)) {
                latestByEmail.set(em, s);
              } else {
                latestByEmail.set(
                  em,
                  mergeSessionData(latestByEmail.get(em), s),
                );
              }
            }
          }

          accounts = usersOnly.map((u) => {
            const byUserId = hasUserIdCol
              ? latestByUserId.get(Number(u.id))
              : null;
            const byEmail = hasEmailCol
              ? latestByEmail.get(String(u.email || "").toLowerCase())
              : null;
            const s = byUserId || byEmail || null;

            return {
              ...u,
              ipAddress: s?.ipAddress || "",
              deviceId: s?.deviceId || "",
              deviceName: s?.deviceName || inferDeviceName(s?.userAgent || ""),
              loginType: s?.loginType || "google",
              lastSeenAt: s?.lastSeenAt || null,
            };
          });

          if (hasLoginTypeCol) {
            const guestWhereParts = ["loginType = 'guest'"];
            const guestWhereReplacements = [];
            if (q) {
              const likeQ = `%${q}%`;
              const guestSearchParts = [];
              if (hasIpCol)
                guestSearchParts.push(
                  'LOWER(COALESCE(ipAddress, \"\")) LIKE ?',
                );
              if (hasDeviceIdCol)
                guestSearchParts.push('LOWER(COALESCE(deviceId, \"\")) LIKE ?');
              if (hasDeviceNameCol)
                guestSearchParts.push(
                  'LOWER(COALESCE(deviceName, \"\")) LIKE ?',
                );
              if (guestSearchParts.length > 0) {
                guestWhereParts.push(`(${guestSearchParts.join(" OR ")})`);
                for (let i = 0; i < guestSearchParts.length; i++)
                  guestWhereReplacements.push(likeQ);
              }
            }

            const guestSliceLimit = limit;
            const guestSliceOffset = offset;

            const [guestRows] = await dbLayer.executeReadOnlyQuery(
              `SELECT
                            id,
                            ${hasIpCol ? "ipAddress" : "'' AS ipAddress"},
                            ${hasDeviceIdCol ? "deviceId" : "'' AS deviceId"},
                            ${hasDeviceNameCol ? "deviceName" : "'' AS deviceName"},
                            ${guestLastSeenExpr}
                         FROM account_sessions
                         WHERE ${guestWhereParts.join(" AND ")}
                         ORDER BY id DESC
                         LIMIT ? OFFSET ?`,
              {
                replacements: guestWhereReplacements.concat([
                  guestSliceLimit,
                  guestSliceOffset,
                ]),
              },
            );
            guestSessions = guestRows || [];

            const [guestCountRows] = await dbLayer.executeReadOnlyQuery(
              `SELECT COUNT(*) AS c
                         FROM account_sessions
                         WHERE ${guestWhereParts.join(" AND ")}`,
              { replacements: guestWhereReplacements },
            );
            guestSessions._totalCount = Number(guestCountRows?.[0]?.c || 0);
          }
        }
      } catch (sessionsErr) {
        logger.warn(
          "⚠️ accounts-overview: account_sessions unavailable, returning users-only data",
          {
            error: sessionsErr.message,
          },
        );
      }

      const mappedAccounts = (accounts || []).map((a) => ({
        id: a.id,
        type: "account",
        fullName: `${a.fname || ""} ${a.lname || ""}`.trim() || a.email,
        email: a.email,
        role: a.role,
        ipAddress: a.ipAddress || "",
        deviceId: a.deviceId || "",
        deviceName: a.deviceName || "",
        loginType: a.loginType || "google",
        createdAt: a.createdAt,
        lastSeenAt: a.lastSeenAt || null,
      }));

      const mappedGuests = (guestSessions || []).map((g) => ({
        id: g.id,
        type: "guest",
        fullName: "ضيف (بدون حساب)",
        email: "",
        role: "guest",
        ipAddress: g.ipAddress || "",
        deviceId: g.deviceId || "",
        deviceName: g.deviceName || "",
        loginType: "guest",
        createdAt: g.lastSeenAt,
        lastSeenAt: g.lastSeenAt,
      }));

      let merged = mappedAccounts.concat(mappedGuests);
      if (type === "accounts") {
        merged = mappedAccounts;
      } else if (type === "guests") {
        merged = mappedGuests;
      }

      // Keep merged ordering deterministic by last activity/create time.
      merged.sort((a, b) => {
        const aTime = new Date(a.lastSeenAt || a.createdAt || 0).getTime() || 0;
        const bTime = new Date(b.lastSeenAt || b.createdAt || 0).getTime() || 0;
        return bTime - aTime;
      });

      const usersTotal = Number(usersCountRows?.[0]?.c || 0);
      const guestsTotal = Number(guestSessions?._totalCount || 0);

      let total;
      let pageItems;
      if (type === "accounts") {
        total = usersTotal;
        pageItems = merged;
      } else if (type === "guests") {
        total = guestsTotal;
        pageItems = merged;
      } else {
        total = usersTotal + guestsTotal;
        pageItems = merged.slice(offset, offset + limit);
      }

      const pages = Math.max(1, Math.ceil(total / limit));

      return res.json({
        accounts: pageItems.filter((i) => i.type === "account"),
        guests: pageItems.filter((i) => i.type === "guest"),
        items: pageItems,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext: page < pages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      return handleInternalError(
        req,
        res,
        error,
        "GET /api/auth/accounts-overview failed",
      );
    }
  },
);

router.delete(
  "/account-sessions/:id",
  authenticate,
  requireAdmin,
  adminOpsLimiter,
  async (req, res) => {
    try {
      const sessionId = Number(req.params.id);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: "معرّف الزيارة غير صالح." });
      }

      const cols = await getAccountSessionsColumns();
      const extraFilter = cols.has("loginType")
        ? `AND loginType = 'guest'`
        : cols.has("userId")
          ? `AND userId IS NULL`
          : "";

      const [deleteResult] = await dbLayer.executeWriteQuery(
    `DELETE FROM account_sessions
             WHERE id = ?
             ${extraFilter}`,
        { replacements: [sessionId] },
      );

      const affected = Number(deleteResult?.affectedRows || 0);
      if (affected === 0) {
        return res
          .status(404)
          .json({ error: "الزيارة غير موجودة أو لا يمكن حذفها." });
      }

      logger.info(
        `🗑️ تم حذف زيارة ضيف بواسطة الأدمن ${req.user.email} (sessionId=${sessionId})`,
      );
      return res.json({ ok: true, message: "تم حذف الزيارة بنجاح." });
    } catch (error) {
      return handleInternalError(
        req,
        res,
        error,
        "DELETE /api/auth/account-sessions/:id failed",
      );
    }
  },
);

router.delete(
  "/accounts/:id",
  authenticate,
  requireAdmin,
  adminOpsLimiter,
  async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: "معرّف الحساب غير صالح." });
      }

      if (req.user.id === targetId) {
        return res.status(400).json({ error: "لا يمكنك حذف حسابك الحالي." });
      }

      const targetUser = await User.findByPk(targetId);
      if (!targetUser) {
        return res.status(404).json({ error: "الحساب غير موجود." });
      }

      await targetUser.destroy();
      logger.info(
        `🗑️ تم حذف حساب بواسطة الأدمن: ${targetUser.email} بواسطة ${req.user.email}`,
      );
      return res.json({ ok: true, message: "تم حذف الحساب بنجاح." });
    } catch (error) {
      return handleInternalError(req, res, error, "DELETE /api/auth/accounts/:id failed");
    }
  },
);

router.post(
  "/blocked-devices",
  authenticate,
  requireAdmin,
  adminOpsLimiter,
  async (req, res) => {
    try {
      const email = sanitizeText(req.body?.email, 255).toLowerCase();
      const deviceId = sanitizeText(req.body?.deviceId, 120);
      const ipAddress = sanitizeText(req.body?.ipAddress, 64);
      const deviceName = sanitizeText(req.body?.deviceName, 120);
      const reason =
        sanitizeText(req.body?.reason, 255) || "تم الحظر بواسطة الإدارة";
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const deviceIdRegex = /^[a-zA-Z0-9_-]{10,120}$/;
      const ipRegex = /^[a-zA-Z0-9:.]{3,64}$/;

      if (email && !emailRegex.test(email)) {
        return res.status(400).json({ error: "صيغة البريد الإلكتروني غير صحيحة." });
      }
      if (deviceId && !deviceIdRegex.test(deviceId)) {
        return res.status(400).json({ error: "صيغة deviceId غير صحيحة." });
      }
      if (ipAddress && !ipRegex.test(ipAddress)) {
        return res.status(400).json({ error: "صيغة عنوان IP غير صحيحة." });
      }
      if (ipAddress && isIP(ipAddress) === 0) {
        return res.status(400).json({ error: "صيغة عنوان IP غير صحيحة." });
      }

      const currentAdminEmail = sanitizeText(
        req.user?.email,
        255,
      ).toLowerCase();
      const currentDeviceId = sanitizeText(req.get("x-device-id") || "", 120);
      const currentIpAddress = getClientIp(req);

      if (!email && !deviceId && !ipAddress) {
        return res
          .status(400)
          .json({ error: "يجب توفير email أو deviceId أو ipAddress للحظر." });
      }

      const targetsCurrentAdminSession =
        (email && currentAdminEmail && email === currentAdminEmail) ||
        (deviceId && currentDeviceId && deviceId === currentDeviceId) ||
        (ipAddress && currentIpAddress && ipAddress === currentIpAddress);

      if (targetsCurrentAdminSession) {
        return res.status(400).json({
          error:
            "لا يمكنك حظر جهازك/جلسة الأدمن الحالية حتى لا تفقد الوصول للإدارة.",
        });
      }

      const hasAdminHistory = await targetHasAdminHistory({
        email,
        deviceId,
        ipAddress,
      });
      if (hasAdminHistory) {
        return res.status(400).json({
          error: "لا يمكن حظر هذا الجهاز/الـIP لأنه مرتبط بسجل دخول أدمن.",
        });
      }

      if (email) {
        const targetUser = await User.findOne({ where: { email } });
        if (targetUser && targetUser.role === "admin") {
          return res
            .status(400)
            .json({ error: "لا يمكن حظر حساب معلم (admin) من هذه الشاشة." });
        }
      }

      const cols = await getBlockedDevicesColumns();
      const insertCols = [];
      const placeholders = [];
      const replacements = [];

      const pushVal = (colName, value) => {
        if (!cols.has(colName)) return;
        insertCols.push(colName);
        placeholders.push("?");
        replacements.push(value);
      };

      // Canonical empty strings make DB uniqueness deterministic across NULL values.
      pushVal("email", email || "");
      pushVal("deviceId", deviceId || "");
      pushVal("ipAddress", ipAddress || "");
      pushVal("deviceName", deviceName || null);
      pushVal("reason", reason);
      pushVal("blockedBy", req.user.email || "admin");
      pushVal("isActive", 1);

      const onDuplicateUpdates = [];
      if (cols.has("reason")) onDuplicateUpdates.push("reason = VALUES(reason)");
      if (cols.has("deviceName")) {
        onDuplicateUpdates.push("deviceName = VALUES(deviceName)");
      }
      if (cols.has("blockedBy")) {
        onDuplicateUpdates.push("blockedBy = VALUES(blockedBy)");
      }
      if (cols.has("updatedAt")) onDuplicateUpdates.push("updatedAt = NOW()");
      if (onDuplicateUpdates.length === 0) onDuplicateUpdates.push("id = id");

      if (cols.has("createdAt")) {
        insertCols.push("createdAt");
        placeholders.push("NOW()");
      }
      if (cols.has("updatedAt")) {
        insertCols.push("updatedAt");
        placeholders.push("NOW()");
      }

      await dbLayer.executeWriteQuery(
        `INSERT INTO blocked_devices
                (${insertCols.join(", ")})
             VALUES (${placeholders.join(", ")})
             ON DUPLICATE KEY UPDATE ${onDuplicateUpdates.join(", ")}`,
        { replacements },
      );

      logger.warn(
        `⛔ Access blocked by ${req.user.email}: email=${email || "-"} deviceId=${deviceId || "-"} ip=${ipAddress || "-"}`,
      );
      return res
        .status(201)
        .json({ ok: true, message: "تم حفظ الحظر بنجاح (إدراج/تحديث ذري)." });
    } catch (error) {
      return handleInternalError(req, res, error, "POST /api/auth/blocked-devices failed");
    }
  },
);

router.get(
  "/blocked-devices",
  authenticate,
  requireAdmin,
  adminOpsLimiter,
  async (req, res) => {
    try {
      const q = sanitizeText(req.query?.q, 120).toLowerCase();
      const { page, limit, offset } = parsePageLimit(req.query, 24, 100);
      const cols = await getBlockedDevicesColumns();
      const emailSelect = cols.has("email") ? "email" : "'' AS email";
      const searchableParts = [];
      const replacements = [];
      if (q) {
        const likeQ = `%${q}%`;
        if (cols.has("email")) searchableParts.push("LOWER(COALESCE(email, '')) LIKE ?");
        if (cols.has("deviceId")) searchableParts.push("LOWER(COALESCE(deviceId, '')) LIKE ?");
        if (cols.has("ipAddress")) searchableParts.push("LOWER(COALESCE(ipAddress, '')) LIKE ?");
        if (cols.has("deviceName")) searchableParts.push("LOWER(COALESCE(deviceName, '')) LIKE ?");
        if (cols.has("reason")) searchableParts.push("LOWER(COALESCE(reason, '')) LIKE ?");
        if (cols.has("blockedBy")) searchableParts.push("LOWER(COALESCE(blockedBy, '')) LIKE ?");
        for (let i = 0; i < searchableParts.length; i++) replacements.push(likeQ);
      }

      const whereParts = ["isActive = 1"];
      if (searchableParts.length > 0) {
        whereParts.push(`(${searchableParts.join(" OR ")})`);
      }

      const [rowsRaw] = await dbLayer.executeReadOnlyQuery(
        `SELECT id, ${emailSelect}, deviceId, ipAddress, deviceName, reason, blockedBy, isActive, createdAt
             FROM blocked_devices
             WHERE ${whereParts.join(" AND ")}
             ORDER BY id DESC
             LIMIT ? OFFSET ?`,
        { replacements: replacements.concat([limit, offset]) },
      );

      const [countRows] = await dbLayer.executeReadOnlyQuery(
        `SELECT COUNT(*) AS c
             FROM blocked_devices
             WHERE ${whereParts.join(" AND ")}`,
        { replacements },
      );

      const total = Number(countRows?.[0]?.c || 0);
      const pages = Math.max(1, Math.ceil(total / limit));
      const devices = rowsRaw || [];

      return res.json({
        devices,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext: page < pages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      return handleInternalError(req, res, error, "GET /api/auth/blocked-devices failed");
    }
  },
);

router.delete(
  "/blocked-devices/:id",
  authenticate,
  requireAdmin,
  adminOpsLimiter,
  async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      if (!Number.isInteger(blockId) || blockId <= 0) {
        return res.status(400).json({ error: "معرّف الحظر غير صالح." });
      }

      const [updateResult] = await dbLayer.executeWriteQuery(
    `UPDATE blocked_devices
             SET isActive = 0, updatedAt = NOW()
             WHERE id = ?`,
        { replacements: [blockId] },
      );

      const affected = Number(updateResult?.affectedRows || 0);
      if (affected === 0) {
        return res.status(404).json({ error: "سجل الحظر غير موجود." });
      }

      logger.info(
        `🔓 تم فك الحظر بواسطة الأدمن ${req.user.email} (blockId=${blockId})`,
      );

      return res.json({ ok: true, message: "تم فك الحظر بنجاح." });
    } catch (error) {
      return handleInternalError(
        req,
        res,
        error,
        "DELETE /api/auth/blocked-devices/:id failed",
      );
    }
  },
);

// ============================================
//   PUT /api/auth/complete-profile — إكمال الاسم
// ============================================
/**
 * @route PUT /api/auth/complete-profile
 * @description Allows an authenticated user to set their first and last name, marking their profile as complete.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with `fname` and `lname` in body.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.put(
  "/complete-profile",
  authenticate,
  validateCompleteProfile,
  async (req, res) => {
    try {
      const { fname, lname } = req.body;

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود." });
      }

      user.fname = fname.trim().substring(0, 50);
      user.lname = lname.trim().substring(0, 50);
      user.isProfileComplete = true;
      await user.save();

      res.json({
        message: `أهلاً بك يا ${user.fname}! تم حفظ اسمك بنجاح.`,
        user: {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          fullName: `${user.fname} ${user.lname}`,
          avatar: user.avatar,
          role: user.role,
        },
      });
    } catch (error) {
      return handleInternalError(req, res, error, "PUT /api/auth/complete-profile failed");
    }
  },
);

// ============================================
//   GET /api/auth/me — جلب بيانات المستخدم الحالي
// ============================================
/**
 * @route GET /api/auth/me
 * @description Returns the currently authenticated user's profile data.
 *   Admin users receive their email in the response; students do not.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request with `req.user` set by authenticate.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
router.get("/me", authenticate, async (req, res) => {
  await touchAccountSessionIfNeeded(req, req.user, "activity");

  const userData = {
    id: req.user.id,
    fname: req.user.fname,
    lname: req.user.lname,
    fullName:
      req.user.fname && req.user.lname
        ? `${req.user.fname} ${req.user.lname}`
        : "",
    avatar: req.user.avatar,
    role: req.user.role,
    isProfileComplete: req.user.isProfileComplete,
  };

  if (req.user.role === "admin") {
    userData.email = req.user.email;
  }

  res.json({ user: userData });
});

// ============================================
//   GET /api/auth/verify-admin
// ============================================
/**
 * @route GET /api/auth/verify-admin
 * @description Verifies whether the authenticated user has admin privileges.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with `{ isAdmin: boolean }`.
 * @returns {void}
 */
router.get("/verify-admin", authenticate, (req, res) => {
  if (req.user.role !== "admin") {
    logger.warn(
      `🚨 محاولة وصول لصلاحيات الأدمن — بواسطة: ${req.user.email}, IP: ${req.ip}`,
    );
    return res.status(403).json({
      isAdmin: false,
      error: "ليس لديك صلاحيات الإدارة. تواصل مع المعلم.",
    });
  }

  res.json({
    isAdmin: true,
    message: `مرحباً أستاذ ${req.user.fname}! صلاحيات الإدارة مفعّلة.`,
  });
});

// ============================================
//   POST /api/auth/create-admin — إنشاء/ترقية أدمن
// ============================================
/**
 * @route POST /api/auth/create-admin
 * @description Creates a new admin account or promotes an existing user to admin.
 *   ⚠️ HARDENED: Now requires ADMIN authentication + full audit trail.
 *   Static ADMIN_CREATE_SECRET is deprecated (was a critical security risk).
 * @access Private — requires authentication as admin.
 * @param {import('express').Request} req - Express request with `email`, `fname`, `lname` in body.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.post(
  "/create-admin",
  authenticate,
  requireAdmin,
  createAdminLimiter,
  validateCreateAdmin,
  async (req, res) => {
    try {
      const { email, fname, lname } = req.body;
      const requestingAdminEmail = sanitizeText(
        req.user?.email,
        255,
      ).toLowerCase();
      const requestingAdminId = req.user?.id;

      // ✅ SECURITY: Full audit log for admin creation/promotion
      logger.warn(
        `⚠️ ADMIN CREATION ATTEMPT by ${requestingAdminEmail} (ID=${requestingAdminId}): target=${email.toLowerCase()}, IP=${req.ip}`,
      );

      const normalizedEmail = sanitizeText(email, 255).toLowerCase();
      const normalizedFname = sanitizeText(fname, 50).trim();
      const normalizedLname = sanitizeText(lname, 50).trim();

      // ✅ FIX: Prevent self-promotion exploit
      if (normalizedEmail === requestingAdminEmail) {
        logger.warn(
          `⛔ BLOCKED SELF-PROMOTION: ${requestingAdminEmail} attempted to promote self`,
        );
        return res
          .status(400)
          .json({ error: "لا يمكنك ترقية حسابك الخاص. يجب أن يقوم أدمن آخر." });
      }

      const existing = await User.findOne({
        where: { email: normalizedEmail },
      });
      if (existing) {
        const oldRole = existing.role;
        existing.role = "admin";
        existing.fname = normalizedFname;
        existing.lname = normalizedLname;
        existing.isProfileComplete = true;
        // Invalidate all old sessions when promoting to admin
        existing.tokenVersion = (existing.tokenVersion || 0) + 1;
        await existing.save();

        logger.warn(
          `👑 ADMIN PROMOTION: ${normalizedEmail} (prev: ${oldRole}) by ${requestingAdminEmail} via IP=${req.ip}`,
        );

        // Do NOT issue token — target must log in to get new admin token
        return res.json({
          message:
            "تم ترقية الحساب لمعلم بنجاح! يجب أن يسجل دخول مرة أخرى لتفعيل الصلاحيات.",
          user: {
            id: existing.id,
            email: existing.email,
            fname: existing.fname,
            lname: existing.lname,
            fullName: `${existing.fname} ${existing.lname}`,
            role: existing.role,
          },
        });
      }

      // New admin creation — must be existing user
      const newAdmin = await User.create({
        email: normalizedEmail,
        fname: normalizedFname,
        lname: normalizedLname,
        isProfileComplete: true,
        role: "admin",
      });

      logger.warn(
        `👑 NEW ADMIN CREATED: ${normalizedEmail} by ${requestingAdminEmail} via IP=${req.ip}`,
      );

      // Target must log in themselves to get admin token
      res.status(201).json({
        message:
          "تم إنشاء حساب المعلم الجديد بنجاح! يجب أن يسجل دخول لتفعيل الحساب.",
        user: {
          id: newAdmin.id,
          email: newAdmin.email,
          fname: newAdmin.fname,
          lname: newAdmin.lname,
          fullName: `${newAdmin.fname} ${newAdmin.lname}`,
          role: newAdmin.role,
        },
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return res.status(409).json({ error: "هذا البريد مسجل بالفعل." });
      }
      return handleInternalError(req, res, error, "POST /api/auth/create-admin failed");
    }
  },
);

// ============================================
//   POST /api/auth/refresh — تجديد التوكن
/**
 * @route POST /api/auth/refresh
 * @description Refreshes the JWT for the authenticated user.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with `{ token: string }`.
 * @returns {Promise<void>}
 */
router.post("/refresh", authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "المستخدم غير موجود." });
    }
    
    // Token Refresh Rotation: أبطل القديم بإصدار رقم إصدار جديد
    user.tokenVersion += 1;
    await user.save();

    const newToken = generateToken(
      user.id,
      user.role,
      user.tokenVersion,
      user.email,
    );
    setTokenCookie(res, newToken);
    logger.info(`🔄 تجديد توكن — ${user.email}`);
    res.json({ message: "تم تجديد الجلسة." });
  } catch (error) {
    return handleInternalError(req, res, error, "POST /api/auth/refresh failed");
  }
});

// ============================================
//   POST /api/auth/logout — تسجيل الخروج (إلغاء كل التوكنات)
// ============================================
/**
 * @route POST /api/auth/logout
 * @description Logs the user out by incrementing their `tokenVersion`, effectively
 *   invalidating all previously issued JWTs.
 * @access Private — requires authentication.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>}
 */
router.post("/logout", authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "المستخدم غير موجود." });
    }
    // زيادة tokenVersion لإلغاء كل التوكنات السابقة
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    clearTokenCookie(res);
    clearCsrfCookie(res);
    logger.info(`🚪 تسجيل خروج وإلغاء كل التوكنات — ${user.email}`);
    res.json({ message: "تم تسجيل الخروج بنجاح." });
  } catch (error) {
    return handleInternalError(req, res, error, "POST /api/auth/logout failed");
  }
});

module.exports = router;
