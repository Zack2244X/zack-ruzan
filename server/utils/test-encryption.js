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
    hashSHA256
} = require('./encryption');

async function runTests() {
    console.log('🔐 Encryption Utilities Test Suite\n');

    // Test 1: Basic encryption/decryption
    console.log('Test 1: AES-256-GCM Encryption/Decryption');
    const plaintext = 'This is a secret message';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    console.log(`  Input:     "${plaintext}"`);
    console.log(`  Encrypted: ${encrypted.substring(0, 50)}...`);
    console.log(`  Decrypted: "${decrypted}"`);
    console.assert(decrypted === plaintext, '❌ Decryption failed!');
    console.log('  ✅ Passed\n');

    // Test 2: Password hashing
    console.log('Test 2: Password Hashing (scrypt)');
    const password = 'MySecurePassword123!';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    const isInvalid = await verifyPassword('WrongPassword', hash);
    console.log(`  Password:  "${password}"`);
    console.log(`  Hash:      ${hash.substring(0, 50)}...`);
    console.log(`  Valid:     ${isValid}`);
    console.log(`  Invalid:   ${isInvalid}`);
    console.assert(isValid === true, '❌ Valid password rejected!');
    console.assert(isInvalid === false, '❌ Invalid password accepted!');
    console.log('  ✅ Passed\n');

    // Test 3: Secure token generation
    console.log('Test 3: Secure Token Generation');
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();
    console.log(`  Token 1: ${token1}`);
    console.log(`  Token 2: ${token2}`);
    console.log(`  Length:  ${token1.length} characters (32 bytes hex)`);
    console.assert(token1.length === 64, '❌ Token length incorrect!');
    console.assert(token1 !== token2, '❌ Tokens not unique!');
    console.log('  ✅ Passed\n');

    // Test 4: SHA-256 hashing
    console.log('Test 4: SHA-256 Hashing');
    const value = 'Some data to hash';
    const hash256 = hashSHA256(value);
    console.log(`  Input:  "${value}"`);
    console.log(`  SHA-256: ${hash256}`);
    console.log(`  Length:  ${hash256.length} characters`);
    console.assert(hash256.length === 64, '❌ SHA-256 hash length incorrect!');
    console.log('  ✅ Passed\n');

    // Test 5: Empty string handling
    console.log('Test 5: Edge Cases');
    const emptyEncrypted = encrypt('');
    const emptyDecrypted = decrypt(emptyEncrypted);
    console.log(`  Empty string: "${emptyEncrypted === '' ? '(empty)' : emptyDecrypted}"`);
    console.assert(emptyDecrypted === '', '❌ Empty string handling failed!');
    console.log('  ✅ Passed\n');

    console.log('================================================');
    console.log('✅ All encryption tests passed!');
    console.log('================================================\n');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
});
