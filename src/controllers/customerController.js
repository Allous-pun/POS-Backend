const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { successResponse, errorResponse } = require('../utils/response');

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
const getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const {
      search,
      customerType,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    if (customerType) {
      query.customerType = customerType;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const customers = await Customer.find(query)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Customer.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      customers,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, 'Customers retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email');

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Get customer's recent orders
    const recentOrders = await Order.find({ customer: req.params.id })
      .select('orderNumber totalAmount status createdAt payment.method')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get customer statistics
    const orderStats = await Order.aggregate([
      { $match: { customer: customer._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          lastOrderDate: { $max: '$createdAt' }
        }
      }
    ]);

    const customerWithDetails = {
      ...customer.toObject(),
      recentOrders,
      orderStats: orderStats[0] || {
        totalOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        lastOrderDate: null
      }
    };

    successResponse(res, customerWithDetails, 'Customer retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Private/Cashier
const createCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      customerType = 'regular',
      dateOfBirth,
      gender,
      company,
      taxId,
      paymentTerms = 'cash',
      creditLimit = 0,
      preferredPaymentMethod = 'cash',
      notes,
      assignedTo
    } = req.body;

    // Check if customer with phone already exists
    const existingCustomer = await Customer.findOne({ phone });
    if (existingCustomer) {
      return errorResponse(res, 'Customer with this phone number already exists', 400);
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await Customer.findOne({ email });
      if (existingEmail) {
        return errorResponse(res, 'Customer with this email already exists', 400);
      }
    }

    const customerData = {
      name,
      email,
      phone,
      address: typeof address === 'string' ? JSON.parse(address) : address,
      customerType,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender,
      company,
      taxId,
      paymentTerms,
      creditLimit: parseFloat(creditLimit),
      preferredPaymentMethod,
      notes,
      assignedTo,
      createdBy: req.user.id
    };

    const customer = await Customer.create(customerData);

    const populatedCustomer = await Customer.findById(customer._id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email');

    successResponse(res, populatedCustomer, 'Customer created successfully', 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'Customer with this phone or email already exists', 400);
    }
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private/Cashier
const updateCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      customerType,
      dateOfBirth,
      gender,
      company,
      taxId,
      paymentTerms,
      creditLimit,
      preferredPaymentMethod,
      notes,
      assignedTo,
      isActive
    } = req.body;

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Check if phone is being changed and if it already exists
    if (phone && phone !== customer.phone) {
      const existingPhone = await Customer.findOne({ 
        phone,
        _id: { $ne: req.params.id }
      });
      if (existingPhone) {
        return errorResponse(res, 'Customer with this phone number already exists', 400);
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== customer.email) {
      const existingEmail = await Customer.findOne({ 
        email,
        _id: { $ne: req.params.id }
      });
      if (existingEmail) {
        return errorResponse(res, 'Customer with this email already exists', 400);
      }
    }

    const updateData = {
      name,
      email,
      phone,
      customerType,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : customer.dateOfBirth,
      gender,
      company,
      taxId,
      paymentTerms,
      preferredPaymentMethod,
      notes,
      assignedTo,
      isActive
    };

    // Handle address
    if (address) {
      updateData.address = typeof address === 'string' ? JSON.parse(address) : address;
    }

    // Handle credit limit
    if (creditLimit !== undefined) {
      updateData.creditLimit = parseFloat(creditLimit);
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'name email')
    .populate('assignedTo', 'name email');

    successResponse(res, updatedCustomer, 'Customer updated successfully');
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'Customer with this phone or email already exists', 400);
    }
    errorResponse(res, error.message, 500);
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private/Manager
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    // Check if customer has orders
    const orderCount = await Order.countDocuments({ customer: req.params.id });
    if (orderCount > 0) {
      return errorResponse(res, 'Cannot delete customer with existing orders', 400);
    }

    await Customer.findByIdAndDelete(req.params.id);

    successResponse(res, null, 'Customer deleted successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get customer orders
// @route   GET /api/customers/:id/orders
// @access  Private
const getCustomerOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    const orders = await Order.find({ customer: req.params.id })
      .select('orderNumber totalAmount status payment.method createdAt items')
      .populate('cashier', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ customer: req.params.id });
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      },
      orders,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, 'Customer orders retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Search customers by phone or name
// @route   GET /api/customers/search/quick
// @access  Private/Cashier
const quickSearch = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return errorResponse(res, 'Search query is required', 400);
    }

    const customers = await Customer.find({
      $or: [
        { phone: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ],
      isActive: true
    })
    .select('name phone email customerType loyaltyPoints totalSpent')
    .limit(10);

    successResponse(res, customers, 'Customers retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get customer statistics
// @route   GET /api/customers/stats/overview
// @access  Private/Manager
const getCustomerStats = async (req, res) => {
  try {
    const stats = await Customer.getCustomerStats();

    // Get customer growth data (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const growthData = await Customer.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          newCustomers: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    successResponse(res, {
      overview: stats,
      growth: growthData
    }, 'Customer statistics retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update customer loyalty points
// @route   PATCH /api/customers/:id/loyalty
// @access  Private/Manager
const updateLoyaltyPoints = async (req, res) => {
  try {
    const { points, operation } = req.body; // operation: 'add', 'subtract', 'set'

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return errorResponse(res, 'Customer not found', 404);
    }

    const pointsValue = parseInt(points);

    switch (operation) {
      case 'add':
        customer.loyaltyPoints += pointsValue;
        break;
      case 'subtract':
        customer.loyaltyPoints = Math.max(0, customer.loyaltyPoints - pointsValue);
        break;
      case 'set':
        customer.loyaltyPoints = Math.max(0, pointsValue);
        break;
      default:
        return errorResponse(res, 'Invalid operation', 400);
    }

    await customer.save();

    successResponse(res, customer, 'Loyalty points updated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get VIP customers
// @route   GET /api/customers/vip/list
// @access  Private/Manager
const getVIPCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const customers = await Customer.find({ 
      customerType: 'vip',
      isActive: true 
    })
    .select('name phone email totalSpent orderCount loyaltyPoints lastOrderDate')
    .sort({ totalSpent: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Customer.countDocuments({ 
      customerType: 'vip',
      isActive: true 
    });
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      customers,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, 'VIP customers retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Bulk update customer status
// @route   PATCH /api/customers/bulk/status
// @access  Private/Manager
const bulkUpdateStatus = async (req, res) => {
  try {
    const { customerIds, isActive } = req.body;

    if (!customerIds || !Array.isArray(customerIds)) {
      return errorResponse(res, 'Customer IDs array is required', 400);
    }

    const result = await Customer.updateMany(
      { _id: { $in: customerIds } },
      { isActive }
    );

    successResponse(res, {
      matched: result.matchedCount,
      modified: result.modifiedCount
    }, `Customers ${isActive ? 'activated' : 'deactivated'} successfully`);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

module.exports = {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerOrders,
  quickSearch,
  getCustomerStats,
  updateLoyaltyPoints,
  getVIPCustomers,
  bulkUpdateStatus
};