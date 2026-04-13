const logger = require('../utils/logger');
/**
 * @file Encryption utility for sensitive data
 * @description Provides AES-256 encryption/decryption for database fields and sensitive data.
 *   Uses standardized crypto module with secure IV and authentication.
 * @module utils/encryption
 */

const crypto = require("crypto");
let cachedEncryptionKey = null;

function decodeKeyMaterial(rawKey) {
  const isHex = /^[0-9a-fA-F]+$/.test(rawKey) && rawKey.length % 2 === 0;
  if (isHex) return Buffer.from(rawKey, "hex");
  return Buffer.from(rawKey, "utf8");
}

function keyLooksWeak(rawKey) {
  const lower = String(rawKey || "").toLowerCase();
  const weakMarkers = ["default", "dev", "test", "password", "123", "qwerty"];
  if (weakMarkers.some((marker) => lower.includes(marker))) return true;

  const uniqueChars = new Set(lower.replace(/\s+/g, "")).size;
  if (uniqueChars < 10) return true;

  return false;
}

/**
 * Get encryption key from environment and enforce strict validation.
 * SECURITY: application must not run without a strong key.
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  if (cachedEncryptionKey) return cachedEncryptionKey;

  const keyEnv = process.env.ENCRYPTION_KEY;
  if (!keyEnv || !String(keyEnv).trim()) {
    throw new Error("CRITICAL: Missing Encryption Key");
  }

  const keyBuffer = decodeKeyMaterial(String(keyEnv).trim());
  if (keyBuffer.length < 32) {
    throw new Error("CRITICAL: Weak Encryption Key (minimum 32 bytes required)");
  }

  if (keyLooksWeak(keyEnv)) {
    const weakMsg =
      "Weak ENCRYPTION_KEY detected. Use high-entropy key material (>=32 bytes).";
    if (process.env.NODE_ENV === "production") {
      throw new Error(`CRITICAL: ${weakMsg}`);
    }
    // Colored warning in local/dev environments.
    // eslint-disable-next-line no-console
    console.warn(`\x1b[33m[SECURITY WARNING]\x1b[0m ${weakMsg}`);
  }

  cachedEncryptionKey = keyBuffer;
  return cachedEncryptionKey;
}

// Startup guard: fail fast if key configuration is unsafe.
getEncryptionKey();

/**
 * Encrypts a string using AES-256-GCM.
 * Returns: {iv}:{encryptedData}:{authTag} (all base64)
 * @param {string} plaintext - Text to encrypt
 * @returns {string} Encrypted string in format iv:encrypted:authTag
 */
function encrypt(plaintext) {
  if (!plaintext) return "";

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // 128-bit IV for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    // Return format: iv:encrypted:authTag (all base64)
    return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`;
  } catch (error) {
    logger.error(`❌ Encryption error: ${error.message}`);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypts an encrypted string (produced by encrypt()).
 * @param {string} encryptedString - Encrypted string in format iv:encrypted:authTag
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedString) {
  if (!encryptedString) return "";

  try {
    const key = getEncryptionKey();
    const parts = encryptedString.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted string format");
    }

    const iv = Buffer.from(parts[0], "base64");
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    logger.error(`❌ Decryption error: ${error.message}`);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Hash a password using scrypt (one-way, salted).
 * @param {string} password - Plain password
 * @param {string} [salt] - Optional salt (if not provided, random one is generated)
 * @returns {Promise<string>} Hash in format salt$hash
 */
async function hashPassword(password, salt = null) {
  try {
    const saltBuffer = salt ? Buffer.from(salt, "hex") : crypto.randomBytes(32);
    const hash = crypto.scryptSync(password, saltBuffer, 64);
    return `${saltBuffer.toString("hex")}$${hash.toString("hex")}`;
  } catch (error) {
    logger.error(`❌ Password hashing error: ${error.message}`);
    throw new Error("Failed to hash password");
  }
}

/**
 * Verify a password against a hash.
 * @param {string} password - Plain password to verify
 * @param {string} hash - Hash from hashPassword()
 * @returns {Promise<boolean>} true if password matches
 */
async function verifyPassword(password, hash) {
  try {
    const [saltHex, hashHex] = hash.split("$");
    const salt = Buffer.from(saltHex, "hex");
    const verifyHash = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(verifyHash, Buffer.from(hashHex, "hex"));
  } catch (error) {
    // timingSafeEqual throws on mismatch, catch silently for comparison
    return false;
  }
}

/**
 * Generate a secure random token (e.g., for API keys, reset links).
 * @returns {string} Hex-encoded 32-byte random token
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a value with SHA-256 for integrity checking.
 * @param {string} value - Value to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashSHA256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashSHA256,
  getEncryptionKey,
};
