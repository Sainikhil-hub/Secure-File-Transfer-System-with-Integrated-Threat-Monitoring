const ActivityLog = require('../models/ActivityLog');
const Alert = require('../models/Alert');
const User = require('../models/User');
const FileRecord = require('../models/FileRecord');
const SecurityPolicy = require('../models/SecurityPolicy');
const websocketService = require('./websocketService');

class ThreatMonitor {
  constructor() {
    // In-memory sliding windows for rapid real-time anomaly detection
    this.failedLogins = new Map();     // key: email or ip, value: [timestamps]
    this.failedDecrypts = new Map();   // key: fileId or userId, value: [timestamps]
    this.downloadSpikes = new Map();   // key: userId, value: [timestamps]
  }

  /**
   * Helper to fetch active security policy
   */
  async getPolicy() {
    let policy = await SecurityPolicy.findOne({ policyKey: 'global_policy' });
    if (!policy) {
      policy = await SecurityPolicy.create({ policyKey: 'global_policy' });
    }
    return policy;
  }

  /**
   * Log an activity in MongoDB and broadcast via WebSocket (REQ-3, REQ-7, REQ-11)
   */
  async logActivity({
    userId = null,
    userEmail = 'anonymous',
    action,
    targetFileId = null,
    targetFileName = null,
    ipAddress = '127.0.0.1',
    severity = 'info',
    details = {}
  }) {
    try {
      const log = await ActivityLog.create({
        userId,
        userEmail,
        action,
        targetFileId,
        targetFileName,
        ipAddress,
        severity,
        details,
        timestamp: new Date()
      });

      // Broadcast to live admin feed
      websocketService.broadcastActivity(log);
      return log;
    } catch (err) {
      console.error('Failed to write activity log:', err.message);
    }
  }

  /**
   * Create a security alert, save to DB, and broadcast to all connected Admin dashboards (REQ-8, REQ-9, REQ-10, REQ-12)
   */
  async raiseAlert({
    type,
    severity = 'Medium',
    message,
    targetUser = null,
    targetFile = null,
    ipAddress = '127.0.0.1',
    metadata = {}
  }) {
    try {
      const alert = await Alert.create({
        type,
        severity,
        message,
        targetUser,
        targetFile,
        ipAddress,
        status: 'Active',
        metadata,
        createdAt: new Date()
      });

      // Live push to connected dashboards without requiring page refresh (REQ-10)
      websocketService.broadcastAlert(alert);

      // Also log this alert in activity logs
      await this.logActivity({
        userEmail: targetUser || 'system',
        action: 'SECURITY_ALERT_GENERATED',
        targetFileId: targetFile,
        ipAddress,
        severity: severity.toLowerCase() === 'critical' ? 'critical' : 'high',
        details: { alertId: alert.alertId, type, message }
      });

      return alert;
    } catch (err) {
      console.error('Failed to create security alert:', err.message);
    }
  }

  /**
   * REQ-5 & REQ-6: Record failed login attempt and trigger brute-force lockout & alert if threshold exceeded
   */
  async recordFailedLogin(email, ip = '127.0.0.1') {
    const policy = await this.getPolicy();
    const key = email.toLowerCase().trim();
    const now = Date.now();

    // Clean up timestamps older than 15 minutes
    const windowMs = policy.lockoutDurationMinutes * 60 * 1000;
    const history = (this.failedLogins.get(key) || []).filter(ts => now - ts < windowMs);
    history.push(now);
    this.failedLogins.set(key, history);

    // Update user failed attempt count in DB
    const user = await User.findOne({ email: key });
    if (user) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      // Check if threshold exceeded
      if (user.failedLoginAttempts >= policy.maxFailedLogins || history.length >= policy.maxFailedLogins) {
        const lockoutUntil = new Date(now + windowMs);
        user.lockoutUntil = lockoutUntil;
        user.failedLoginAttempts = 0; // Reset counter after lockout applied
        await user.save();

        // Clear in-memory history for key
        this.failedLogins.delete(key);

        // Raise Alert (REQ-6)
        await this.raiseAlert({
          type: 'BRUTE_FORCE_LOGIN',
          severity: 'High',
          message: `Account [${email}] locked for ${policy.lockoutDurationMinutes} minutes due to ${policy.maxFailedLogins} consecutive failed login attempts from ${ip}.`,
          targetUser: email,
          ipAddress: ip,
          metadata: { consecutiveFailures: policy.maxFailedLogins, lockoutUntil }
        });

        await this.logActivity({
          userId: user._id,
          userEmail: email,
          action: 'ACCOUNT_LOCKED',
          ipAddress: ip,
          severity: 'high',
          details: { reason: 'Brute-force password guessing threshold exceeded', lockoutUntil }
        });

        return { locked: true, lockoutUntil, remainingAttempts: 0 };
      }

      await user.save();
      const remaining = Math.max(0, policy.maxFailedLogins - user.failedLoginAttempts);
      return { locked: false, remainingAttempts: remaining };
    }

    // Even if user not found, track by IP to stop user enumeration brute force
    if (history.length >= policy.maxFailedLogins) {
      await this.raiseAlert({
        type: 'BRUTE_FORCE_LOGIN',
        severity: 'High',
        message: `High volume of failed login attempts detected from IP ${ip} targeting [${email}].`,
        targetUser: email,
        ipAddress: ip,
        metadata: { consecutiveFailures: history.length }
      });
      this.failedLogins.delete(key);
    }

