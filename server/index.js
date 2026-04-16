/**
 * @file Main server entry point
 * @description Configures and starts the Express application for the interactive quiz platform.
 *   Sets up security middleware (Helmet, CORS, HPP), rate limiting, static file serving,
 *   Sequelize model associations, API routes, and graceful shutdown handling.
 * @module server/index
 */

// ============================================
//   New Relic APM — مراقبة الأداء
// ============================================
// Initialize New Relic agent (optional). Skip if package not installed or license not set.
try {
  if (process.env.NEW_RELIC_LICENSE_KEY) {
    require("newrelic");
  }
} catch (err) {
  // Only warn in production if license is set but module missing.
  if (process.env.NEW_RELIC_LICENSE_KEY) {
     
    console.warn("New Relic module not found; APM disabled:", err.message);
  }
}

// ============================================
//   سيرفر منصة الاختبارات التفاعلية
//   بسم الله الرحمن الرحيم
//   — Sequelize + TiDB (MySQL) —
// ============================================

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { isIP, BlockList } = require("net");
const logger = require("./utils/logger");
const { sanitizeBody } = require("./middleware/sanitize");
const { verifyCsrf, setCsrfCookie } = require("./middleware/auth");
const {
  createDdosAnomalyGuard,
  createDistributedWindowLimiter,
  createUserAwareRateLimiter: createDistributedRateLimiter,
  closeDdosRedisClient,
} = require("./middleware/ddosProtection");
const { createCircuitBreaker } = require("./utils/circuitBreaker");
const { buildSanitizedErrorLog } = require("./utils/secureErrorLog");
const {
  enforceHttps,
  enforceCookieSecurity,
  addResponseIntegrityHeader,
  additionalSecurityHeaders,
} = require("./middleware/encryption-security");

// ============================================
//   Environment Validation — فحص المتغيرات
// ============================================
/**
 * Environment variables required for the application to run.
 * In production, the server exits if any are missing.
 * @type {string[]}
 * @constant
 */
const requiredEnvVars = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "JWT_SECRET",
  "GOOGLE_CLIENT_ID",
];
const JWT_ISSUER = process.env.JWT_ISSUER || "quiz-platform-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "quiz-platform-client";
const HEALTHCHECK_TOKEN = String(process.env.HEALTHCHECK_TOKEN || "").trim();

function getPositiveIntEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const dbCircuitBreaker = createCircuitBreaker({
  name: "database",
  failureThreshold: getPositiveIntEnv("DB_CIRCUIT_FAILURE_THRESHOLD", 5),
  recoveryTimeMs: getPositiveIntEnv("DB_CIRCUIT_RECOVERY_MS", 30_000),
  halfOpenSuccesses: getPositiveIntEnv("DB_CIRCUIT_HALF_OPEN_SUCCESSES", 2),
});
const dbCircuitTimeoutMs = getPositiveIntEnv("DB_CIRCUIT_TIMEOUT_MS", 4000);

async function executeDbGuarded(operation, options = {}) {
  const timeoutMs = options.timeoutMs || dbCircuitTimeoutMs;
  return dbCircuitBreaker.execute(operation, { timeoutMs });
}

function verifyHealthAccess(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();

  const callerIp = normalizeIp(req.ip || req.socket?.remoteAddress || "");
  if (callerIp === "127.0.0.1" || callerIp === "::1") return next();
  if (isPrivateIp(callerIp)) return next();

  if (!HEALTHCHECK_TOKEN) {
    logger.error("❌ HEALTHCHECK_TOKEN is missing in production.");
    return res.status(503).json({ error: "Health check temporarily unavailable." });
  }

  const provided = String(req.get("x-health-token") || "").trim();
  if (!provided || provided !== HEALTHCHECK_TOKEN) {
    return res.status(401).json({ error: "Unauthorized health check request." });
  }

  return next();
}

const missingEnv = requiredEnvVars.filter((v) => !process.env[v]);
if (missingEnv.length > 0) {
  logger.error(`❌ متغيرات البيئة الناقصة: ${missingEnv.join(", ")}`);
  if (process.env.NODE_ENV === "production") process.exit(1);
  logger.warn("⚠️ متابعة في وضع التطوير بدون بعض المتغيرات...");
}

if (
  process.env.NODE_ENV === "production" &&
  !String(process.env.DEVICE_FP_SECRET || "").trim()
) {
  logger.error(
    "❌ DEVICE_FP_SECRET is required in production for device fingerprint signing.",
  );
  process.exit(1);
}

// Optional: Log New Relic status
if (process.env.NEW_RELIC_LICENSE_KEY) {
  logger.info("✅ New Relic APM مفعل");
} else {
  logger.warn("⚠️ New Relic APM غير مفعل - NEW_RELIC_LICENSE_KEY غير محدد");
}

// --- Sequelize + Models ---
const sequelize = require("./models/index");
const User = require("./models/User");
const Quiz = require("./models/Quiz");
const Score = require("./models/Score");
const Note = require("./models/Note");
const QuizProgress = require("./models/QuizProgress");
QuizProgress.belongsTo(User, {
  as: "user",
  foreignKey: "userId",
  onDelete: "CASCADE",
});
QuizProgress.belongsTo(Quiz, {
  as: "quiz",
  foreignKey: "quizId",
  onDelete: "CASCADE",
});
User.hasMany(QuizProgress, { foreignKey: "userId", onDelete: "CASCADE" });
Quiz.hasMany(QuizProgress, { foreignKey: "quizId", onDelete: "CASCADE" });

// --- العلاقات (Associations) ---
Quiz.belongsTo(User, { as: "creator", foreignKey: "createdBy" });
Score.belongsTo(User, {
  as: "user",
  foreignKey: "userId",
  onDelete: "CASCADE",
});
Score.belongsTo(Quiz, {
  as: "quiz",
  foreignKey: "quizId",
  onDelete: "CASCADE",
});
Note.belongsTo(User, { as: "creator", foreignKey: "createdBy" });
User.hasMany(Score, { foreignKey: "userId", onDelete: "CASCADE" });
Quiz.hasMany(Score, { foreignKey: "quizId", onDelete: "CASCADE" });

