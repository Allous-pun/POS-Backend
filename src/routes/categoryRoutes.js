const express = require('express');
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  getCategoriesWithProductCount
} = require('../controllers/categoryController');
const { protect, requireAdmin, requireManager } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

const router = express.Router();

// Public routes (within protected system)
router.get('/', protect, getCategories);
router.get('/stats/products-count', protect, getCategoriesWithProductCount);
router.get('/:id', protect, getCategory);

// Admin/Manager routes
router.post('/', protect, requireManager, upload.single('image'), createCategory);
router.put('/:id', protect, requireManager, upload.single('image'), updateCategory);
router.patch('/:id/toggle-status', protect, requireManager, toggleCategoryStatus);

// Admin only routes
router.delete('/:id', protect, requireAdmin, deleteCategory);

module.exports = router;