const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const FileRecord = require('../models/FileRecord');
const ShareRecord = require('../models/ShareRecord');
const User = require('../models/User');
const cryptoEngine = require('../services/cryptoEngine');
const threatMonitor = require('../services/threatMonitor');
const config = require('../config');
const { verifyToken } = require('../middleware/auth');

// Multer in-memory storage: file bytes exist ONLY in memory buffer during encryption.
// Raw unencrypted file is NEVER written to server disk (strictly adheres to REQ-2).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024 // 100MB limit
  }
});

/**
 * POST /api/files/upload
 * REQ-1, REQ-2, REQ-3
 */
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const fileId = uuidv4();

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a file to upload.' });
    }

    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ success: false, message: 'Intended recipient must be selected.' });
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(400).json({ success: false, message: 'Selected recipient was not found.' });
    }

    // SDS ThreatScanner: Check for disallowed executable binaries
    if (threatMonitor.isDisallowedFileType(req.file.originalname)) {
      await threatMonitor.raiseAlert({
        type: 'SUSPICIOUS_EXTENSION_BLOCKED',
        severity: 'High',
        message: `Upload Blocked: User [${req.user.email}] attempted to upload potentially dangerous executable/script file "${req.file.originalname}".`,
        targetUser: req.user.email,
        ipAddress: ip,
        metadata: { filename: req.file.originalname, size: req.file.size }
      });

      await threatMonitor.logActivity({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'UPLOAD_BLOCKED_MALICIOUS_TYPE',
        targetFileName: req.file.originalname,
        ipAddress: ip,
        severity: 'high',
        details: { reason: 'Disallowed file extension' }
      });

      return res.status(400).json({
        success: false,
        message: 'Security policy violation: Executable scripts or binary files are prohibited from transfer.'
      });
    }

    // Encrypt file in memory directly to encrypted storage using AES-256-GCM
    const encryptionResult = await cryptoEngine.encryptAndStore(req.file.buffer, fileId);

    // Create FileRecord in MongoDB
    const fileRecord = new FileRecord({
      fileId,
      originalName: req.file.originalname,
      storedFileName: encryptionResult.storedFileName,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      checksum: encryptionResult.checksum,
      encrypted: true,
      encryptionAlgorithm: encryptionResult.encryptionAlgorithm,
      iv: encryptionResult.iv,
      authTag: encryptionResult.authTag,
      salt: encryptionResult.salt,
      uploadedBy: req.user.id,
      uploaderName: req.user.name,
      uploaderEmail: req.user.email,
      status: 'stored'
    });

    await fileRecord.save();

    // Create ShareRecord linking sender and recipient
    const shareRecord = new ShareRecord({
      fileId: fileRecord._id,
      fileUuid: fileId,
      senderId: req.user.id,
      senderEmail: req.user.email,
      senderName: req.user.name,
      recipientId: recipient._id,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      status: 'active'
    });

    await shareRecord.save();

    // REQ-3: Log successful upload attempt
    await threatMonitor.logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'FILE_UPLOADED',
      targetFileId: fileId,
      targetFileName: req.file.originalname,
      ipAddress: ip,
      severity: 'info',
      details: {
        recipient: recipient.email,
        size: req.file.size,
        encryption: 'AES-256-GCM',
        checksum: encryptionResult.checksum
      }
    });

    res.status(201).json({
      success: true,
      message: 'File encrypted with AES-256-GCM and stored successfully.',
      file: {
        fileId: fileRecord.fileId,
        originalName: fileRecord.originalName,
        size: fileRecord.size,
        checksum: fileRecord.checksum,
        encryptionAlgorithm: fileRecord.encryptionAlgorithm,
        recipient: {
          id: recipient._id,
          name: recipient.name,
          email: recipient.email
        },
        createdAt: fileRecord.createdAt
      }
    });

  } catch (err) {
    // REQ-2 & REQ-3: Log failed upload attempt, do not persist
    await threatMonitor.logActivity({
      userId: req.user ? req.user.id : null,
      userEmail: req.user ? req.user.email : 'unknown',
      action: 'FILE_UPLOAD_FAILED',
      targetFileId: fileId,
      ipAddress: ip,
      severity: 'warning',
      details: { error: err.message }
    });

    res.status(500).json({
      success: false,
      message: `File transfer failed: ${err.message}`
    });
  }
});

/**
 * GET /api/files/received
 * List files shared with the current authenticated user (Inbox)
 */
