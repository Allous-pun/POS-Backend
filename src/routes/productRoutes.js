const express = require('express');
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  toggleProductStatus,
  getLowStockProducts,
  getProductStats,
  searchByBarcodeOrSKU
} = require('../controllers/productController');
const { protect, requireAdmin, requireManager } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

const router = express.Router();

// Public routes (within protected system)
router.get('/', protect, getProducts);
router.get('/search/scan', protect, searchByBarcodeOrSKU);
router.get('/alerts/low-stock', protect, requireManager, getLowStockProducts);
router.get('/stats/overview', protect, requireManager, getProductStats);
router.get('/:id', protect, getProduct);

// Admin/Manager routes
router.post('/', protect, requireManager, upload.array('images', 5), createProduct);
router.put('/:id', protect, requireManager, upload.array('images', 5), updateProduct);
router.patch('/:id/stock', protect, requireManager, updateStock);
router.patch('/:id/toggle-status', protect, requireManager, toggleProductStatus);

// Admin only routes
router.delete('/:id', protect, requireAdmin, deleteProduct);

module.exports = router;