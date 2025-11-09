const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { errorResponse } = require('../utils/response');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user || !req.user.isActive) {
        return errorResponse(res, 'Not authorized, user not active', 401);
      }

      next();
    } catch (error) {
      console.error(error);
      return errorResponse(res, 'Not authorized, token failed', 401);
    }
  } else {
    return errorResponse(res, 'Not authorized, no token', 401);
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return errorResponse(res, `User role ${req.user.role} is not authorized to access this route`, 403);
    }
    next();
  };
};

// Role-specific middleware
const requireAdmin = authorize('admin');
const requireManager = authorize('manager', 'admin');
const requireCashier = authorize('cashier', 'manager', 'admin');

module.exports = {
  protect,
  authorize,
  requireAdmin,
  requireManager,
  requireCashier
};