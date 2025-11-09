const express = require('express');
const {
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
} = require('../controllers/customerController');
const { protect, requireManager, requireCashier } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(protect);

// Cashier routes
router.get('/search/quick', requireCashier, quickSearch);
router.post('/', requireCashier, createCustomer);
router.put('/:id', requireCashier, updateCustomer);
router.get('/:id', getCustomer);
router.get('/:id/orders', getCustomerOrders);

// Manager routes
router.get('/', getCustomers);
router.get('/vip/list', requireManager, getVIPCustomers);
router.get('/stats/overview', requireManager, getCustomerStats);
router.patch('/:id/loyalty', requireManager, updateLoyaltyPoints);
router.patch('/bulk/status', requireManager, bulkUpdateStatus);

// Admin/Manager routes
router.delete('/:id', requireManager, deleteCustomer);

module.exports = router;