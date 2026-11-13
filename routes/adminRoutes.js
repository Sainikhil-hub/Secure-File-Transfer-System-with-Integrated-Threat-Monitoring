const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Alert = require('../models/Alert');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const FileRecord = require('../models/FileRecord');
const ShareRecord = require('../models/ShareRecord');
const SecurityPolicy = require('../models/SecurityPolicy');
const threatMonitor = require('../services/threatMonitor');
const cryptoEngine = require('../services/cryptoEngine');
const config = require('../config');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// All routes in this router require Administrator role (REQ-14)
router.use(verifyToken, requireAdmin);

/**
 * GET /api/admin/metrics
 * Consolidated system overview metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const totalFiles = await FileRecord.countDocuments({ status: { $ne: 'deleted' } });
    const quarantinedFiles = await FileRecord.countDocuments({ status: 'quarantined' });
    const totalUsers = await User.countDocuments();
    const lockedUsers = await User.countDocuments({ lockoutUntil: { $gt: new Date() } });
    const totalShares = await ShareRecord.countDocuments({ status: 'active' });
    const activeAlerts = await Alert.countDocuments({ status: 'Active' });
    const totalAlerts = await Alert.countDocuments();
    const totalLogs = await ActivityLog.countDocuments();

    // Alert severity breakdown
    const criticalAlerts = await Alert.countDocuments({ severity: 'Critical', status: 'Active' });
    const highAlerts = await Alert.countDocuments({ severity: 'High', status: 'Active' });
    const mediumAlerts = await Alert.countDocuments({ severity: 'Medium', status: 'Active' });
    const lowAlerts = await Alert.countDocuments({ severity: 'Low', status: 'Active' });

    res.json({
      success: true,
      metrics: {
        totalFiles,
        quarantinedFiles,
        totalUsers,
        lockedUsers,
        totalShares,
        activeAlerts,
        totalAlerts,
        totalLogs,
        severityCounts: {
          critical: criticalAlerts,
          high: highAlerts,
          medium: mediumAlerts,
          low: lowAlerts
        },
        encryptionStandard: 'AES-256-GCM (256-bit Key, PBKDF2 100k, AEAD Auth Tag)',
        monitoringEngineStatus: 'Active (Real-time WebSockets Live)'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/alerts
 * REQ-12: List active and past alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const { status, severity, limit = 50 } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (severity && severity !== 'all') query.severity = severity;

    const alerts = await Alert.find(query).sort({ createdAt: -1 }).limit(parseInt(limit, 10));
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/admin/alerts/:alertId
 * REQ-13: Mark alert as reviewed or resolved
 */
