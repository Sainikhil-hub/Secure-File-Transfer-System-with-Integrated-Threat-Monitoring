const mongoose = require('mongoose');
const config = require('../config');

const securityPolicySchema = new mongoose.Schema({
  policyKey: {
    type: String,
    default: 'global_policy',
    unique: true
  },
  maxFailedLogins: {
    type: Number,
    default: config.securityDefaults.maxFailedLogins
  },
  lockoutDurationMinutes: {
    type: Number,
    default: config.securityDefaults.lockoutDurationMinutes
  },
  maxFailedDecrypts: {
    type: Number,
    default: config.securityDefaults.maxFailedDecrypts
  },
  decryptWindowMinutes: {
    type: Number,
    default: config.securityDefaults.decryptWindowMinutes
  },
  maxDownloadsPerWindow: {
    type: Number,
    default: config.securityDefaults.maxDownloadsPerWindow
  },
  downloadWindowMinutes: {
    type: Number,
    default: config.securityDefaults.downloadWindowMinutes
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: 'system'
  }
});

module.exports = mongoose.model('SecurityPolicy', securityPolicySchema);
