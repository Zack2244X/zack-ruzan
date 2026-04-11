const logger = require('../utils/logger');
#!/usr/bin/env node

/**
 * @file Test encryption utilities
 * @description Quick test to verify encryption/decryption works correctly
 * Usage: node server/utils/test-encryption.js
 */

const {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashSHA256,
} = require("./encryption");

async function runTests() {
  logger.info("🔐 Encryption Utilities Test Suite\n");

  // Test 1: Basic encryption/decryption
  logger.info("Test 1: AES-256-GCM Encryption/Decryption");
  const plaintext = "This is a secret message";
  const encrypted = encrypt(plaintext);
  const decrypted = decrypt(encrypted);
  logger.info(`  Input:     "${plaintext}"`);
  logger.info(`  Encrypted: ${encrypted.substring(0, 50)}...`);
  logger.info(`  Decrypted: "${decrypted}"`);
  console.assert(decrypted === plaintext, "❌ Decryption failed!");
  logger.info("  ✅ Passed\n");

  // Test 2: Password hashing
  logger.info("Test 2: Password Hashing (scrypt)");
  const password = "MySecurePassword123!";
  const hash = await hashPassword(password);
  const isValid = await verifyPassword(password, hash);
  const isInvalid = await verifyPassword("WrongPassword", hash);
  logger.info(`  Password:  "${password}"`);
  logger.info(`  Hash:      ${hash.substring(0, 50)}...`);
  logger.info(`  Valid:     ${isValid}`);
  logger.info(`  Invalid:   ${isInvalid}`);
  console.assert(isValid === true, "❌ Valid password rejected!");
  console.assert(isInvalid === false, "❌ Invalid password accepted!");
  logger.info("  ✅ Passed\n");

  // Test 3: Secure token generation
  logger.info("Test 3: Secure Token Generation");
  const token1 = generateSecureToken();
  const token2 = generateSecureToken();
  logger.info(`  Token 1: ${token1}`);
  logger.info(`  Token 2: ${token2}`);
  logger.info(`  Length:  ${token1.length} characters (32 bytes hex)`);
  console.assert(token1.length === 64, "❌ Token length incorrect!");
  console.assert(token1 !== token2, "❌ Tokens not unique!");
  logger.info("  ✅ Passed\n");

  // Test 4: SHA-256 hashing
  logger.info("Test 4: SHA-256 Hashing");
  const value = "Some data to hash";
  const hash256 = hashSHA256(value);
  logger.info(`  Input:  "${value}"`);
  logger.info(`  SHA-256: ${hash256}`);
  logger.info(`  Length:  ${hash256.length} characters`);
  console.assert(hash256.length === 64, "❌ SHA-256 hash length incorrect!");
  logger.info("  ✅ Passed\n");

  // Test 5: Empty string handling
  logger.info("Test 5: Edge Cases");
  const emptyEncrypted = encrypt("");
  const emptyDecrypted = decrypt(emptyEncrypted);
  logger.info(
    `  Empty string: "${emptyEncrypted === "" ? "(empty)" : emptyDecrypted}"`,
  );
  console.assert(emptyDecrypted === "", "❌ Empty string handling failed!");
  logger.info("  ✅ Passed\n");

  logger.info("================================================");
  logger.info("✅ All encryption tests passed!");
  logger.info("================================================\n");
}

runTests().catch((err) => {
  logger.error("❌ Test failed:", err.message);
  process.exit(1);
});
