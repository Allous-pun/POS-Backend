const mongoose = require('mongoose');

const receiptSettingsSchema = new mongoose.Schema({
  header: {
    type: String,
    default: 'Thank you for your business!'
  },
  footer: {
    type: String,
    default: 'Please come again!'
  },
  showStoreName: {
    type: Boolean,
    default: true
  },
  showStoreAddress: {
    type: Boolean,
    default: true
  },
  showStorePhone: {
    type: Boolean,
    default: true
  },
  showCashierName: {
    type: Boolean,
    default: true
  },
  showOrderNumber: {
    type: Boolean,
    default: true
  },
  showOrderDate: {
    type: Boolean,
    default: true
  },
  showCustomerInfo: {
    type: Boolean,
    default: true
  },
  showTaxDetails: {
    type: Boolean,
    default: true
  },
  showPaymentMethod: {
    type: Boolean,
    default: true
  },
  showBarcode: {
    type: Boolean,
    default: true
  },
  printCustomerCopy: {
    type: Boolean,
    default: true
  },
  printMerchantCopy: {
    type: Boolean,
    default: false
  },
  paperWidth: {
    type: Number,
    default: 80,
    min: 58,
    max: 80
  },
  fontSize: {
    type: String,
    enum: ['small', 'medium', 'large'],
    default: 'small'
  },
  logo: {
    public_id: String,
    url: String
  }
});

const taxSettingsSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  rate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  name: {
    type: String,
    default: 'VAT'
  },
  number: {
    type: String,
    trim: true
  },
  inclusive: {
    type: Boolean,
    default: false
  }
});

const currencySettingsSchema = new mongoose.Schema({
  code: {
    type: String,
    default: 'KES',
    enum: ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF', 'ETB']
  },
  symbol: {
    type: String,
    default: 'KSh'
  },
  position: {
    type: String,
    enum: ['before', 'after'],
    default: 'before'
  },
  decimals: {
    type: Number,
    default: 2,
    min: 0,
    max: 4
  },
  thousandSeparator: {
    type: String,
    default: ','
  },
  decimalSeparator: {
    type: String,
    default: '.'
  }
});

const businessHoursSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  },
  open: {
    type: String,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  close: {
    type: String,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  closed: {
    type: Boolean,
    default: false
  }
});

