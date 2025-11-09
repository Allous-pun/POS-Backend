const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      users,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, 'Users retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (user) {
      successResponse(res, user, 'User retrieved successfully');
    } else {
      errorResponse(res, 'User not found', 404);
    }
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Create user (Admin only)
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return errorResponse(res, 'User already exists', 400);
    }

    const user = await User.create({
      name,
      email,
      password,
      role
    });

    successResponse(res, {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    }, 'User created successfully', 201);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.role = req.body.role || user.role;
      user.isActive = req.body.isActive !== undefined ? req.body.isActive : user.isActive;

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      successResponse(res, {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        isActive: updatedUser.isActive
      }, 'User updated successfully');
    } else {
      errorResponse(res, 'User not found', 404);
    }
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.user.id === req.params.id) {
      return errorResponse(res, 'You cannot delete your own account', 400);
    }

    const user = await User.findById(req.params.id);

    if (user) {
      await User.findByIdAndDelete(req.params.id);
      successResponse(res, null, 'User deleted successfully');
    } else {
      errorResponse(res, 'User not found', 404);
    }
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get users by role
// @route   GET /api/users/role/:role
// @access  Private/Admin
const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const validRoles = ['admin', 'manager', 'cashier'];

    if (!validRoles.includes(role)) {
      return errorResponse(res, 'Invalid role', 400);
    }

    const users = await User.find({ role }).select('-password');
    successResponse(res, users, `${role.charAt(0).toUpperCase() + role.slice(1)}s retrieved successfully`);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUsersByRole
};