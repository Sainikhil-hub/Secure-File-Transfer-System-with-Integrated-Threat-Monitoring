const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query && req.query.token) {
      // Allow download streaming with query token
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required. Please sign in.'
      });
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists.'
      });
    }

    if (user.isLocked) {
      const remainingMinutes = Math.ceil((user.lockoutUntil - Date.now()) / (60 * 1000));
      return res.status(403).json({
        success: false,
        message: `Account is temporarily locked. Please try again in ${remainingMinutes} minute(s).`
      });
    }

    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your session has expired. Please sign in again.'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid or forged authentication token.'
    });
  }
};

// REQ-14: Restrict to Administrator role only
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'Administrator') {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Administrator privileges required.'
    });
  }
  next();
};

// Allow Staff or Administrator
const requireStaffOrAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'Administrator' && req.user.role !== 'Staff')) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Staff or Administrator role required.'
    });
  }
  next();
};

module.exports = {
  verifyToken,
  requireAdmin,
  requireStaffOrAdmin
};
