const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const threatMonitor = require('../services/threatMonitor');
const config = require('../config');
const { verifyToken } = require('../middleware/auth');

/**
 * Helper to generate JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
};

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this email address already exists.' });
    }

    // Role can only be Staff or End User during regular registration unless admin is creating
    const userRole = (role === 'Staff' || role === 'End User') ? role : 'End User';

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: userRole
    });

    await user.save();

    await threatMonitor.logActivity({
      userId: user._id,
      userEmail: user.email,
      action: 'USER_REGISTER',
      ipAddress: req.ip || req.connection.remoteAddress || '127.0.0.1',
      severity: 'info',
      details: { role: user.role }
    });

    const token = generateToken(user);
    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/login
 * REQ-4, REQ-5, REQ-6: Password verification with brute force protection
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Check if user is locked
    if (user && user.isLocked) {
      const remainingMinutes = Math.ceil((user.lockoutUntil - Date.now()) / (60 * 1000));
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked due to multiple failed attempts. Try again in ${remainingMinutes} minute(s).`,
        locked: true,
        remainingMinutes
      });
    }

    if (!user) {
      // Record failed attempt against IP/email
      const check = await threatMonitor.recordFailedLogin(email, ip);
      await threatMonitor.logActivity({
        userEmail: email,
        action: 'LOGIN_FAILED',
        ipAddress: ip,
        severity: 'warning',
        details: { reason: 'User not found' }
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password combination.',
        remainingAttempts: check.remainingAttempts
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const check = await threatMonitor.recordFailedLogin(user.email, ip);
      await threatMonitor.logActivity({
        userId: user._id,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        ipAddress: ip,
        severity: 'warning',
        details: { remainingAttempts: check.remainingAttempts }
      });

      if (check.locked) {
        return res.status(423).json({
          success: false,
          message: `Too many failed login attempts. Your account has been temporarily locked for security.`,
          locked: true
        });
      }

      return res.status(401).json({
        success: false,
        message: `Invalid email or password. (${check.remainingAttempts} attempts remaining before account lockout)`,
        remainingAttempts: check.remainingAttempts
      });
    }

    // Login successful
    await threatMonitor.recordSuccessfulLogin(user, ip);

    const token = generateToken(user);
    res.json({
      success: true,
      message: 'Authentication successful.',
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/auth/users
 * Returns list of registered users for recipient selection
 */
router.get('/users', verifyToken, async (req, res) => {
  try {
    const users = await User.find({}, 'name email role _id createdAt').sort({ name: 1 });
    res.json({
      success: true,
      users: users.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/google
 * Authenticate or register with Google OAuth / Gmail account
 */
router.post('/google', async (req, res) => {
  try {
    let { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Google account email is required.' });
    }
    
    email = email.toLowerCase().trim();
    name = (name || email.split('@')[0]).trim();
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';

    let user = await User.findOne({ email });
    if (!user) {
      // Auto-register new Google user with a secure random 32-char password
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(16).toString('hex') + 'A1!';
      user = new User({
        name,
        email,
        password: randomPassword,
        role: 'End User'
      });
      await user.save();

      await threatMonitor.logActivity({
        userId: user._id,
        userEmail: user.email,
        action: 'GOOGLE_REGISTER',
        ipAddress: ip,
        severity: 'info',
        details: { provider: 'Google', role: user.role }
      });
    } else {
      if (user.isLocked) {
        const remainingMinutes = Math.ceil((user.lockoutUntil - Date.now()) / (60 * 1000));
        return res.status(423).json({
          success: false,
          message: `Account is temporarily locked. Try again in ${remainingMinutes} minute(s).`
        });
      }

      user.failedLoginAttempts = 0;
      user.lockoutUntil = null;
      await user.save();
    }

    await threatMonitor.recordSuccessfulLogin(user, ip);
    await threatMonitor.logActivity({
      userId: user._id,
      userEmail: user.email,
      action: 'GOOGLE_LOGIN_SUCCESS',
      ipAddress: ip,
      severity: 'info',
      details: { provider: 'Google' }
    });

    const token = generateToken(user);
    res.json({
      success: true,
      message: 'Signed in with Google successfully.',
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/quick-demo-login
 * For lab evaluations, quick switch between demo personas
 */
router.post('/quick-demo-login', async (req, res) => {
  try {
    const { role } = req.body;
    let targetEmail;
    if (role === 'Administrator') targetEmail = 'admin@securetransfer.local';
    else if (role === 'Staff') targetEmail = 'staff@securetransfer.local';
    else targetEmail = 'user@securetransfer.local';

    const user = await User.findOne({ email: targetEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Demo user not seeded yet.' });
    }

    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
