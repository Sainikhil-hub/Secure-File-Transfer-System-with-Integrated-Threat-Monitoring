const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

class CryptoEngine {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.masterKey = Buffer.from(config.masterEncryptionKey, 'hex');
    if (this.masterKey.length !== 32) {
      // Derive a 32-byte key if provided key is not exactly 32 bytes
      this.masterKey = crypto.createHash('sha256').update(config.masterEncryptionKey).digest();
    }
  }

  /**
   * Derive a unique 256-bit Data Encryption Key (DEK) for a specific file
   * using PBKDF2 with SHA-256 and 100,000 iterations.
   * @param {Buffer} salt - Unique per-file salt
   * @returns {Buffer} 32-byte derived AES key
   */
  deriveFileKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 100000, 32, 'sha256');
  }

  /**
   * Compute SHA-256 checksum of data
   * @param {Buffer} buffer 
   * @returns {string} hex digest
   */
  computeChecksum(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Encrypt file buffer and save to secure storage.
   * Plaintext is NEVER written to disk (REQ-2).
   * @param {Buffer} buffer - Plaintext file buffer
   * @param {string} fileId - Unique UUID for the file
   * @returns {Promise<Object>} Metadata including iv, authTag, salt, checksum, and storage path
   */
  async encryptAndStore(buffer, fileId) {
    // 1. Calculate integrity checksum before encryption
    const checksum = this.computeChecksum(buffer);

    // 2. Generate random 32-byte salt for per-file key derivation
    const salt = crypto.randomBytes(32);
    const fileKey = this.deriveFileKey(salt);

    // 3. Generate 12-byte IV (Standard for AES-GCM)
    const iv = crypto.randomBytes(12);

    // 4. Initialize AES-256-GCM cipher
    const cipher = crypto.createCipheriv(this.algorithm, fileKey, iv);

    // 5. Perform authenticated encryption
    const encryptedData = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes authentication tag

    // 6. Write ONLY the encrypted bytes to disk
    const storedFileName = `${fileId}.enc`;
    const destinationPath = path.join(config.uploadDir, storedFileName);
    await fs.promises.writeFile(destinationPath, encryptedData);

    return {
      fileId,
      storedFileName,
      checksum,
      encryptionAlgorithm: 'AES-256-GCM',
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
      size: buffer.length
    };
  }

  /**
   * Read encrypted file from disk, verify authentication tag, and decrypt.
   * Throws if authentication tag or ciphertext is tampered or corrupted.
   * @param {Object} fileRecord - Mongoose file record with metadata
   * @returns {Promise<Buffer>} Decrypted plaintext buffer
   */
  async decryptFile(fileRecord) {
    const filePath = path.join(config.uploadDir, fileRecord.storedFileName);
    if (!fs.existsSync(filePath)) {
      throw new Error('Encrypted file not found on server storage');
    }

    const encryptedData = await fs.promises.readFile(filePath);
    const salt = Buffer.from(fileRecord.salt, 'hex');
    const iv = Buffer.from(fileRecord.iv, 'hex');
    const authTag = Buffer.from(fileRecord.authTag, 'hex');

    // Re-derive the identical file key using stored salt
    const fileKey = this.deriveFileKey(salt);

    // Initialize decipher
    const decipher = crypto.createDecipheriv(this.algorithm, fileKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt and verify tag
    // Will throw: "Unsupported state or unable to authenticate data" if corrupted/tampered
    const decryptedBuffer = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);

    // Verify SHA-256 checksum to guarantee bit-for-bit integrity
    const decryptedChecksum = this.computeChecksum(decryptedBuffer);
    if (decryptedChecksum !== fileRecord.checksum) {
      throw new Error('Integrity check failed: checksum mismatch after decryption');
    }

    return decryptedBuffer;
  }

  /**
   * Delete an encrypted file from disk
   * @param {string} storedFileName 
   */
  async deleteFile(storedFileName) {
    const filePath = path.join(config.uploadDir, storedFileName);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

module.exports = new CryptoEngine();