// --- استيراد المسارات (Routes) ---
const authRoutes = require("./routes/auth");
const quizRoutes = require("./routes/quizzes");
const scoreRoutes = require("./routes/scores");
const noteRoutes = require("./routes/notes");
const attemptsRoutes = require("./routes/attempts");

/**
 * Express application instance.
 * @type {import('express').Application}
 */
const app = express();

// --- Swagger setup ---
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: { 
      title: 'Quiz Platform API', 
      version: '1.0.0',
      description: 'API Documentation for Quiz Platform Backend'
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Local Server' },
      { url: 'https://api.ruzan.dev', description: 'Production Server' }
    ]
  },
  apis: [path.join(__dirname, 'routes', '*.js'), path.join(__dirname, 'index.js')]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
if (
  process.env.ENABLE_API_DOCS === "true" &&
  process.env.NODE_ENV !== "production"
) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

/** 
 * @swagger
 * /api/users:
 *   get:
 *     summary: Retrieve users
 *     responses: { 200: { description: OK } }
 */
// ---------------------


// خلف البروكسي (Railway/Render/NGINX)
const proxyHops = process.env.NODE_ENV === "production" ? 1 : 0;
app.set("trust proxy", proxyHops);

const trustedProxyIps = new Set(
  (process.env.TRUSTED_PROXY_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean),
);

const allowedInternalClientIps = new Set(
  (process.env.ALLOWED_INTERNAL_CLIENT_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean),
);

function normalizeIp(rawIp) {
  if (!rawIp) return "";
  const trimmed = String(rawIp).trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.substring(7);
  return trimmed;
}

function isPrivateIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (normalized === "127.0.0.1" || normalized === "::1") return true;
  if (normalized.startsWith("10.") || normalized.startsWith("192.168.")) {
    return true;
  }

  const octets = normalized.split(".");
  if (octets.length === 4) {
    const first = Number(octets[0]);
    const second = Number(octets[1]);
    if (Number.isInteger(first) && Number.isInteger(second)) {
      if (first === 172 && second >= 16 && second <= 31) return true;
    }
  }

  return false;
}

function isTrustedProxySource(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (trustedProxyIps.has(normalized)) return true;
  if (isPrivateIp(normalized)) return true;
  return false;
}

app.use((req, res, next) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const ips = forwarded
      .split(",")
      .map((ip) => normalizeIp(ip))
      .filter(Boolean);

    const proxySourceIp = normalizeIp(req.socket?.remoteAddress || "");
    if (!isTrustedProxySource(proxySourceIp)) {
      logger.warn(
        `Untrusted proxy source for X-Forwarded-For: source=${proxySourceIp || "unknown"} path=${req.path}`,
      );
      return res.status(400).json({ error: "Invalid request headers" });
    }

    if (ips.some((ip) => isIP(ip) === 0)) {
      logger.warn(
        `Invalid X-Forwarded-For IP format from ${req.ip}: ${forwarded}`,
      );
      return res.status(400).json({ error: "Invalid request headers" });
    }

    const maxHops = proxyHops + 1;
    if (ips.length > maxHops) {
      logger.warn(`Invalid X-Forwarded-For length: ${ips.length} from ${req.ip}`);
      return res.status(400).json({ error: "Invalid request headers" });
    }

    const clientIp = ips[ips.length - 1];
    const isAllowedInternalClient = allowedInternalClientIps.has(clientIp);
    if (
      process.env.NODE_ENV === "production" &&
      isPrivateIp(clientIp) &&
      !isAllowedInternalClient
    ) {
      logger.warn(
        `Spoofed private IP in X-Forwarded-For: ${clientIp} from ${req.ip}`,
      );
      return res.status(400).json({ error: "Invalid request headers" });
    }
  }
  return next();
});

// ============================================
//     طبقات الأمان والأداء (Security + Perf)
// ============================================

// 1. Helmet — هيدرز أمان شاملة
// 1. Add Nonce generation middleware
// app.use crypto generated nonce
app.use((req, res, next) => {
  res.locals.nonce = require("crypto").randomBytes(16).toString("base64");
  next();
});

const cspConnectSources = [
  "'self'",
  ...Array.from(
    new Set(
      String(process.env.CSP_CONNECT_SRC || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ),
];

// 2. Helmet — هيدرز أمان شاملة
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        // Keep style attributes allowed (runtime JS sets element.style),
        // but require nonce for inline <style> blocks.
        "style-src": ["'self'", "https://cdn.jsdelivr.net"],
        "style-src-elem": [
          "'self'",
          "https://cdn.jsdelivr.net",
          (req, res) => `'nonce-${res.locals.nonce}'`,
        ],
        "style-src-attr": ["'unsafe-inline'"],
        "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": cspConnectSources,
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    permissionsPolicy: {
      features: {
        camera: [],
        microphone: [],
        geolocation: [],
      },
    },
  }),
);

// ✅ ENCRYPTION SECURITY: Apply encryption and HTTPS enforcement
app.use(enforceHttps); // Redirect HTTP → HTTPS in production
app.use(enforceCookieSecurity); // Set strict cookie security options
app.use(addResponseIntegrityHeader); // Add SHA-256 hash for response validation
app.use(additionalSecurityHeaders); // HSTS, Permissions-Policy, etc.

// 2. Compression — ضغط الاستجابات (gzip/brotli)
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }),
);

