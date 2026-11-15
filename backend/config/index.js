const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const isProduction = process.env.NODE_ENV === 'production';

function requiredInProduction(name) {
  const value = process.env[name];
  if (isProduction && !value) {
    throw new Error(`${name} must be set when NODE_ENV=production.`);
  }
  return value;
}

const jwtSecret = requiredInProduction('JWT_SECRET') || crypto.randomBytes(48).toString('hex');
const masterEncryptionKey = requiredInProduction('MASTER_ENCRYPTION_KEY') || crypto.randomBytes(32).toString('hex');
const storageProvider = (process.env.STORAGE_PROVIDER || (isProduction ? 's3' : 'local')).toLowerCase();

if (!['local', 's3'].includes(storageProvider)) {
  throw new Error('STORAGE_PROVIDER must be either "local" or "s3".');
}

if (isProduction && storageProvider === 'local') {
  throw new Error('Production deployments must use persistent object storage (set STORAGE_PROVIDER=s3).');
}

const s3Bucket = process.env.S3_BUCKET;
if (storageProvider === 's3' && !s3Bucket) {
  throw new Error('S3_BUCKET must be set when STORAGE_PROVIDER=s3.');
}

module.exports = {
  isProduction,
  port: parseInt(process.env.PORT, 10) || 5000,
  mongodbUri: requiredInProduction('MONGODB_URI') || 'mongodb://127.0.0.1:27017/secure_transfer_db',
  jwtSecret,
  jwtExpiresIn: '24h',
  masterEncryptionKey,
  uploadDir: path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads/encrypted'),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 100,
  storage: {
    provider: storageProvider,
    s3: {
      bucket: s3Bucket,
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      prefix: (process.env.S3_PREFIX || 'cipherdrop/encrypted').replace(/^\/+|\/+$/g, ''),
      serverSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION || 'AES256'
    }
  },
  
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
