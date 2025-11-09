const express = require('express');
const {
  getSettings,
  updateSettings,
  updateSettingSection,
  getCurrencySettings,
  getReceiptSettings,
  getStoreInfo,
  resetSettings,
  exportSettings,
  importSettings,
  validateBusinessHours
} = require('../controllers/settingController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

const router = express.Router();

// Public routes
router.get('/store', getStoreInfo);

// Protected routes
router.get('/currency', protect, getCurrencySettings);
router.get('/receipt', protect, getReceiptSettings);

// Admin only routes
router.get('/', protect, requireAdmin, getSettings);
router.get('/export', protect, requireAdmin, exportSettings);
router.post('/import', protect, requireAdmin, importSettings);
router.post('/reset', protect, requireAdmin, resetSettings);
router.post('/business-hours/validate', protect, requireAdmin, validateBusinessHours);

// File upload configuration for settings
const uploadFields = [
  { name: 'storeLogo', maxCount: 1 },
  { name: 'favicon', maxCount: 1 },
  { name: 'receiptLogo', maxCount: 1 }
];

router.put('/', protect, requireAdmin, upload.fields(uploadFields), updateSettings);
router.patch('/:section', protect, requireAdmin, upload.fields(uploadFields), updateSettingSection);

module.exports = router;