// 3. CORS — تحديد المصادر المسموحة
/**
 * Allowed CORS origins, loaded from the ALLOWED_ORIGINS environment variable.
 * Defaults to `['http://localhost:3000']` in development.
 * @type {string[]}
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const internalIps = (process.env.INTERNAL_IPS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === "production";

const internalIpBlockList = new BlockList();
internalIps.forEach((entry) => {
  const normalizedEntry = normalizeIp(entry);
  if (!normalizedEntry) return;

  if (normalizedEntry.includes("/")) {
    const [baseRaw, prefixRaw] = normalizedEntry.split("/");
    const base = normalizeIp(baseRaw);
    const prefix = Number(prefixRaw);
    const version = isIP(base);
    if (!version || !Number.isInteger(prefix)) {
      logger.warn(`Ignoring invalid INTERNAL_IPS entry: ${entry}`);
      return;
    }
    if ((version === 4 && (prefix < 0 || prefix > 32)) || (version === 6 && (prefix < 0 || prefix > 128))) {
      logger.warn(`Ignoring out-of-range INTERNAL_IPS CIDR prefix: ${entry}`);
      return;
    }
    internalIpBlockList.addSubnet(base, prefix, version === 4 ? "ipv4" : "ipv6");
    return;
  }

  const version = isIP(normalizedEntry);
  if (!version) {
    logger.warn(`Ignoring invalid INTERNAL_IPS IP: ${entry}`);
    return;
  }
  internalIpBlockList.addAddress(normalizedEntry, version === 4 ? "ipv4" : "ipv6");
});

function isInternalIp(ip) {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) return false;
  const version = isIP(normalizedIp);
  if (!version) return false;
  return internalIpBlockList.check(normalizedIp, version === 4 ? "ipv4" : "ipv6");
}

app.use(
  cors((req, callback) => {
    const origin = req.get("origin");

    if (!origin) {
      if (!isProduction) {
        return callback(null, { credentials: true, origin: true });
      }

      // Some browsers/webviews/proxies drop Origin on same-site read requests.
      // Keep writes strict, but allow read-only requests to avoid blank public data modules.
      const isSafeReadRequest = ["GET", "HEAD"].includes(req.method);
      if (isSafeReadRequest) {
        return callback(null, { credentials: true, origin: true });
      }

      // Browser top-level navigations often omit Origin.
      // Allow non-API page requests while keeping API traffic strict.
      const isNonApiPageRequest =
        ["GET", "HEAD"].includes(req.method) &&
        !String(req.path || "").startsWith("/api/");
      if (isNonApiPageRequest) {
        return callback(null, { credentials: true, origin: true });
      }

      // Same-origin browser fetches can also omit Origin on some requests.
      const secFetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
      const isLikelySameOriginFetch = ["same-origin", "same-site", "none"].includes(
        secFetchSite,
      );

      const referer = String(req.get("referer") || "");
      const hasTrustedReferer = (() => {
        if (!referer) return false;
        try {
          const refererOrigin = new URL(referer).origin;
          return allowedOrigins.some((allowed) => {
            try {
              return new URL(allowed).origin === refererOrigin;
            } catch {
              return false;
            }
          });
        } catch {
          return false;
        }
      })();

      if (isLikelySameOriginFetch || hasTrustedReferer) {
        return callback(null, { credentials: true, origin: true });
      }

      // Internal health checks and reverse-proxy hops frequently omit Origin.
      const callerIp = normalizeIp(req.ip);
      if (isPrivateIp(callerIp)) {
        return callback(null, { credentials: true, origin: true });
      }

      const internalHeader =
        String(req.get("x-internal-request") || "").toLowerCase() === "true";
      if (internalHeader && isInternalIp(callerIp)) {
        logger.info(
          `Internal request allowed from ${callerIp} with X-Internal-Request`,
        );
        return callback(null, { credentials: true, origin: true });
      }

      return callback(new Error("CORS: Origin missing"));
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, { credentials: true, origin: true });
    }

    logger.warn("🚫 CORS blocked origin:", { origin, ip: normalizeIp(req.ip) });
    return callback(new Error("CORS not allowed"));
  }),
);

// 4. منع HTTP Parameter Pollution
app.use(
  hpp({
    whitelist: ["page", "limit", "sort", "q", "search"],
  }),
);

// 5. Cookie Parser
app.use(cookieParser());

const enableAdvancedDdosProtection =
  process.env.ENABLE_ADVANCED_DDOS_PROTECTION !== "false" &&
  process.env.NODE_ENV !== "test";

if (enableAdvancedDdosProtection) {
  const apiAnomalyGuard = createDdosAnomalyGuard({
    bucketMs: getPositiveIntEnv("DDOS_BURST_WINDOW_MS", 10_000),
    maxPerBucket: getPositiveIntEnv("DDOS_BURST_MAX", 120),
    scoreThreshold: getPositiveIntEnv("DDOS_SCORE_THRESHOLD", 4),
    banMs: getPositiveIntEnv("DDOS_BAN_MS", 10 * 60 * 1000),
  });

  const apiBurstLimiter = createDistributedWindowLimiter({
    keyPrefix: "ddos:api",
    windowMs: getPositiveIntEnv("DDOS_API_WINDOW_MS", 10_000),
    max: getPositiveIntEnv("DDOS_API_MAX", 180),
    message: "تم تجاوز حد الاندفاع العام. حاول بعد قليل.",
    getKey: (req) => String(req.ip || "unknown"),
  });

  const writeBurstLimiter = createDistributedWindowLimiter({
    keyPrefix: "ddos:write",
    windowMs: getPositiveIntEnv("DDOS_WRITE_WINDOW_MS", 60_000),
    max: getPositiveIntEnv("DDOS_WRITE_MAX", 120),
    message: "تم تجاوز حد طلبات التعديل/الإنشاء. حاول بعد قليل.",
    getKey: (req) => String(req.ip || "unknown"),
  });

  const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const isApiHealthPath = (req) => String(req.path || "") === "/health";

  app.use("/api", (req, res, next) => {
    if (isApiHealthPath(req)) return next();
    return apiAnomalyGuard(req, res, next);
  });
  app.use("/api", (req, res, next) => {
    if (isApiHealthPath(req)) return next();
    return apiBurstLimiter(req, res, next);
  });
  app.use("/api", (req, res, next) => {
    if (isApiHealthPath(req)) return next();
    if (!mutatingMethods.has(req.method)) return next();
    return writeBurstLimiter(req, res, next);
  });
}

// Ensure CSRF cookie exists before first authenticated/mutating interaction
// so initial Google login can still pass strict CSRF checks.
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.cookies?.csrf_token) {
    setCsrfCookie(res);
  }
  next();
});

// 6. JSON parsing
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

let blockedDevicesColumnsCache = null;

async function getBlockedDevicesColumns() {
  if (blockedDevicesColumnsCache) return blockedDevicesColumnsCache;
  const [rows] = await sequelize.query(`SHOW COLUMNS FROM blocked_devices`);
  blockedDevicesColumnsCache = new Set((rows || []).map((r) => r.Field));
  return blockedDevicesColumnsCache;
}

function getTrustedSessionIdentity(req) {
  try {
    // SECURITY TRUST FLOW: extract identity only from verified JWT, never from client headers.
    const cookieToken = req.cookies?.jwt;
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : "";
    const token = cookieToken || bearerToken;
    if (!token || token.length > 2048 || !process.env.JWT_SECRET) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (!decoded?.userId) return null;

    return {
      userId: Number(decoded.userId) || null,
      email:
        typeof decoded.email === "string" && decoded.email.trim()
          ? decoded.email.trim().toLowerCase().substring(0, 255)
          : "",
    };
  } catch (_) {
    return null;
  }
}

function getSignedDeviceFingerprint(req) {
  const fingerprint = String(req.cookies?.device_fp || "")
    .trim()
    .substring(0, 120);
  const signature = String(req.cookies?.device_fp_sig || "")
    .trim()
    .substring(0, 256);
  const secret = String(process.env.DEVICE_FP_SECRET || "").trim();

  if (!secret) {
    if (!getSignedDeviceFingerprint._warnedMissingSecret) {
      logger.warn(
        "DEVICE_FP_SECRET is not configured; signed device fingerprint checks are disabled.",
      );
      getSignedDeviceFingerprint._warnedMissingSecret = true;
    }
    return "";
  }

  if (!fingerprint || !signature || !secret) return "";

  const expected = crypto
    .createHmac("sha256", secret)
    .update(fingerprint)
    .digest("hex");

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (signatureBuffer.length !== expectedBuffer.length) return "";

  // SECURITY: Only accept server-signed device fingerprints to prevent spoofing.
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return "";
  return fingerprint;
}

app.use(async (req, res, next) => {
  if (process.env.NODE_ENV === "test") return next();
  if (req.method === "POST" && req.path === "/api/auth/google") return next();
  if (req.method === "GET" && (req.path === "/" || req.path === "/index.html"))
    return next();
  try {
    // SECURITY TRUST FLOW: Verified JWT -> trusted user identity -> blocklist check.
    const sessionIdentity = getTrustedSessionIdentity(req);
    const userId = sessionIdentity?.userId || null;
    const email = sessionIdentity?.email || "";
    // SECURITY: use server-resolved IP only (trust proxy configured at app level).
    const ipAddress = String(req.ip || "").trim().substring(0, 64);
    const signedDeviceFingerprint = getSignedDeviceFingerprint(req);

    if (!userId && !ipAddress && !signedDeviceFingerprint) return next();

    const cols = await getBlockedDevicesColumns();
    let filter = "";
    let replacement = null;

    // SECURITY PRIORITY: Authenticated User ID > Trusted Server IP > Signed Device Fingerprint.
    if (userId && cols.has("userId")) {
      filter = "userId = ?";
      replacement = userId;
    } else if (userId && email && cols.has("email")) {
      filter = "email = ?";
      replacement = email;
    } else if (ipAddress && cols.has("ipAddress")) {
      filter = "ipAddress = ?";
      replacement = ipAddress;
    } else if (signedDeviceFingerprint && cols.has("deviceId")) {
      filter = "deviceId = ?";
      replacement = signedDeviceFingerprint;
    }

    if (!filter) return next();

    const [rows] = await sequelize.query(
      `SELECT id, reason FROM blocked_devices
             WHERE isActive = 1
               AND (${filter})
             ORDER BY id DESC
             LIMIT 1`,
      { replacements: [replacement] },
    );

    if (rows && rows.length > 0) {
      const reason = rows[0].reason || "سبب غير محدد";
      if (req.path.startsWith("/api/")) {
        return res.status(403).json({
          error: "تم حظر هذا الجهاز من الدخول إلى المنصة.",
          reason,
        });
      }

      return res.status(403).send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>تم حظر الوصول</title>
    <style>
        body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f8fafc; color: #111827; }
        .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
        .card { max-width: 560px; width: 100%; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,.06); }
        h1 { margin: 0 0 10px; font-size: 1.3rem; }
        p { margin: 0 0 8px; line-height: 1.7; }
        .meta { color: #4b5563; }
    </style>
</head>
<body>
    <main class="wrap">
        <section class="card">
            <h1>تم حظر هذا الجهاز من الوصول للمنصة</h1>
            <p class="meta">السبب: ${String(reason).replace(/[<>]/g, "")}</p>
            <p>إذا كان هذا الحظر بالخطأ، تواصل مع إدارة المنصة.</p>
        </section>
    </main>
</body>
</html>`);
    }
  } catch (err) {
    const sensitivePath =
      req.path.startsWith("/api/auth/") ||
      req.path === "/api/auth" ||
      req.path === "/" ||
      req.path === "/index.html";
    if (process.env.NODE_ENV === "production" && sensitivePath) {
      logger.error(
        "❌ Block check failed on sensitive path, denying request:",
        {
          path: req.path,
          error: err.message,
        },
      );
      return res
        .status(503)
        .json({
          error: "تعذر التحقق من حالة الحظر الآن. حاول مرة أخرى بعد قليل.",
        });
    }
    logger.warn(
      "⚠️ Device block check failed, allowing non-sensitive request:",
      { error: err.message, path: req.path },
    );
  }
  next();
});

// 6. Sanitize all request bodies
app.use(sanitizeBody);

// Block debug artifacts in production to avoid source disclosure and payload waste.
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && /\.(map|bak)$/i.test(req.path)) {
    return res.status(404).end();
  }
  next();
});


// 7. Static files مع Cache headers
const renderSPA = (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  require("fs").readFile(require("path").join(__dirname, "../client/index.html"), "utf8", (err, html) => {
    if (err) return res.status(500).send("HTML Load Error");
    const nonce = res.locals.nonce;
    const withNonceMeta = html.replace(
      /<head>/i,
      `<head><meta name="csp-nonce" content="${nonce}" />`,
    );
    const withNonceScripts = withNonceMeta.replace(
      /<script\b/gi,
      `<script nonce="${nonce}"`,
    );
    const withNonceStyles = withNonceScripts.replace(
      /<style\b/gi,
      `<style nonce="${nonce}"`,
    );
    res.send(withNonceStyles);
  });
};
app.get(["/", "/index.html"], renderSPA);

app.use(
  express.static(path.join(__dirname, "../client"), { index: false,
    maxAge: process.env.NODE_ENV === "production" ? "1d" : "0",
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // /config.js is environment-driven runtime config and must not be immutable.
      if (
        filePath.endsWith(`${path.sep}config.js`) ||
        filePath.endsWith("/config.js")
      ) {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        return;
      }

      // fonts.css: only @font-face declarations, versioned via ?v=N query param.
      // Give it a long immutable cache — same as other versioned assets.
      if (
        filePath.endsWith(`${path.sep}fonts.css`) ||
        filePath.endsWith("/fonts.css")
      ) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }

      // HTML & SW: always revalidate
      if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }

      // Long-term cache for immutable assets (minified, versioned, or vendor/static assets)
      // These can be cached aggressively and served with `immutable` to speed repeat visits.
      if (
        filePath.match(/\.min\.(js|css)$/) ||
        filePath.includes(`${path.sep}icons${path.sep}`) ||
        filePath.includes(`${path.sep}fonts${path.sep}`) ||
        filePath.includes(`${path.sep}js${path.sep}vendor${path.sep}`) ||
        filePath.endsWith(`${path.sep}css${path.sep}tailwind.css`)
      ) {
        // 30 days
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
        return;
      }

      // Default: short cache for JS modules and other assets that may change
      if (filePath.endsWith(".js")) {
        // Make module files and app source cacheable longer in production if they are under /js/modules or are the app entry.
        if (
          process.env.NODE_ENV === "production" &&
          (filePath.includes(`${path.sep}js${path.sep}modules${path.sep}`) ||
            filePath.endsWith(`${path.sep}js${path.sep}app.js`) ||
            filePath.endsWith(`${path.sep}js${path.sep}bootstrap.js`))
        ) {
          // 30 days — these are effectively versioned by deploys / querystrings in our workflow
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          return;
        }
        // 1 hour default for other JS in dev or unversioned assets
        res.setHeader("Cache-Control", "public, max-age=3600");
        return;
      }

      // Images/CSS: moderate cache (1 day) unless matched above
      if (filePath.match(/\.(?:css|png|jpg|jpeg|webp|svg)$/)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return;
      }
    },
  }),
);

// 8. إخفاء معلومات السيرفر + أمان إضافية
app.disable("x-powered-by");
app.use((req, res, next) => {
  // ✅ Prevent MIME sniffing attacks
  res.setHeader("X-Content-Type-Options", "nosniff");
  // ✅ Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // ✅ Enable XSS filter in older browsers
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ============================================
//         Rate Limiting — 3 مستويات
// ============================================
const createUserAwareRateLimiter = (windowMs, max, options = {}) =>
  createDistributedRateLimiter({
    windowMs,
    max,
    keyGenerator: (req) => {
      const authHeader = req.headers.authorization;
      if (
        authHeader &&
        authHeader.startsWith("Bearer ") &&
        process.env.JWT_SECRET
      ) {
        const token = authHeader.split(" ")[1];
        if (token && token.length <= 2048) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET, {
              algorithms: ["HS256"],
              issuer: JWT_ISSUER,
              audience: JWT_AUDIENCE,
            });
            const userId = decoded?.id || decoded?.userId;
            if (userId) {
              return `user:${userId}`;
            }
          } catch (_) {
            // Invalid token: fallback to IP-based limiting.
          }
        }
      }

      return String(req.ip);
    },
    skip: options.skip,
    message: options.message,
    redisPrefix: options.redisPrefix,
  });

/**
 * General API rate limiter: 100 requests per 1 minute.
 * @type {import('express').RequestHandler}
 */
