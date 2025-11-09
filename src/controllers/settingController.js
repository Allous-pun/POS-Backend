const Setting = require('../models/Setting');
const { cloudinaryUtils } = require('../config/cloudinary');
const { successResponse, errorResponse } = require('../utils/response');

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private/Admin
const getSettings = async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    
    // Remove sensitive information
    const settingsObject = settings.toObject();
    delete settingsObject.lastUpdatedBy;
    
    successResponse(res, settingsObject, 'Settings retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private/Admin
const updateSettings = async (req, res) => {
  try {
    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user.id;

    let settings = await Setting.getSettings();

    // Handle logo upload for store
    if (req.files && req.files.storeLogo) {
      // Delete old logo if exists
      if (settings.store.logo && settings.store.logo.public_id) {
        await cloudinaryUtils.deleteImage(settings.store.logo.public_id);
      }

      const logoFile = req.files.storeLogo[0];
      updateData.store = {
        ...updateData.store,
        logo: {
          public_id: logoFile.filename,
          url: logoFile.path
        }
      };
    }

    // Handle favicon upload
    if (req.files && req.files.favicon) {
      // Delete old favicon if exists
      if (settings.store.favicon && settings.store.favicon.public_id) {
        await cloudinaryUtils.deleteImage(settings.store.favicon.public_id);
      }

      const faviconFile = req.files.favicon[0];
      updateData.store = {
        ...updateData.store,
        favicon: {
          public_id: faviconFile.filename,
          url: faviconFile.path
        }
      };
    }

    // Handle receipt logo upload
    if (req.files && req.files.receiptLogo) {
      // Delete old receipt logo if exists
      if (settings.receipt.logo && settings.receipt.logo.public_id) {
        await cloudinaryUtils.deleteImage(settings.receipt.logo.public_id);
      }

      const receiptLogoFile = req.files.receiptLogo[0];
      updateData.receipt = {
        ...updateData.receipt,
        logo: {
          public_id: receiptLogoFile.filename,
          url: receiptLogoFile.path
        }
      };
    }

    settings = await Setting.findByIdAndUpdate(
      settings._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // Remove sensitive information
    const settingsObject = settings.toObject();
    delete settingsObject.lastUpdatedBy;

    successResponse(res, settingsObject, 'Settings updated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update specific setting section
// @route   PATCH /api/settings/:section
// @access  Private/Admin
const updateSettingSection = async (req, res) => {
  try {
    const { section } = req.params;
    const updateData = req.body;
    
    const validSections = [
      'store', 'currency', 'receipt', 'tax', 'businessHours', 
      'pos', 'security', 'notifications', 'backup', 'system'
    ];

    if (!validSections.includes(section)) {
      return errorResponse(res, 'Invalid settings section', 400);
    }

    let settings = await Setting.getSettings();

    const updateObject = {
      [section]: updateData,
      lastUpdatedBy: req.user.id
    };

    // Handle file uploads for specific sections
    if (section === 'store' && req.files) {
      if (req.files.storeLogo) {
        // Delete old logo if exists
        if (settings.store.logo && settings.store.logo.public_id) {
          await cloudinaryUtils.deleteImage(settings.store.logo.public_id);
        }

        const logoFile = req.files.storeLogo[0];
        updateObject.store.logo = {
          public_id: logoFile.filename,
          url: logoFile.path
        };
      }

      if (req.files.favicon) {
        // Delete old favicon if exists
        if (settings.store.favicon && settings.store.favicon.public_id) {
          await cloudinaryUtils.deleteImage(settings.store.favicon.public_id);
        }

        const faviconFile = req.files.favicon[0];
        updateObject.store.favicon = {
          public_id: faviconFile.filename,
          url: faviconFile.path
        };
      }
    }

    if (section === 'receipt' && req.files && req.files.receiptLogo) {
      // Delete old receipt logo if exists
      if (settings.receipt.logo && settings.receipt.logo.public_id) {
        await cloudinaryUtils.deleteImage(settings.receipt.logo.public_id);
      }

      const receiptLogoFile = req.files.receiptLogo[0];
      updateObject.receipt.logo = {
        public_id: receiptLogoFile.filename,
        url: receiptLogoFile.path
      };
    }

    settings = await Setting.findByIdAndUpdate(
      settings._id,
      { $set: updateObject },
      { new: true, runValidators: true }
    );

    // Remove sensitive information
    const settingsObject = settings.toObject();
    delete settingsObject.lastUpdatedBy;

    successResponse(res, settingsObject, `${section} settings updated successfully`);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get currency settings
// @route   GET /api/settings/currency
// @access  Private
const getCurrencySettings = async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    
    successResponse(res, settings.currency, 'Currency settings retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get receipt settings
// @route   GET /api/settings/receipt
// @access  Private
const getReceiptSettings = async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    
    successResponse(res, settings.receipt, 'Receipt settings retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get store information
// @route   GET /api/settings/store
// @access  Public
const getStoreInfo = async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    
    const storeInfo = {
      name: settings.store.name,
      address: settings.store.address,
      phone: settings.store.phone,
      email: settings.store.email,
      website: settings.store.website,
      logo: settings.store.logo,
      currency: settings.currency,
      businessHours: settings.businessHours
    };
    
    successResponse(res, storeInfo, 'Store information retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Reset settings to default
// @route   POST /api/settings/reset
// @access  Private/Admin
const resetSettings = async (req, res) => {
  try {
    const { sections } = req.body; // Array of sections to reset

    let settings = await Setting.getSettings();
    const defaultSettings = await new Setting().constructor();

    if (!sections || sections.length === 0) {
      return errorResponse(res, 'Please specify sections to reset', 400);
    }

    const updateData = {
      lastUpdatedBy: req.user.id
    };

    sections.forEach(section => {
      if (defaultSettings[section]) {
        updateData[section] = defaultSettings[section];
      }
    });

    settings = await Setting.findByIdAndUpdate(
      settings._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // Remove sensitive information
    const settingsObject = settings.toObject();
    delete settingsObject.lastUpdatedBy;

    successResponse(res, settingsObject, 'Settings reset successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Export settings
// @route   GET /api/settings/export
// @access  Private/Admin
const exportSettings = async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    
    const exportData = {
      exportedAt: new Date(),
      version: settings.version,
      settings: {
        store: settings.store,
        currency: settings.currency,
        receipt: settings.receipt,
        tax: settings.tax,
        businessHours: settings.businessHours,
        pos: settings.pos,
        system: settings.system
      }
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=settings-backup.json');
    
    successResponse(res, exportData, 'Settings exported successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Import settings
// @route   POST /api/settings/import
// @access  Private/Admin
const importSettings = async (req, res) => {
  try {
    const { settings: importData } = req.body;

    if (!importData) {
      return errorResponse(res, 'Settings data is required for import', 400);
    }

    let settings = await Setting.getSettings();

    const updateData = {
      ...importData,
      lastUpdatedBy: req.user.id,
      version: settings.version // Keep current version
    };

    settings = await Setting.findByIdAndUpdate(
      settings._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // Remove sensitive information
    const settingsObject = settings.toObject();
    delete settingsObject.lastUpdatedBy;

    successResponse(res, settingsObject, 'Settings imported successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Validate business hours
// @route   POST /api/settings/business-hours/validate
// @access  Private/Admin
const validateBusinessHours = async (req, res) => {
  try {
    const { businessHours } = req.body;

    // Create a temporary settings instance for validation
    const tempSettings = new Setting({ businessHours });
    
    try {
      await tempSettings.validate();
      successResponse(res, { valid: true }, 'Business hours are valid');
    } catch (validationError) {
      successResponse(res, { valid: false, error: validationError.message }, 'Business hours validation failed');
    }
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

module.exports = {
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
};