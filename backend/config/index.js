const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/secure_transfer_db',
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-development-key-321',
  jwtExpiresIn: '24h',
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || 'a89f3c1d94f2740bc18a77919327e51c89304721948dbf381c04859aefb20491',
  uploadDir: path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads/encrypted'),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 100,
  
  // Security thresholds (per SRS Section 4 & 5)
  securityDefaults: {
    maxFailedLogins: 5,               // REQ-5, REQ-6: Lockout after 5 consecutive failures
    lockoutDurationMinutes: 15,       // 15 minutes lockout duration
    maxFailedDecrypts: 3,             // REQ-8: Alert on 3 failed decrypts in window
    decryptWindowMinutes: 5,          // 5 minute window for decrypt failures
    maxDownloadsPerWindow: 8,         // REQ-9: Alert on > 8 downloads in window (download spike)
    downloadWindowMinutes: 2          // 2 minute window for download spikes
  }
};