const strictLimiterMax = process.env.NODE_ENV === "test" ? 5 : 50;

const strictLimiter = createUserAwareRateLimiter(15 * 60 * 1000, strictLimiterMax, {
  redisPrefix: "rl:strict:",
  message: { error: "طلبات كثيرة على المسارات الحساسة. حاول بعد قليل." },
});

const mediumLimiter = createUserAwareRateLimiter(15 * 60 * 1000, 200, {
  redisPrefix: "rl:medium:",
  message: { error: "تم تجاوز حد الطلبات لمسارات الإنشاء/التعديل." },
});

const relaxedLimiter = createUserAwareRateLimiter(15 * 60 * 1000, 1000, {
  redisPrefix: "rl:relaxed:",
  message: { error: "تم تجاوز حد الطلبات، حاول لاحقاً." },
});

const defaultLimiter = createUserAwareRateLimiter(15 * 60 * 1000, 1000, {
  redisPrefix: "rl:default:",
  skip: (req) => String(req.headers["x-guest-mode"] || "").toLowerCase() === "true",
});

const guestLimiter = createDistributedRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  redisPrefix: "rl:guest:",
  keyGenerator: (req) => String(req.ip),
  skip: (req) => String(req.headers["x-guest-mode"] || "").toLowerCase() !== "true",
  message: { error: "تم تجاوز حد طلبات وضع الضيف." },
});

