const logger = require('../utils/logger');
/**
 * @file Encryption utility for sensitive data
 * @description Provides AES-256 encryption/decryption for database fields and sensitive data.
 *   Uses standardized crypto module with secure IV and authentication.
 * @module utils/encryption
 */

const crypto = require("crypto");

/**
 * Get encryption key from environment or generate a new one.
 * ⚠️ SECURITY: In production, use a strong 32-byte key from env var
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (!keyEnv) {
    if (process.env.NODE_ENV === "production") {
      logger.error("🚨 ENCRYPTION_KEY not set in production!");
      process.exit(1);
    }
    // Development: use a fixed key (never do this in production!)
    return crypto
      .createHash("sha256")
      .update("dev-default-key-change-in-production")
      .digest();
  }
  // Expect hex-encoded 32-byte key (64 characters)
  if (keyEnv.length !== 64) {
    logger.warn(
      `⚠️ ENCRYPTION_KEY length is ${keyEnv.length}, expected 64 (32 bytes hex).`,
    );
  }
  return Buffer.from(keyEnv, "hex");
}

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
