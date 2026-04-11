/**
 * @file Security middleware for encryption, HTTPS enforcement, and secure cookies
 * @description Provides HTTPS redirect, secure cookie options, and encrypted response wrapper.
 * @module middleware/encryption-security
 */

const logger = require("../utils/logger");
const { hashSHA256 } = require("../utils/encryption");

/**
 * Middleware: Enforce HTTPS in production by redirecting HTTP to HTTPS.
 * Safe to disable in development (localhost) or behind trusted proxies.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const enforceHttps = (req, res, next) => {
  // Skip if: development, localhost, already https, or trusted proxy (Railway/Render sets X-Forwarded-Proto)
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return next();
  }

  // Allow localhost in all environments
  if (req.hostname === "localhost" || req.hostname === "127.0.0.1") {
    return next();
  }

  const protocol = req.get("X-Forwarded-Proto") || req.protocol;
  if (protocol !== "https") {
    logger.warn(
      `⚠️ HTTP request detected (protocol: ${protocol}). Redirecting to HTTPS.`,
    );
    const redirectUrl = `https://${req.get("host")}${req.url}`;
    return res.redirect(301, redirectUrl);
  }

  next();
};

/**
 * Secure cookie options for sensitive cookies (tokens, sessions, etc.)
 * @returns {Object} Cookie options for res.cookie()
 */
const secureSessionCookieOptions = () => ({
  httpOnly: true, // Cannot be accessed via JavaScript (XSS protection)
  secure: process.env.NODE_ENV === "production", // HTTPS only in production
  sameSite: "Strict", // CSRF + clickjacking protection
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: "/",
  signed: true, // Require signed cookies (expressjs)
});

/**
 * Secure cookie options for non-sensitive cookies (UI state, preferences, etc.)
 * @returns {Object} Cookie options
 */
const secureCookieOptions = () => ({
  secure: process.env.NODE_ENV === "production",
  sameSite: "Strict",
  path: "/",
  signed: true,
});

/**
 * Middleware: Set strict cookie security policy.
 * Applies to all cookies set during response.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const enforceCookieSecurity = (req, res, next) => {
  // Store cookie defaults in res.locals for later use
  res.locals.cookieOptions = secureSessionCookieOptions();
  res.locals.cookieOptionsNonSensitive = secureCookieOptions();
  next();
};

/**
 * Middleware: Add integrity header for response validation.
 * Sets X-Content-Hash header (SHA-256 of body) for client-side verification.
 * Helps detect man-in-the-middle attacks on critical data.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const addResponseIntegrityHeader = (req, res, next) => {
  // Only for sensitive endpoints (GET sensitive data, auth operations)
  const isSensitiveEndpoint = req.path.match(
    /\/(auth|admin|profile|quiz|score|note)\//i,
  );

  if (!isSensitiveEndpoint) {
    return next();
  }

  // Intercept res.json to add integrity header
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    if (data && typeof data === "object") {
      const jsonString = JSON.stringify(data);
      const hash = hashSHA256(jsonString);
      res.set("X-Content-Hash", hash);
      logger.debug(`✅ Response integrity hash: ${hash.substring(0, 16)}...`);
    }
    return originalJson(data);
  };

  next();
};

/**
 * Middleware: Additional security headers for content protection.
 * Complements helmet middleware.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const additionalSecurityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.set("X-Frame-Options", "DENY");

  // Prevent content sniffing
  res.set("X-Content-Type-Options", "nosniff");

  // Enable XSS protection in older browsers
  res.set("X-XSS-Protection", "1; mode=block");

  // Enforce HSTS (HTTP Strict Transport Security)
  // Tells browsers to always use HTTPS for this domain
  if (process.env.NODE_ENV === "production") {
    res.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // Disable browser MIME type inference for <script> tags
  res.set("X-Content-Type-Options", "nosniff");

  // Referrer policy: strict-origin-when-cross-origin (valid option)
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy (formerly Feature Policy): disable risky APIs
  res.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  next();
};

module.exports = {
  enforceHttps,
  enforceCookieSecurity,
  secureSessionCookieOptions,
  secureCookieOptions,
  addResponseIntegrityHeader,
  additionalSecurityHeaders,
};