const healthLimiter = createDistributedRateLimiter({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 240 : 60,
  redisPrefix: "rl:health:",
  keyGenerator: (req) => String(req.ip),
  message: { error: "تم تجاوز حد طلبات فحص الحالة. حاول بعد قليل." },
});

const applyLimiterByMethod = (methods, limiter) => {
  const allowedMethods = new Set(methods);
  return (req, res, next) => {
    if (!allowedMethods.has(req.method)) return next();
    return limiter(req, res, next);
  };
};

const strictAuthRoutes = [
  "/api/auth/google",
  "/api/auth/guest-session",
  "/api/auth/create-admin",
  "/api/auth/refresh",
  "/api/auth/logout",
];

strictAuthRoutes.forEach((route) => {
  app.use(route, strictLimiter);
});

app.use("/api/quizzes", guestLimiter, defaultLimiter);
app.use("/api/notes", guestLimiter, defaultLimiter);
app.use("/api/scores", guestLimiter, defaultLimiter);
app.use("/api/attempts", defaultLimiter);

app.use(
  "/api/quizzes",
  applyLimiterByMethod(["POST", "PUT", "PATCH", "DELETE"], mediumLimiter),
);
app.use(
  "/api/notes",
  applyLimiterByMethod(["POST", "PUT", "PATCH", "DELETE"], mediumLimiter),
);
app.use(
  "/api/attempts",
  applyLimiterByMethod(["POST", "PUT", "PATCH", "DELETE"], mediumLimiter),
);