router.patch('/alerts/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { status } = req.body; // 'Reviewed' or 'Resolved'

    if (!['Active', 'Reviewed', 'Resolved'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const alert = await Alert.findOne({ alertId });
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    alert.status = status;
    alert.reviewedBy = req.user.email;
    if (status === 'Resolved') {
      alert.resolvedAt = new Date();
    }
    await alert.save();

    await threatMonitor.logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'ALERT_STATUS_UPDATED',
      ipAddress: req.ip || '127.0.0.1',
      severity: 'info',
      details: { alertId, newStatus: status }
    });

    res.json({ success: true, alert, message: `Alert marked as ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/logs
 * REQ-11: Chronological file-transfer and activity logs with filtering
 */
router.get('/logs', async (req, res) => {
  try {
    const { action, severity, user, limit = 100 } = req.query;
    const query = {};

    if (action && action !== 'all') query.action = action;
    if (severity && severity !== 'all') query.severity = severity;
    if (user) query.userEmail = new RegExp(user, 'i');

    const logs = await ActivityLog.find(query).sort({ timestamp: -1 }).limit(parseInt(limit, 10));
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/admin/purge
 * Section 6.1: Allow Administrator to purge old logs and resolved alerts for testing
 */
router.delete('/purge', async (req, res) => {
  try {
    const { target } = req.body; // 'logs', 'resolved_alerts', or 'all_alerts'
    let message = '';

    if (target === 'logs') {
      await ActivityLog.deleteMany({});
      message = 'Activity logs have been purged.';
    } else if (target === 'resolved_alerts') {
      await Alert.deleteMany({ status: 'Resolved' });
      message = 'Resolved alerts purged.';
    } else if (target === 'all_alerts') {
      await Alert.deleteMany({});
      message = 'All alert history has been purged.';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid purge target' });
    }

    await threatMonitor.logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'ADMIN_PURGE_EXECUTED',
      details: { target }
    });

    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/users
 * User management list
 */
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      users: users.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        failedAttempts: u.failedLoginAttempts,
        isLocked: u.isLocked,
        lockoutUntil: u.lockoutUntil,
        createdAt: u.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/users/unlock/:userId
 * Unlock a locked user account
 */
router.post('/users/unlock/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    await threatMonitor.logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'ACCOUNT_UNLOCKED',
      details: { unlockedEmail: user.email }
    });

    res.json({ success: true, message: `Account for ${user.email} unlocked.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/users/role/:userId
 * Change user role
 */
router.post('/users/role/:userId', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['Administrator', 'Staff', 'End User'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.role = role;
    await user.save();

    res.json({ success: true, message: `User role updated to ${role}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/simulator
 * Interactive Threat Simulation Lab (for lab evaluation demonstrations)
 */
router.post('/simulator', async (req, res) => {
  try {
    const { scenario } = req.body;
    const ip = req.ip || '192.168.1.105';

    switch (scenario) {
      case 'brute_force': {
        const victimEmail = 'user@securetransfer.local';
        // Simulate 5 rapid failed logins
        for (let i = 0; i < 5; i++) {
          await threatMonitor.recordFailedLogin(victimEmail, ip);
        }
        return res.json({
          success: true,
          message: `Simulated 5 brute-force attempts on ${victimEmail}. Account locked and High Alert broadcasted!`
        });
      }

      case 'decrypt_tamper': {
        // Find or create a mock file to simulate ciphertext tampering
        let file = await FileRecord.findOne({ status: 'stored' });
        if (!file) {
          // Create a mock encrypted file
          const mockBuffer = Buffer.from('Sensitive Project Research Data');
          const encResult = await cryptoEngine.encryptAndStore(mockBuffer, 'mock-threat-test');
          file = await FileRecord.create({
            fileId: 'mock-threat-test',
            originalName: 'classified_lab_dataset.pdf',
            storedFileName: encResult.storedFileName,
            mimeType: 'application/pdf',
            size: mockBuffer.length,
            checksum: encResult.checksum,
            iv: encResult.iv,
            authTag: encResult.authTag,
            salt: encResult.salt,
            uploadedBy: req.user.id,
            uploaderName: req.user.name,
            uploaderEmail: req.user.email,
            status: 'stored'
          });
        }

        // Simulate 3 failed decryption / tamper attempts
        for (let i = 0; i < 3; i++) {
          await threatMonitor.recordFailedDecryption(
            file,
            'attacker@external.net',
            ip,
            'Simulated Ciphertext Bit Flip / AES-GCM Authentication Tag Mismatch'
          );
        }

        return res.json({
          success: true,
          message: `Simulated ciphertext tamper attack on "${file.originalName}". AES-GCM tag verification failed, file quarantined, Critical Alert broadcasted!`
        });
      }

      case 'unauthorized_access': {
        const file = await FileRecord.findOne({ status: 'stored' });
        await threatMonitor.recordUnauthorizedAccess(
          file || { fileId: 'unknown-target', originalName: 'financial_records.xlsx' },
          'unauthorized_agent@unknown.org',
          ip
        );
        return res.json({
          success: true,
          message: 'Simulated unauthorized download attempt. Access denied & High Alert broadcasted!'
        });
      }

      case 'download_spike': {
        const file = await FileRecord.findOne({ status: 'stored' });
        for (let i = 0; i < 9; i++) {
          await threatMonitor.recordDownload(
            req.user.id,
            req.user.email,
            file || { fileId: 'bulk-file-01', originalName: 'bulk_data.csv', size: 1024 },
            ip
          );
        }
        return res.json({
          success: true,
          message: 'Simulated rapid download spike (9 files within 2 minutes). Velocity anomaly alert broadcasted!'
        });
      }

      case 'malicious_file_upload': {
        await threatMonitor.raiseAlert({
          type: 'SUSPICIOUS_EXTENSION_BLOCKED',
          severity: 'High',
          message: `Upload Blocked: Suspicious executable payload "trojan_payload.exe" intercepted by file inspection engine.`,
          targetUser: 'external_uploader@threat.xyz',
          ipAddress: ip,
          metadata: { filename: 'trojan_payload.exe', size: 409600 }
        });
        return res.json({
          success: true,
          message: 'Simulated malicious executable file upload intercept. Threat Alert broadcasted!'
        });
      }

      default:
        return res.status(400).json({ success: false, message: 'Unknown simulation scenario' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
