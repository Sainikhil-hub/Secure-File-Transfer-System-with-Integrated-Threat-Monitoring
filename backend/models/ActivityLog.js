const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const activityLogSchema = new mongoose.Schema({
  logId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userEmail: {
    type: String,
    default: 'anonymous'
  },
  action: {
    type: String,
    required: true,
    index: true
    // e.g., 'USER_REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 
    // 'ACCOUNT_UNLOCKED', 'FILE_UPLOADED', 'FILE_DOWNLOADED', 'DECRYPT_SUCCESS', 
    // 'DECRYPT_FAILED', 'UNAUTHORIZED_ACCESS_ATTEMPT', 'FILE_QUARANTINED', 
    // 'ALERT_REVIEWED', 'ALERT_RESOLVED', 'SECURITY_POLICY_UPDATED'
  },
  targetFileId: {
    type: String,
    default: null
  },
  targetFileName: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1'
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'high', 'critical'],
    default: 'info'
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