app.use("/api/quizzes", applyLimiterByMethod(["GET"], relaxedLimiter));
app.use(
  "/api/scores/leaderboard",
  applyLimiterByMethod(["GET"], relaxedLimiter),
);
app.use("/api/health", healthLimiter);

// ============================================
//   Health Check Endpoint
// ============================================
/**
 * @route GET /api/health
 * @description Health check endpoint that verifies database connectivity and reports server status.
 * @access Public
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response with health status JSON.
 * @returns {Promise<void>}
 */
// Lightweight health endpoint: return quickly so platform healthchecks do not
// fail while the server is still performing DB migrations or waiting for DB.
// `dbConnected` and `serverReady` are set during `startServer()`.
let dbConnected = false;
let serverReady = false;

app.get("/api/health", verifyHealthAccess, async (req, res) => {
  const timestamp = new Date().toISOString();
  const incidentId = crypto.randomUUID();
  let degraded = false;

  try {
    await executeDbGuarded(async () => {
      const sequelize = require("./models/index");
      await sequelize.authenticate();
      await sequelize.query("SELECT 1");
    });
  } catch (err) {
    degraded = true;
    logger.error(
      `[health-check:database] [incidentId=${incidentId}]`,
      buildSanitizedErrorLog(err, "health.database", incidentId),
    );
  }

  try {
    const usedHeapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (usedHeapMb >= 1024) degraded = true;
  } catch (err) {
    degraded = true;
    logger.error(
      `[health-check:memory] [incidentId=${incidentId}]`,
      buildSanitizedErrorLog(err, "health.memory", incidentId),
    );
  }

  try {
    const stats = await require("fs").promises.statfs(__dirname);
    const freeSpaceGb = (stats.bfree * stats.bsize) / (1024 * 1024 * 1024);
    if (freeSpaceGb < 1) degraded = true;
  } catch (err) {
    degraded = true;
    logger.error(
      `[health-check:disk] [incidentId=${incidentId}]`,
      buildSanitizedErrorLog(err, "health.disk", incidentId),
    );
  }

  const payload = {
    status: degraded ? "degraded" : "operational",
    timestamp,
  };

  if (process.env.NODE_ENV !== "production") {
    payload.dbCircuitState = dbCircuitBreaker.getState().state;
  }

  return res.status(degraded ? 503 : 200).json(payload);
});

// ============================================
//   Public Config Endpoint (non-sensitive)
// ============================================
/**
 * @route GET /api/config
 * @description Returns non-sensitive public configuration like Google Client ID.
 * @access Public
 */
app.get("/api/config", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    datadogRumEnabled: process.env.DATADOG_RUM_ENABLED === "true",
  });
});

// Serve a small JS snippet with public config to avoid an extra XHR on page load
app.get("/config.js", (req, res) => {
  const cfg = {
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    datadogRumEnabled: process.env.DATADOG_RUM_ENABLED === "true",
  };
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // Runtime config must be fetched fresh to reflect env toggles like DATADOG_RUM_ENABLED.
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(`window.__PUBLIC_CONFIG = ${JSON.stringify(cfg)};`);
});

// ============================================
//              ربط المسارات
// ============================================

// CSRF verification — applied to all mutating API requests.
// Exempt: POST /api/auth/google (initial login, no CSRF cookie exists yet).
// ✅ SECURITY: Uses double-submit cookie pattern instead of csrf-token middleware
//    (non-httpOnly CSRF token sent to client, verified against X-CSRF-Token header)
//    snyk:skip=CWE-352
app.use("/api", (req, res, next) => {
  if (req.method === "POST" && req.path === "/auth/google") {
    if (!req.cookies?.csrf_token) {
      setCsrfCookie(res);
    }
    return next();
  }
  return verifyCsrf(req, res, next);
});