    return { locked: false, remainingAttempts: Math.max(0, policy.maxFailedLogins - history.length) };
  }

  /**
   * Reset failed login counter upon successful authentication
   */
  async recordSuccessfulLogin(user, ip = '127.0.0.1') {
    const key = user.email.toLowerCase().trim();
    this.failedLogins.delete(key);
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    await this.logActivity({
      userId: user._id,
      userEmail: user.email,
      action: 'LOGIN_SUCCESS',
      ipAddress: ip,
      severity: 'info',
      details: { role: user.role }
    });
  }

  /**
   * REQ-8: Record failed file decryption attempt & trigger alert on repeated failures
   */
  async recordFailedDecryption(fileRecord, userEmail = 'unknown', ip = '127.0.0.1', errorReason = 'Ciphertext corrupted or invalid key') {
    const policy = await this.getPolicy();
    const now = Date.now();
    const key = fileRecord.fileId;
    const windowMs = policy.decryptWindowMinutes * 60 * 1000;

    const history = (this.failedDecrypts.get(key) || []).filter(ts => now - ts < windowMs);
    history.push(now);
    this.failedDecrypts.set(key, history);

    // Always log every decryption attempt (REQ-7)
    await this.logActivity({
      userEmail,
      action: 'DECRYPT_FAILURE',
      targetFileId: fileRecord.fileId,
      targetFileName: fileRecord.originalName,
      ipAddress: ip,
      severity: 'warning',
      details: { reason: errorReason, failureCountInWindow: history.length }
    });

    // Check if threshold exceeded (REQ-8)
    if (history.length >= policy.maxFailedDecrypts) {
      // Quarantine file as per SDS State Machine: "threat detected -> Quarantined (access blocked)"
      fileRecord.status = 'quarantined';
      fileRecord.quarantineReason = `Repeated decryption failures (${history.length} attempts in ${policy.decryptWindowMinutes}m)`;
      await fileRecord.save();

      await this.raiseAlert({
        type: 'REPEATED_DECRYPT_FAILURE',
        severity: 'Critical',
        message: `Tamper / Decryption Threat: Repeated decryption failures (${history.length} attempts) detected for file "${fileRecord.originalName}" (ID: ${fileRecord.fileId}). File has been automatically quarantined to prevent data leakage.`,
        targetUser: userEmail,
        targetFile: fileRecord.fileId,
        ipAddress: ip,
        metadata: { failureCount: history.length, originalName: fileRecord.originalName }
      });

      this.failedDecrypts.delete(key);
      return { quarantined: true, count: history.length };
    }

    return { quarantined: false, count: history.length };
  }

  /**
   * REQ-9: Detect abnormal download velocity (spike in short window)
   */
  async recordDownload(userId, userEmail, fileRecord, ip = '127.0.0.1') {
    const policy = await this.getPolicy();
    const now = Date.now();
    const key = userId.toString();
    const windowMs = policy.downloadWindowMinutes * 60 * 1000;

    const history = (this.downloadSpikes.get(key) || []).filter(ts => now - ts < windowMs);
    history.push(now);
    this.downloadSpikes.set(key, history);

    // REQ-3 / REQ-7: Log successful download and decryption
    await this.logActivity({
      userId,
      userEmail,
      action: 'DECRYPT_SUCCESS',
      targetFileId: fileRecord.fileId,
      targetFileName: fileRecord.originalName,
      ipAddress: ip,
      severity: 'info',
      details: { fileSize: fileRecord.size }
    });

    // Check abnormal velocity threshold
    if (history.length >= policy.maxDownloadsPerWindow) {
      await this.raiseAlert({
        type: 'UNUSUAL_DOWNLOAD_SPIKE',
        severity: 'Medium',
        message: `Abnormal Access Pattern: User [${userEmail}] downloaded ${history.length} files within ${policy.downloadWindowMinutes} minutes. Potential mass data scraping.`,
        targetUser: userEmail,
        targetFile: fileRecord.fileId,
        ipAddress: ip,
        metadata: { downloadCountInWindow: history.length, windowMinutes: policy.downloadWindowMinutes }
      });
      // Clear spike window after alerting
      this.downloadSpikes.delete(key);
    }
  }

  /**
   * REQ-9 & REQ-15: Record unauthorized download attempt
   */
  async recordUnauthorizedAccess(fileRecord, userEmail, ip = '127.0.0.1') {
    await this.logActivity({
      userEmail,
      action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      targetFileId: fileRecord ? fileRecord.fileId : 'unknown',
      targetFileName: fileRecord ? fileRecord.originalName : 'unknown',
      ipAddress: ip,
      severity: 'high',
      details: { message: 'User requested file they are not sender or recipient of' }
    });

    await this.raiseAlert({
      type: 'UNAUTHORIZED_FILE_ACCESS',
      severity: 'High',
      message: `Access Violation: User [${userEmail}] attempted unauthorized access to file "${fileRecord ? fileRecord.originalName : 'protected'}" (IP: ${ip}). Access denied.`,
      targetUser: userEmail,
      targetFile: fileRecord ? fileRecord.fileId : null,
      ipAddress: ip,
      metadata: { attemptedAction: 'download' }
    });
  }

  /**
   * Check file for suspicious / dangerous executable extensions (SDS Threat Scanner)
   */
  isDisallowedFileType(filename) {
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.js', '.scr', '.pif', '.com', '.cpl'
    ];
    const ext = (filename.slice(filename.lastIndexOf('.')) || '').toLowerCase();
    return dangerousExtensions.includes(ext);
  }
}

module.exports = new ThreatMonitor();
