const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { successResponse, errorResponse } = require('../utils/response');

// Helper function to validate secret key
const checkSecretKey = (role, secretKey) => {
  const secretKeys = {
    admin: process.env.ADMIN_SECRET_KEY,
    manager: process.env.MANAGER_SECRET_KEY,
    cashier: process.env.CASHIER_SECRET_KEY
  };

  return secretKeys[role] === secretKey;
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, secretKey } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role || !secretKey) {
      return errorResponse(res, 'Please provide all required fields', 400);
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'cashier'];
    if (!validRoles.includes(role)) {
      return errorResponse(res, 'Invalid role specified', 400);
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return errorResponse(res, 'User already exists', 400);
    }

    // Verify secret key for ALL roles including admin
    const isSecretKeyValid = checkSecretKey(role, secretKey);
    if (!isSecretKeyValid) {
      return errorResponse(res, 'Invalid secret key for the selected role', 401);
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role
    });

    if (user) {
      successResponse(res, {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        token: generateToken(user._id, user.role)
      }, 'User registered successfully', 201);
    }
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      if (!user.isActive) {
        return errorResponse(res, 'Account is deactivated. Please contact administrator.', 401);
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      successResponse(res, {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        token: generateToken(user._id, user.role)
      }, 'Login successful');
    } else {
      errorResponse(res, 'Invalid credentials', 401);
    }
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    successResponse(res, user, 'User data retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      successResponse(res, {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        token: generateToken(updatedUser._id, updatedUser.role)
      }, 'Profile updated successfully');
    } else {
      errorResponse(res, 'User not found', 404);
    }
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile
};