app.use("/api/auth", authRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/scores", scoreRoutes);
app.use("/api/attempts", attemptsRoutes);
app.use("/api/notes", noteRoutes);

// --- SPA Fallback ---
app.get(/(.*)/, (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  // HTTP Link preload headers — browser starts fetching LCP asset
  // from the very first byte of the response, before HTML is parsed.
  // Logo is the actual LCP element (Lighthouse confirmed)
  res.setHeader(
    "Link",
    "</icons/Gemini_Generated_Image_t3vu3xt3vu3xt3vu.avif>; rel=preload; as=image; type=image/avif; fetchpriority=high",
  );
  return renderSPA(req, res, next);
});

// --- 404 API ---
app.use("/api", (req, res) => {
  res.status(404).json({ error: "المسار المطلوب غير موجود." });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  const incidentId = crypto.randomUUID();
  logger.error(
    `❌ Server Error [incidentId=${incidentId}]:`,
    buildSanitizedErrorLog(err, `global:${req.path}`, incidentId),
  );
  res.status(err.status || 500).json({
    error: "حدث خطأ داخلي في السيرفر.",
    incidentId,
  });
});

// ============================================
//      الاتصال بقاعدة البيانات والتشغيل
// ============================================
const PORT = process.env.PORT || 3000;
let server;

/**
 * Connects to the database with retries and starts the HTTP server.
 * Exits the process if all connection attempts fail.
 * @async
 * @param {number} [retries=3] - Number of database connection attempts before giving up.
 * @returns {Promise<void>}
 */
/**
 * Safely adds missing columns to all tables using IF NOT EXISTS.
 * Handles TiDB quirks where sequelize.sync({ alter }) may fail.
 */
async function runSafeMigrations() {
  // Helper: add column only if missing (MySQL-safe)
  const ensureColumn = async (table, column, definition) => {
    const [rows] = await sequelize.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?
             LIMIT 1`,
      { replacements: [table, column] },
    );
    if (!rows || rows.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
      );
    }
  };

  // Helper: create index only if it does not already exist (MySQL lacks CREATE INDEX IF NOT EXISTS)
  const ensureIndex = async (table, indexName, columns, options = {}) => {
    const uniquePrefix = options.unique ? "UNIQUE " : "";
    const [rows] = await sequelize.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND INDEX_NAME = ?
             LIMIT 1`,
      { replacements: [table, indexName] },
    );
    if (!rows || rows.length === 0) {
      await sequelize.query(
        `CREATE ${uniquePrefix}INDEX \`${indexName}\` ON \`${table}\` (${columns})`,
      );
    }
  };

  const indexExists = async (table, indexName) => {
    const [rows] = await sequelize.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND INDEX_NAME = ?
             LIMIT 1`,
      { replacements: [table, indexName] },
    );
    return Boolean(rows && rows.length > 0);
  };

  const tableExists = async (table) => {
    const [rows] = await sequelize.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
             LIMIT 1`,
      { replacements: [table] },
    );
    return Boolean(rows && rows.length > 0);
  };

  const ensureIndexOnAnyExistingTable = async (
    candidateTables,
    indexName,
    columns,
    options = {},
  ) => {
    for (const table of candidateTables) {
      if (await tableExists(table)) {
        await ensureIndex(table, indexName, columns, options);
        return table;
      }
    }
    return null;
  };

  // Tables that are safe to create if missing
  const tableCreates = [
    `CREATE TABLE IF NOT EXISTS \`login_attempts\` (
            \`ip\`           VARCHAR(45)  NOT NULL,
            \`count\`        INT          NOT NULL DEFAULT 1,
            \`last_attempt\` BIGINT       NOT NULL,
            PRIMARY KEY (\`ip\`)
        )`,
    `CREATE TABLE IF NOT EXISTS \`account_sessions\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`userId\` INT NULL,
            \`email\` VARCHAR(255) NULL,
            \`deviceId\` VARCHAR(120) NULL,
            \`loginType\` VARCHAR(30) NOT NULL DEFAULT 'google',
            \`ipAddress\` VARCHAR(64) NULL,
            \`deviceName\` VARCHAR(120) NULL,
            \`userAgent\` VARCHAR(500) NULL,
            \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            INDEX \`idx_account_sessions_user\` (\`userId\`),
            INDEX \`idx_account_sessions_email\` (\`email\`),
            INDEX \`idx_account_sessions_device\` (\`deviceId\`),
            INDEX \`idx_account_sessions_type\` (\`loginType\`)
        )`,
    `CREATE TABLE IF NOT EXISTS \`blocked_devices\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`email\` VARCHAR(255) NULL,
            \`deviceId\` VARCHAR(120) NULL,
            \`ipAddress\` VARCHAR(64) NULL,
            \`deviceName\` VARCHAR(120) NULL,
            \`reason\` VARCHAR(255) NULL,
            \`blockedBy\` VARCHAR(255) NULL,
            \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
            \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            INDEX \`idx_blocked_devices_email\` (\`email\`),
            INDEX \`idx_blocked_devices_device\` (\`deviceId\`),
            INDEX \`idx_blocked_devices_ip\` (\`ipAddress\`),
            INDEX \`idx_blocked_devices_active\` (\`isActive\`)
        )`,
  ];

  // Columns to ensure exist
  const columnAdds = [
    ["users", "deletedAt", "DATETIME NULL DEFAULT NULL"],
    ["quizzes", "deletedAt", "DATETIME NULL DEFAULT NULL"],
    ["scores", "deletedAt", "DATETIME NULL DEFAULT NULL"],
    ["notes", "deletedAt", "DATETIME NULL DEFAULT NULL"],
    ["users", "tokenVersion", "INT NOT NULL DEFAULT 0"],
    ["scores", "percentage", "FLOAT DEFAULT 0"],
    ["scores", "timeTaken", "INT DEFAULT 0"],
    ["scores", "isOfficial", "TINYINT(1) DEFAULT 1"],
    ["scores", "attemptNumber", "INT DEFAULT 1"],
    ["quizzes", "isActive", "TINYINT(1) DEFAULT 1"],
    ["quizzes", "createdBy", "INT NULL DEFAULT NULL"],
    ["notes", "createdBy", "INT NULL DEFAULT NULL"],
    ["account_sessions", "deviceId", "VARCHAR(120) NULL"],
    ["blocked_devices", "email", "VARCHAR(255) NULL"],
  ];

  // Create tables
  for (const sql of tableCreates) {
    try {
      await sequelize.query(sql);
    } catch (e) {
      logger.warn(`⚠️ Migration skipped: ${e.message.substring(0, 80)}`);
    }
  }

  // Add columns safely
  for (const [table, column, def] of columnAdds) {
    try {
      await ensureColumn(table, column, def);
    } catch (e) {
      logger.warn(
        `⚠️ Migration skipped: ${table}.${column} -> ${e.message.substring(0, 80)}`,
      );
    }
  }

  // Create indexes in a MySQL-compatible way
  try {
    await ensureIndex(
      "account_sessions",
      "idx_account_sessions_device",
      "\`deviceId\`",
    );
    await ensureIndex(
      "blocked_devices",
      "idx_blocked_devices_email",
      "\`email\`",
    );
    await ensureIndex(
      "scores",
      "idx_scores_user_deleted",
      "\`userId\`, \`deletedAt\`",
    );
    await ensureIndex(
      "blocked_devices",
      "ux_blocked_devices_active_identity",
      "\`isActive\`, \`email\`, \`deviceId\`, \`ipAddress\`",
      { unique: true },
    );
    const qpTableNameRaw =
      typeof QuizProgress.getTableName === "function"
        ? QuizProgress.getTableName()
        : "quiz_progresses";
    const qpTableName =
      typeof qpTableNameRaw === "string"
        ? qpTableNameRaw
        : qpTableNameRaw?.tableName || "quiz_progresses";

    await ensureIndexOnAnyExistingTable(
      [qpTableName, "quiz_progresses", "QuizProgresses", "quizprogresses"],
      "ux_quiz_progress_user_quiz",
      "\`userId\`, \`quizId\`",
      { unique: true },
    );

    if (process.env.NODE_ENV === "production") {
      const existingProgressTable = (
        await Promise.all(
          [qpTableName, "quiz_progresses", "QuizProgresses", "quizprogresses"].map(
            async (table) => ((await tableExists(table)) ? table : null),
          ),
        )
      ).find(Boolean);

      if (!existingProgressTable) {
        throw new Error(
          "CRITICAL: Quiz progress table not found for unique-index assurance.",
        );
      }

      const hasProgressUniqueIndex = await indexExists(
        existingProgressTable,
        "ux_quiz_progress_user_quiz",
      );
      if (!hasProgressUniqueIndex) {
        throw new Error(
          "CRITICAL: Missing required unique index ux_quiz_progress_user_quiz in production.",
        );
      }
    }
  } catch (e) {
    logger.warn(`⚠️ Migration index skipped: ${e.message.substring(0, 80)}`);
    if (process.env.NODE_ENV === "production") {
      throw e;
    }
  }

  // Drop legacy UNIQUE(userId, quizId) index to allow multiple attempts per quiz.
  try {
    const [uniqueIdxRows] = await sequelize.query(
      `SELECT INDEX_NAME
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'scores'
               AND NON_UNIQUE = 0
             GROUP BY INDEX_NAME
             HAVING COUNT(*) = 2
                AND SUM(CASE WHEN COLUMN_NAME = 'userId' THEN 1 ELSE 0 END) = 1
                AND SUM(CASE WHEN COLUMN_NAME = 'quizId' THEN 1 ELSE 0 END) = 1`,
    );

    for (const row of uniqueIdxRows || []) {
      const idxName = row.INDEX_NAME || row.index_name;
      if (!idxName || idxName === "PRIMARY") continue;
      await sequelize.query(`ALTER TABLE \`scores\` DROP INDEX \`${idxName}\``);
      logger.info(`✅ Dropped legacy unique index on scores: ${idxName}`);
    }
  } catch (e) {
    logger.warn(
      `⚠️ Unable to drop legacy score unique index automatically: ${e.message}`,
    );
  }

  logger.info("✅ Safe migrations complete.");
}

