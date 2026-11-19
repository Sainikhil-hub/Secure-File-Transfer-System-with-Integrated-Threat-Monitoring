/**
 * Security & Cryptography Verification Test Suite
 * Tests AES-256-GCM Authenticated Encryption, Tamper Detection, Checksums, and Threat Rules
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Cryptography unit tests exercise the local development storage adapter.
process.env.STORAGE_PROVIDER = 'local';

// Test Suite
async function runSecurityTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING CIPHERDROP SECURITY & CRYPTOGRAPHY TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Key Derivation & AES-256-GCM authenticated encryption
  await asyncTest('AES-256-GCM: Encrypt and decrypt maintains bit-for-bit fidelity', async () => {
    const cryptoEngine = require('../backend/services/cryptoEngine');
    const originalText = 'Confidential Enterprise Transfer Payload - CipherDrop 2026';
    const originalBuffer = Buffer.from(originalText, 'utf-8');
    const testFileId = 'test-file-' + Date.now();

    // Encrypt
    const encResult = await cryptoEngine.encryptAndStore(originalBuffer, testFileId);
    assert.strictEqual(encResult.encryptionAlgorithm, 'AES-256-GCM');
    assert.strictEqual(encResult.iv.length, 24); // 12 bytes = 24 hex chars
    assert.strictEqual(encResult.authTag.length, 32); // 16 bytes = 32 hex chars
    assert.strictEqual(encResult.salt.length, 64); // 32 bytes = 64 hex chars

    // Check plaintext is NOT written to storage
    const storedPath = path.join(require('../backend/config').uploadDir, encResult.storedFileName);
    assert(fs.existsSync(storedPath), 'Encrypted file should exist on disk');
    const diskContent = fs.readFileSync(storedPath);
    assert.notStrictEqual(diskContent.toString('utf-8'), originalText, 'Stored file must NEVER be plaintext');

    // Decrypt
    const mockRecord = {
      fileId: testFileId,
      storedFileName: encResult.storedFileName,
      iv: encResult.iv,
      authTag: encResult.authTag,
      salt: encResult.salt,
      checksum: encResult.checksum
    };

    const decryptedBuffer = await cryptoEngine.decryptFile(mockRecord);
    assert.strictEqual(decryptedBuffer.toString('utf-8'), originalText, 'Decrypted text must match original');

    // Cleanup
    await cryptoEngine.deleteFile(encResult.storedFileName);
  });

  // 2. AES-256-GCM Tamper Detection (AEAD property)
  await asyncTest('AES-256-GCM AEAD: Ciphertext tampering is immediately detected & rejected', async () => {
    const cryptoEngine = require('../backend/services/cryptoEngine');
    const originalBuffer = Buffer.from('Highly Secure Corporate Records - CipherDrop Platform', 'utf-8');
    const testFileId = 'tamper-test-' + Date.now();

    const encResult = await cryptoEngine.encryptAndStore(originalBuffer, testFileId);
    const storedPath = path.join(require('../backend/config').uploadDir, encResult.storedFileName);

    // Flip 1 byte in the ciphertext on disk (simulating an attacker modifying bytes)
    const diskData = fs.readFileSync(storedPath);
    diskData[0] ^= 0xFF; // Invert first byte
    fs.writeFileSync(storedPath, diskData);

    const mockRecord = {
      fileId: testFileId,
      storedFileName: encResult.storedFileName,
      iv: encResult.iv,
      authTag: encResult.authTag,
      salt: encResult.salt,
      checksum: encResult.checksum
    };

    let caughtError = false;
    try {
      await cryptoEngine.decryptFile(mockRecord);
    } catch (err) {
      caughtError = true;
      // GCM authentication tag verification failure
      assert(err.message.includes('authenticate') || err.message.includes('checksum') || err.message.includes('Unsupported'), 
        'Should fail authentication tag verification');
    }

    assert.strictEqual(caughtError, true, 'Tampered ciphertext MUST fail decryption');

    // Cleanup
    await cryptoEngine.deleteFile(encResult.storedFileName);
  });

  // 3. Prohibited Executable Extension Inspection
  test('Threat Inspection: Disallowed executable scripts/binaries are intercepted', () => {
    const threatMonitor = require('../backend/services/threatMonitor');
    assert.strictEqual(threatMonitor.isDisallowedFileType('payload.exe'), true);
    assert.strictEqual(threatMonitor.isDisallowedFileType('script.bat'), true);
    assert.strictEqual(threatMonitor.isDisallowedFileType('exploit.sh'), true);
    assert.strictEqual(threatMonitor.isDisallowedFileType('legitimate_report.pdf'), false);
    assert.strictEqual(threatMonitor.isDisallowedFileType('data_archive.zip'), false);
    assert.strictEqual(threatMonitor.isDisallowedFileType('research_notes.docx'), false);
  });

  // 4. SHA-256 Checksum Verification
  test('Integrity Checksum: SHA-256 uniquely hashes content', () => {
    const cryptoEngine = require('../backend/services/cryptoEngine');
    const b1 = Buffer.from('Sample Data A');
    const b2 = Buffer.from('Sample Data B');
    const hash1 = cryptoEngine.computeChecksum(b1);
    const hash2 = cryptoEngine.computeChecksum(b2);

    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash2.length, 64);
    assert.notStrictEqual(hash1, hash2);
  });

  console.log(`\n====================================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests();