router.get('/received', verifyToken, async (req, res) => {
  try {
    const shares = await ShareRecord.find({
      recipientId: req.user.id,
      status: 'active'
    }).populate('fileId').sort({ createdAt: -1 });

    const results = shares
      .filter(s => s.fileId && s.fileId.status !== 'deleted')
      .map(s => ({
        shareId: s.shareId,
        fileUuid: s.fileUuid,
        fileName: s.fileId.originalName,
        fileSize: s.fileId.size,
        mimeType: s.fileId.mimeType,
        checksum: s.fileId.checksum,
        encryptionAlgorithm: s.fileId.encryptionAlgorithm,
        status: s.fileId.status,
        quarantineReason: s.fileId.quarantineReason,
        senderName: s.senderName,
        senderEmail: s.senderEmail,
        createdAt: s.createdAt,
        downloadCount: s.downloadCount,
        lastDownloadedAt: s.lastDownloadedAt
      }));

    res.json({ success: true, files: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/files/sent
 * List files sent by the current authenticated user (Outbox)
 */
router.get('/sent', verifyToken, async (req, res) => {
  try {
    const shares = await ShareRecord.find({
      senderId: req.user.id
    }).populate('fileId').sort({ createdAt: -1 });

    const results = shares
      .filter(s => s.fileId && s.fileId.status !== 'deleted')
      .map(s => ({
        shareId: s.shareId,
        fileUuid: s.fileUuid,
        fileName: s.fileId.originalName,
        fileSize: s.fileId.size,
        mimeType: s.fileId.mimeType,
        checksum: s.fileId.checksum,
        encryptionAlgorithm: s.fileId.encryptionAlgorithm,
        status: s.fileId.status,
        quarantineReason: s.fileId.quarantineReason,
        recipientName: s.recipientName,
        recipientEmail: s.recipientEmail,
        createdAt: s.createdAt,
        downloadCount: s.downloadCount,
        lastDownloadedAt: s.lastDownloadedAt
      }));

    res.json({ success: true, files: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/files/download/:fileUuid
 * REQ-7, REQ-8, REQ-9, REQ-15: Decrypt and stream file to authorized recipient or owner
 */
router.get('/download/:fileUuid', verifyToken, async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const { fileUuid } = req.params;

  try {
    const fileRecord = await FileRecord.findOne({ fileId: fileUuid });
    if (!fileRecord || fileRecord.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'Requested file was not found or has been removed.' });
    }

    // REQ-15: Verify requesting user is owner OR recipient recorded on that file's share record
    const isOwner = fileRecord.uploadedBy.toString() === req.user.id.toString();
    const share = await ShareRecord.findOne({
      fileUuid,
      recipientId: req.user.id,
      status: 'active'
    });

    if (!isOwner && !share && req.user.role !== 'Administrator') {
      // REQ-15: requests from any other user shall be denied and logged
      await threatMonitor.recordUnauthorizedAccess(fileRecord, req.user.email, ip);
      return res.status(403).json({
        success: false,
        message: 'Access Denied: You are not authorized to download this file.'
      });
    }

    // Check if quarantined
    if (fileRecord.status === 'quarantined') {
      await threatMonitor.logActivity({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'QUARANTINED_FILE_ACCESS_BLOCKED',
        targetFileId: fileUuid,
        targetFileName: fileRecord.originalName,
        ipAddress: ip,
        severity: 'warning',
        details: { reason: fileRecord.quarantineReason }
      });

      return res.status(403).json({
        success: false,
        message: `File Quarantined: This file is currently locked by security monitoring. Reason: ${fileRecord.quarantineReason || 'Suspicious activity detected.'}`
      });
    }

    // Perform AES-256-GCM authenticated decryption
    let decryptedBuffer;
    try {
      decryptedBuffer = await cryptoEngine.decryptFile(fileRecord);
    } catch (cryptoErr) {
      // REQ-7 & REQ-8: Failed decryption attempt
      const result = await threatMonitor.recordFailedDecryption(
        fileRecord,
        req.user.email,
        ip,
        cryptoErr.message
      );

      return res.status(500).json({
        success: false,
        message: `Decryption integrity failed: The file could not be authenticated. ${result.quarantined ? 'File has been automatically quarantined.' : ''}`
      });
    }

    // Decryption succeeded! Update download metrics & velocity monitoring (REQ-9)
    await threatMonitor.recordDownload(req.user.id, req.user.email, fileRecord, ip);

    if (share) {
      share.downloadCount = (share.downloadCount || 0) + 1;
      share.lastDownloadedAt = new Date();
      await share.save();
    }

    // Stream decrypted file back to user with appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileRecord.originalName)}"`);
    res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', decryptedBuffer.length);
    res.setHeader('X-Decryption-Algorithm', fileRecord.encryptionAlgorithm);
    res.setHeader('X-File-Checksum', fileRecord.checksum);

    return res.end(decryptedBuffer);

  } catch (err) {
    return res.status(500).json({ success: false, message: `Download failed: ${err.message}` });
  }
});

/**
 * POST /api/files/quarantine/:fileUuid
 * Quarantine or Unquarantine a file manually (Admin / Owner action)
 */
router.post('/quarantine/:fileUuid', verifyToken, async (req, res) => {
  try {
    const { fileUuid } = req.params;
    const { action, reason } = req.body; // 'quarantine' or 'release'

    const fileRecord = await FileRecord.findOne({ fileId: fileUuid });
    if (!fileRecord) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (req.user.role !== 'Administrator' && fileRecord.uploadedBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (action === 'quarantine') {
      fileRecord.status = 'quarantined';
      fileRecord.quarantineReason = reason || 'Manually quarantined by administrator';
      await fileRecord.save();

      await threatMonitor.raiseAlert({
        type: 'MANUAL_QUARANTINE',
        severity: 'Medium',
        message: `File "${fileRecord.originalName}" was placed in quarantine by ${req.user.email}.`,
        targetFile: fileRecord.fileId,
        metadata: { quarantinedBy: req.user.email }
      });
    } else {
      fileRecord.status = 'stored';
      fileRecord.quarantineReason = null;
      await fileRecord.save();
    }

    res.json({ success: true, status: fileRecord.status, message: `File status updated to ${fileRecord.status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