async function startServer(retries = 3) {
  // In production, only alter if explicitly enabled (safety for real data)
  const enableAlter = process.env.DB_SYNC_ALTER === "true";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await executeDbGuarded(() => sequelize.authenticate(), {
        timeoutMs: getPositiveIntEnv("DB_STARTUP_TIMEOUT_MS", 10_000),
      });
      dbConnected = true;
      logger.info("✅ تم الاتصال بقاعدة البيانات TiDB بنجاح.");
      break;
    } catch (err) {
      logger.error(`❌ محاولة ${attempt}/${retries} فشلت:`, {
        error: err.message,
      });
      if (attempt === retries) {
        logger.error("❌ فشل الاتصال بقاعدة البيانات نهائياً");
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Try alter first; if TiDB rejects it, fall back to no-op sync
  try {
    await sequelize.sync({ alter: enableAlter });
    logger.info(`✅ تم مزامنة الجداول${enableAlter ? " (alter: true)" : ""}.`);
  } catch (syncErr) {
    logger.warn("⚠️ sync alter فشل، محاولة بدون alter:", syncErr.message);
    logger.warn("تفاصيل الخطأ:", syncErr);
    try {
      await sequelize.sync({ alter: false });
      logger.info("✅ تم مزامنة الجداول (alter: false fallback).");
    } catch (syncErr2) {
      logger.error("❌ فشل sync نهائياً:", syncErr2.message);
      // Don't exit — let the server start and handle DB errors per-request
    }
  }

  // Run explicit safe migrations for TiDB (IF NOT EXISTS — safe to run every time)
  await runSafeMigrations();

  server = app.listen(PORT, () => {
    serverReady = true;
    logger.info(`🚀 السيرفر شغال على: http://localhost:${PORT}`);

    // KeepAlive: self-ping every 13 min to prevent Railway free-tier cold-start
    // (Railway spins down idle services; 13 min < 15 min idle timeout)
    if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME) {
      const selfPingUrl = `http://localhost:${PORT}/api/health`;
      // Security: HTTP is safe for localhost only (self-ping to keep server alive)
      // snyk:skip=CWE-319
      const http = require("http");
      setInterval(
        () => {
          http
            .get(selfPingUrl, (res) => {
              res.resume(); // drain response
            })
            .on("error", () => {
              // silently ignore errors on self-ping
            });
        },
        13 * 60 * 1000,
      );
      logger.info("🏓 KeepAlive self-ping enabled (13 min interval).");
    }
  });
}

// ============================================
//   Graceful Shutdown — إيقاف آمن
// ============================================
/**
 * Gracefully shuts down the HTTP server and closes the database connection.
 * Forces exit after 10 seconds if graceful shutdown stalls.
 * @async
 * @param {string} signal - The signal or event name that triggered shutdown (e.g., 'SIGTERM').
 * @returns {Promise<void>}
 */
async function gracefulShutdown(signal) {
  logger.info(`📴 ${signal} received — إيقاف آمن...`);
  if (server) {
    server.close(async () => {
      logger.info("🔌 HTTP server مغلق");
      try {
        await closeDdosRedisClient();
        logger.info("🔌 Redis security backend مغلق");
      } catch (e) {
        logger.error("خطأ في إغلاق Redis:", e.message);
      }
      try {
        await sequelize.close();
        logger.info("🔌 Database connection مغلق");
      } catch (e) {
        logger.error("خطأ في إغلاق DB:", e.message);
      }
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn("⚠️ إيقاف إجباري بعد 10 ثوانٍ");
      process.exit(1);
    }, 10000);
  } else {
    try {
      await closeDdosRedisClient();
    } catch (_) {
      // ignore
    }
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.error("🔥 Uncaught Exception:", {
    error: err.message,
    stack: err.stack,
  });
  gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  logger.error("🔥 Unhandled Rejection:", { reason: String(reason) });
});

// Start the server only when not running under Jest
if (process.env.NODE_ENV !== "test") {
  startServer();
}

module.exports = app;
