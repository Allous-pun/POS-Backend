const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const ReportService = require('../services/reportService');
const { successResponse, errorResponse } = require('../utils/response');

// @desc    Create new order (POS checkout)
// @route   POST /api/orders
// @access  Private/Cashier
const createOrder = async (req, res) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const {
      customer,
      customerName,
      customerPhone,
      customerEmail,
      items,
      taxAmount = 0,
      discountAmount = 0,
      shippingAmount = 0,
      notes,
      orderType = 'walk-in',
      tableNumber,
      deliveryAddress,
      payment, // ADDED: payment object
      paymentMethod,
      paymentAmount,
      transactionId,
      taxRate = 0,
      isTaxable = true
    } = req.body;

    // FIX: Handle both payment object and direct values
    const finalPaymentMethod = payment?.method || paymentMethod;
    const finalPaymentAmount = payment?.amount || paymentAmount;

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return errorResponse(res, 'Order must contain at least one item', 400);
    }

    // Validate payment - use final values
    if (!finalPaymentMethod || !finalPaymentAmount) {
      await session.abortTransaction();
      session.endSession();
      return errorResponse(res, 'Payment method and amount are required', 400);
    }

    let customerData = null;
    if (customer) {
      customerData = await Customer.findById(customer);
      if (!customerData) {
        await session.abortTransaction();
        session.endSession();
        return errorResponse(res, 'Customer not found', 404);
      }
    }

    // Calculate order totals and validate products
    let subtotal = 0;
    let totalCost = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return errorResponse(res, `Product not found: ${item.product}`, 404);
      }

      if (!product.isActive) {
        await session.abortTransaction();
        session.endSession();
        return errorResponse(res, `Product is not active: ${product.name}`, 400);
      }

      if (product.trackInventory && product.stock < item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return errorResponse(res, `Insufficient stock for: ${product.name}. Available: ${product.stock}`, 400);
      }

      const itemTotal = item.price * item.quantity;
      const itemCost = product.cost * item.quantity;
      const itemDiscount = item.discount || 0;

      subtotal += itemTotal - itemDiscount;
      totalCost += itemCost;

      orderItems.push({
        product: product._id,
        name: product.name,
        sku: product.sku,
        price: item.price,
        cost: product.cost,
        quantity: item.quantity,
        discount: itemDiscount,
        total: itemTotal - itemDiscount
      });
    }

    // Calculate final totals
    const calculatedTax = isTaxable ? (subtotal * taxRate) / 100 : 0;
    const finalTaxAmount = taxAmount || calculatedTax;
    const totalAmount = subtotal + finalTaxAmount + shippingAmount - discountAmount;

    if (finalPaymentAmount < totalAmount) {
      await session.abortTransaction();
      session.endSession();
      return errorResponse(res, `Payment amount (${finalPaymentAmount}) is less than total amount (${totalAmount})`, 400);
    }

    // Generate order number before creating order
    const generateOrderNumber = async () => {
      try {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const startOfDay = new Date(year, date.getMonth(), date.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(year, date.getMonth(), date.getDate(), 23, 59, 59, 999);
        
        const dailyOrderCount = await Order.countDocuments({
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }).session(session);
        
        return `ORD-${year}${month}${day}-${String(dailyOrderCount + 1).padStart(4, '0')}`;
      } catch (error) {
        console.error('Error generating order number:', error);
        // Fallback order number
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `ORD-EMG-${timestamp}${random}`;
      }
    };

    const orderNumber = await generateOrderNumber();

    // Create order - use final payment values
    const orderData = {
      orderNumber, // Add the generated order number
      customer: customerData ? customerData._id : null,
      customerName: customerName || (customerData ? customerData.name : 'Walk-in Customer'),
      customerPhone: customerPhone || (customerData ? customerData.phone : ''),
      customerEmail: customerEmail || (customerData ? customerData.email : ''),
      items: orderItems,
      subtotal,
      taxAmount: finalTaxAmount,
      discountAmount,
      shippingAmount,
      totalAmount,
      totalCost,
      notes,
      orderType,
      tableNumber,
      deliveryAddress,
      taxRate,
      isTaxable,
      cashier: req.user.id,
      payment: {
        method: finalPaymentMethod,
        amount: finalPaymentAmount,
        transactionId,
        status: 'completed',
        paidAt: new Date()
      },
      paymentStatus: 'paid',
      status: orderType === 'walk-in' ? 'completed' : 'confirmed'
    };

    const order = new Order(orderData);
    await order.save({ session });

    // Update product stock
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (product && product.trackInventory) {
        product.stock -= item.quantity;
        if (product.stock < 0) product.stock = 0;
        await product.save({ session });
      }
    }

    // Update customer's last order date and order count if customer exists
    if (customerData) {
      customerData.lastOrderDate = new Date();
      customerData.orderCount = (customerData.orderCount || 0) + 1;
      customerData.totalSpent = (customerData.totalSpent || 0) + totalAmount;
      await customerData.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Populate the created order
    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name phone email')
      .populate('cashier', 'name email')
      .populate('preparedBy', 'name')
      .populate('servedBy', 'name');

    successResponse(res, populatedOrder, 'Order created successfully', 201);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const {
      status,
      paymentStatus,
      orderType,
      startDate,
      endDate,
      customer,
      cashier,
      search
    } = req.query;

    // Build query
    let query = {};

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (orderType) query.orderType = orderType;
    if (customer) query.customer = customer;
    if (cashier) query.cashier = cashier;

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Search by order number or customer name
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(query)
      .populate('customer', 'name phone email')
      .populate('cashier', 'name email')
      .populate('preparedBy', 'name')
      .populate('servedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      orders,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, 'Orders retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone email address')
      .populate('cashier', 'name email')
      .populate('preparedBy', 'name')
      .populate('servedBy', 'name')
      .populate('items.product', 'name sku barcode images');

    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    successResponse(res, order, 'Order retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Private/Manager
const updateOrderStatus = async (req, res) => {
  try {
    const { status, preparedBy, servedBy } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return errorResponse(res, 'Invalid order status', 400);
    }

    // If order is being cancelled and was paid, handle refund
    if (status === 'cancelled' && order.paymentStatus === 'paid') {
      // Restore product stock
      await order.updateProductStock('restore');
      
      order.paymentStatus = 'refunded';
      order.payment.status = 'refunded';
    }

    // If order is being completed and was cancelled, reduce stock again
    if (status === 'completed' && order.status === 'cancelled') {
      await order.updateProductStock('reduce');
      order.paymentStatus = 'paid';
      order.payment.status = 'completed';
    }

    order.status = status;
    if (preparedBy) order.preparedBy = preparedBy;
    if (servedBy) order.servedBy = servedBy;

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name phone email')
      .populate('cashier', 'name email')
      .populate('preparedBy', 'name')
      .populate('servedBy', 'name');

    successResponse(res, populatedOrder, 'Order status updated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Process refund for order
// @route   POST /api/orders/:id/refund
// @access  Private/Manager
const processRefund = async (req, res) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const { refundAmount, reason } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return errorResponse(res, 'Order not found', 404);
    }

    if (order.paymentStatus !== 'paid') {
      await session.abortTransaction();
      session.endSession();
      return errorResponse(res, 'Order is not paid, cannot process refund', 400);
    }

    const refundValue = refundAmount || order.totalAmount;

    if (refundValue > order.totalAmount) {
      await session.abortTransaction();
      session.endSession();
      return errorResponse(res, 'Refund amount cannot exceed order total', 400);
    }

    // Restore product stock
    await order.updateProductStock('restore');

    // Update order status
    order.status = 'refunded';
    order.paymentStatus = refundValue < order.totalAmount ? 'partially_paid' : 'refunded';
    order.payment.status = 'refunded';
    order.notes = order.notes ? `${order.notes}\nRefund: ${reason} (${refundValue})` : `Refund: ${reason} (${refundValue})`;

    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    successResponse(res, order, 'Refund processed successfully');
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get order statistics
// @route   GET /api/orders/stats/overview
// @access  Private/Manager
const getOrderStats = async (req, res) => {
  try {
    const { period = 'today' } = req.query; // today, week, month, year, custom
    
    let startDate, endDate;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(period);
        endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    }

    if (!endDate) endDate = new Date();

    // Get sales statistics
    const salesStats = await Order.getSalesStats(startDate, endDate);

    // Get order count by status
    const statusStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Get payment method statistics
    const paymentStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: '$payment.method',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Get hourly sales data for today
    const hourlyStats = period === 'today' ? await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          sales: { $sum: '$totalAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]) : [];

    successResponse(res, {
      period: {
        start: startDate,
        end: endDate
      },
      sales: salesStats,
      byStatus: statusStats,
      byPayment: paymentStats,
      hourly: hourlyStats
    }, 'Order statistics retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get today's orders summary
// @route   GET /api/orders/today/summary
// @access  Private/Cashier
const getTodaySummary = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const todayStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $facet: {
          totalOrders: [{ $count: 'count' }],
          completedOrders: [
            { $match: { status: 'completed', paymentStatus: 'paid' } },
            { $count: 'count' }
          ],
          pendingOrders: [
            { $match: { status: { $in: ['pending', 'confirmed', 'processing'] } } },
            { $count: 'count' }
          ],
          todaySales: [
            { $match: { status: 'completed', paymentStatus: 'paid' } },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    const stats = todayStats[0];
    const summary = {
      totalOrders: stats.totalOrders[0]?.count || 0,
      completedOrders: stats.completedOrders[0]?.count || 0,
      pendingOrders: stats.pendingOrders[0]?.count || 0,
      todaySales: stats.todaySales[0]?.total || 0,
      todayOrderCount: stats.todaySales[0]?.count || 0
    };

    successResponse(res, summary, "Today's summary retrieved successfully");
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get orders by status
// @route   GET /api/orders/status/:status
// @access  Private
const getOrdersByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled', 'refunded'];
    
    if (!validStatuses.includes(status)) {
      return errorResponse(res, 'Invalid order status', 400);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ status })
      .populate('customer', 'name phone')
      .populate('cashier', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ status });
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      orders,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, `${status} orders retrieved successfully`);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Generate comprehensive sales report
// @route   GET /api/orders/reports/sales
// @access  Private/Manager
const generateSalesReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'day',
      reportType = 'sales'
    } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(res, 'Start date and end date are required', 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let reportData;

    switch (reportType) {
      case 'sales':
        reportData = await ReportService.generateSalesReport(start, end, groupBy);
        break;
      case 'product-performance':
        reportData = await ReportService.generateProductPerformanceReport(start, end);
        break;
      case 'payment-methods':
        reportData = await ReportService.generatePaymentMethodReport(start, end);
        break;
      case 'staff-performance':
        reportData = await ReportService.generateStaffPerformanceReport(start, end);
        break;
      default:
        reportData = await ReportService.generateSalesReport(start, end, groupBy);
    }

    successResponse(res, {
      report: {
        type: reportType,
        groupBy,
        period: { start, end },
        generatedAt: new Date(),
        data: reportData
      }
    }, 'Sales report generated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Generate inventory report
// @route   GET /api/orders/reports/inventory
// @access  Private/Manager
const generateInventoryReport = async (req, res) => {
  try {
    const inventoryReport = await ReportService.generateInventoryReport();

    successResponse(res, {
      report: {
        type: 'inventory',
        generatedAt: new Date(),
        data: inventoryReport
      }
    }, 'Inventory report generated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Generate customer analytics report
// @route   GET /api/orders/reports/customers
// @access  Private/Manager
const generateCustomerReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const customerReport = await ReportService.generateCustomerAnalytics(start, end);

    successResponse(res, {
      report: {
        type: 'customer-analytics',
        period: { start, end },
        generatedAt: new Date(),
        data: customerReport
      }
    }, 'Customer report generated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Generate comprehensive dashboard report
// @route   GET /api/orders/reports/dashboard
// @access  Private/Manager
const generateDashboardReport = async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    const dashboardReport = await ReportService.generateDashboardReport(period);

    successResponse(res, {
      report: {
        type: 'dashboard',
        period: dashboardReport.period,
        generatedAt: new Date(),
        data: dashboardReport
      }
    }, 'Dashboard report generated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Export report data
// @route   POST /api/orders/reports/export
// @access  Private/Manager
const exportReport = async (req, res) => {
  try {
    const {
      reportType,
      format = 'json',
      startDate,
      endDate,
      groupBy,
      options = {}
    } = req.body;

    if (!reportType) {
      return errorResponse(res, 'Report type is required', 400);
    }

    let reportData;
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    // Generate the appropriate report data
    switch (reportType) {
      case 'sales':
        reportData = await ReportService.generateSalesReport(start, end, groupBy);
        break;
      case 'inventory':
        reportData = await ReportService.generateInventoryReport();
        break;
      case 'customer-analytics':
        reportData = await ReportService.generateCustomerAnalytics(start, end);
        break;
      case 'product-performance':
        reportData = await ReportService.generateProductPerformanceReport(start, end);
        break;
      case 'payment-methods':
        reportData = await ReportService.generatePaymentMethodReport(start, end);
        break;
      case 'staff-performance':
        reportData = await ReportService.generateStaffPerformanceReport(start, end);
        break;
      default:
        return errorResponse(res, 'Invalid report type', 400);
    }

    // Export the data
    const exportResult = await ReportService.exportReportData(
      reportType,
      format,
      reportData,
      options
    );

    successResponse(res, exportResult, 'Report exported successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get report types and options
// @route   GET /api/orders/reports/types
// @access  Private/Manager
const getReportTypes = async (req, res) => {
  try {
    const reportTypes = [
      {
        type: 'sales',
        name: 'Sales Report',
        description: 'Detailed sales analysis with various grouping options',
        parameters: ['startDate', 'endDate', 'groupBy'],
        groupByOptions: ['day', 'week', 'month', 'year', 'product', 'category']
      },
      {
        type: 'inventory',
        name: 'Inventory Report',
        description: 'Comprehensive inventory analysis and stock status',
        parameters: []
      },
      {
        type: 'customer-analytics',
        name: 'Customer Analytics',
        description: 'Customer behavior and lifetime value analysis',
        parameters: ['startDate', 'endDate']
      },
      {
        type: 'product-performance',
        name: 'Product Performance',
        description: 'Sales performance and profitability by product',
        parameters: ['startDate', 'endDate']
      },
      {
        type: 'payment-methods',
        name: 'Payment Methods',
        description: 'Analysis of payment method usage and trends',
        parameters: ['startDate', 'endDate']
      },
      {
        type: 'staff-performance',
        name: 'Staff Performance',
        description: 'Sales performance and efficiency by staff members',
        parameters: ['startDate', 'endDate']
      },
      {
        type: 'dashboard',
        name: 'Dashboard Overview',
        description: 'Comprehensive business overview with key metrics',
        parameters: ['period'],
        periodOptions: ['today', 'yesterday', 'week', 'month', 'year']
      }
    ];

    successResponse(res, reportTypes, 'Report types retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  processRefund,
  getOrderStats,
  getTodaySummary,
  getOrdersByStatus,
  generateSalesReport,
  generateInventoryReport,
  generateCustomerReport,
  generateDashboardReport,
  exportReport,
  getReportTypes
};