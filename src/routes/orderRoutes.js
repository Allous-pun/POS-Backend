const express = require('express');
const {
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
} = require('../controllers/orderController');
const { protect, requireManager, requireCashier } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(protect);

// Report routes
router.get('/reports/types', protect, requireManager, getReportTypes);
router.get('/reports/sales', protect, requireManager, generateSalesReport);
router.get('/reports/inventory', protect, requireManager, generateInventoryReport);
router.get('/reports/customers', protect, requireManager, generateCustomerReport);
router.get('/reports/dashboard', protect, requireManager, generateDashboardReport);
router.post('/reports/export', protect, requireManager, exportReport);

// Cashier routes
router.post('/', requireCashier, createOrder);
router.get('/today/summary', requireCashier, getTodaySummary);
router.get('/:id', getOrder);

// Manager routes
router.get('/', getOrders);
router.get('/status/:status', getOrdersByStatus);
router.get('/stats/overview', requireManager, getOrderStats);
router.patch('/:id/status', requireManager, updateOrderStatus);
router.post('/:id/refund', requireManager, processRefund);

module.exports = router;