const express = require('express');
const router = express.Router();
const SecurityPolicy = require('../models/SecurityPolicy');
const threatMonitor = require('../services/threatMonitor');
const { verifyToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/config/policy
 */
router.get('/policy', verifyToken, requireAdmin, async (req, res) => {
  try {
    const policy = await threatMonitor.getPolicy();
    res.json({ success: true, policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/config/policy
 * REQ-5.5: Allow adjusting configuration without code changes
 */
router.put('/policy', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      maxFailedLogins,
      lockoutDurationMinutes,
      maxFailedDecrypts,
      decryptWindowMinutes,
      maxDownloadsPerWindow,
      downloadWindowMinutes
    } = req.body;

    const policy = await threatMonitor.getPolicy();

    if (maxFailedLogins !== undefined) policy.maxFailedLogins = Number(maxFailedLogins);
    if (lockoutDurationMinutes !== undefined) policy.lockoutDurationMinutes = Number(lockoutDurationMinutes);
    if (maxFailedDecrypts !== undefined) policy.maxFailedDecrypts = Number(maxFailedDecrypts);
    if (decryptWindowMinutes !== undefined) policy.decryptWindowMinutes = Number(decryptWindowMinutes);
    if (maxDownloadsPerWindow !== undefined) policy.maxDownloadsPerWindow = Number(maxDownloadsPerWindow);
    if (downloadWindowMinutes !== undefined) policy.downloadWindowMinutes = Number(downloadWindowMinutes);

    policy.updatedAt = new Date();
    policy.updatedBy = req.user.email;
    await policy.save();

    await threatMonitor.logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'SECURITY_POLICY_UPDATED',
      details: { policy }
    });

    res.json({ success: true, policy, message: 'Security thresholds updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
