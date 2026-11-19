const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const ActivityLog = require('../models/ActivityLog');
const StaffAccessRequest = require('../models/StaffAccessRequest');
const threatMonitor = require('../services/threatMonitor');
const { verifyToken, requireStaffOrAdmin } = require('../middleware/auth');

const requiredFields = ['employeeId', 'department', 'designation', 'reason'];

// End Users can request promotion; the request is not itself a role change.
router.post('/access-requests', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'End User') {
      return res.status(409).json({ success: false, message: 'Only End User accounts can request Staff access.' });
    }

    for (const field of requiredFields) {
      if (typeof req.body[field] !== 'string' || !req.body[field].trim()) {
        return res.status(400).json({ success: false, message: `${field} is required.` });
      }
    }

    const existing = await StaffAccessRequest.findOne({ userId: req.user.id, status: 'Pending' });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You already have a pending Staff access request.' });
    }

    const request = await StaffAccessRequest.create({
      userId: req.user.id,
      fullName: req.user.name,
      email: req.user.email,
      employeeId: req.body.employeeId.trim(),
      department: req.body.department.trim(),
      designation: req.body.designation.trim(),
      reason: req.body.reason.trim()
    });

    await threatMonitor.logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'STAFF_ACCESS_REQUESTED',
      ipAddress: req.ip || req.connection.remoteAddress || '127.0.0.1',
      severity: 'info',
      details: { requestId: request.requestId }
    });

    res.status(201).json({ success: true, request, message: 'Staff access request submitted for administrator review.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/access-requests/me', verifyToken, async (req, res) => {
  try {
    const requests = await StaffAccessRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Staff receive read-only, redacted operational telemetry. They cannot use admin APIs or download other users' files.
router.get('/monitor', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const [alerts, logs] = await Promise.all([
      Alert.find({}, 'type severity status createdAt').sort({ createdAt: -1 }).limit(50),
      ActivityLog.find({}, 'action severity timestamp').sort({ timestamp: -1 }).limit(100)
    ]);
    res.json({ success: true, alerts, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
