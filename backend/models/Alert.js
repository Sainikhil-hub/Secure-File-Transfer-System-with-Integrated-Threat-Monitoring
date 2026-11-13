const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const alertSchema = new mongoose.Schema({
  alertId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    index: true
    // 'BRUTE_FORCE_LOGIN', 'REPEATED_DECRYPT_FAILURE', 'UNUSUAL_DOWNLOAD_SPIKE', 
    // 'UNAUTHORIZED_FILE_ACCESS', 'SUSPICIOUS_EXTENSION_BLOCKED', 'TAMPER_DETECTED'
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium',
    index: true
  },
  message: {
    type: String,
    required: true
  },
  targetUser: {
    type: String,
    default: null
  },
  targetFile: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1'
  },
  status: {
    type: String,
    enum: ['Active', 'Reviewed', 'Resolved'],
    default: 'Active',
    index: true
  },
  reviewedBy: {
    type: String,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Alert', alertSchema);