const settingSchema = new mongoose.Schema({
  store: {
    name: {
      type: String,
      required: [true, 'Store name is required'],
      trim: true,
      maxlength: [100, 'Store name cannot exceed 100 characters']
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: {
        type: String,
        default: 'Kenya'
      }
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    website: {
      type: String,
      trim: true
    },
    registrationNumber: {
      type: String,
      trim: true
    },
    logo: {
      public_id: String,
      url: String
    },
    favicon: {
      public_id: String,
      url: String
    }
  },
  currency: currencySettingsSchema,
  receipt: receiptSettingsSchema,
  tax: taxSettingsSchema,
  businessHours: [businessHoursSchema],
  // POS Settings
  pos: {
    autoPrint: {
      type: Boolean,
      default: false
    },
    requireCustomerInfo: {
      type: Boolean,
      default: false
    },
    defaultPaymentMethod: {
      type: String,
      enum: ['cash', 'card', 'mobile_money', 'bank_transfer'],
      default: 'cash'
    },
    lowStockAlert: {
      type: Boolean,
      default: true
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 1
    },
    enableDiscounts: {
      type: Boolean,
      default: true
    },
    maxDiscountPercentage: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    enableOrderNotes: {
      type: Boolean,
      default: true
    }
  },
  // Security Settings
  security: {
    sessionTimeout: {
      type: Number,
      default: 30,
      min: 5,
      max: 240
    },
    passwordPolicy: {
      minLength: {
        type: Number,
        default: 6,
        min: 4,
        max: 20
      },
      requireNumbers: {
        type: Boolean,
        default: true
      },
      requireSpecialChars: {
        type: Boolean,
        default: false
      }
    },
    loginAttempts: {
      type: Number,
      default: 5,
      min: 3,
      max: 10
    },
    lockoutDuration: {
      type: Number,
      default: 30,
      min: 5,
      max: 1440
    }
  },
  // Notification Settings
  notifications: {
    lowStock: {
      type: Boolean,
      default: true
    },
    newOrder: {
      type: Boolean,
      default: true
    },
    dailySales: {
      type: Boolean,
      default: false
    },
    email: {
      type: String,
      trim: true
    }
  },
  // Backup Settings
  backup: {
    autoBackup: {
      type: Boolean,
      default: false
    },
    backupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'daily'
    },
    lastBackup: Date,
    backupLocation: String
  },
  // System Settings
  system: {
    timezone: {
      type: String,
      default: 'Africa/Nairobi'
    },
    dateFormat: {
      type: String,
      enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      default: 'DD/MM/YYYY'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '24h'
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'sw']
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    }
  },
  // Version and metadata
  version: {
    type: String,
    default: '1.0.0'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    // Create default settings
    settings = await this.create({
      store: {
        name: 'My Store',
        address: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'Kenya'
        },
        phone: '',
        email: ''
      },
      currency: {
        code: 'KES',
        symbol: 'KSh',
        position: 'before',
        decimals: 2,
        thousandSeparator: ',',
        decimalSeparator: '.'
      },
      receipt: {
        header: 'Thank you for your business!',
        footer: 'Please come again!',
        showStoreName: true,
        showStoreAddress: true,
        showStorePhone: true,
        showCashierName: true,
        showOrderNumber: true,
        showOrderDate: true,
        showCustomerInfo: true,
        showTaxDetails: true,
        showPaymentMethod: true,
        showBarcode: true,
        printCustomerCopy: true,
        printMerchantCopy: false,
        paperWidth: 80,
        fontSize: 'small'
      },
      tax: {
        enabled: false,
        rate: 0,
        name: 'VAT',
        number: '',
        inclusive: false
      },
      businessHours: [
        { day: 'monday', open: '08:00', close: '18:00', closed: false },
        { day: 'tuesday', open: '08:00', close: '18:00', closed: false },
        { day: 'wednesday', open: '08:00', close: '18:00', closed: false },
        { day: 'thursday', open: '08:00', close: '18:00', closed: false },
        { day: 'friday', open: '08:00', close: '18:00', closed: false },
        { day: 'saturday', open: '09:00', close: '17:00', closed: false },
        { day: 'sunday', open: '09:00', close: '17:00', closed: true }
      ],
      lastUpdatedBy: null // This will be set when first updated
    });
  }
  return settings;
};

// Pre-save middleware to validate business hours
settingSchema.pre('save', function(next) {
  if (this.businessHours && Array.isArray(this.businessHours)) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const seenDays = new Set();
    
    for (const hour of this.businessHours) {
      if (seenDays.has(hour.day)) {
        return next(new Error(`Duplicate day found: ${hour.day}`));
      }
      seenDays.add(hour.day);
      
      if (!days.includes(hour.day)) {
        return next(new Error(`Invalid day: ${hour.day}`));
      }
      
      if (!hour.closed) {
        if (!hour.open || !hour.close) {
          return next(new Error(`Open and close times are required for ${hour.day}`));
        }
        
        const openTime = new Date(`1970-01-01T${hour.open}`);
        const closeTime = new Date(`1970-01-01T${hour.close}`);
        
        if (closeTime <= openTime) {
          return next(new Error(`Close time must be after open time for ${hour.day}`));
        }
      }
    }
    
    // Ensure all days are present
    if (seenDays.size !== days.length) {
      return next(new Error('Business hours must include all days of the week'));
    }
  }
  next();
});

module.exports = mongoose.model('Setting', settingSchema);