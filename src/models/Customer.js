const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  phone: {
    type: String,
    trim: true,
    required: [true, 'Customer phone is required'],
    unique: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  customerType: {
    type: String,
    enum: ['regular', 'vip', 'wholesale'],
    default: 'regular'
  },
  loyaltyPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  orderCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastOrderDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    default: 'prefer_not_to_say'
  },
  company: {
    type: String,
    trim: true,
    maxlength: [100, 'Company name cannot exceed 100 characters']
  },
  taxId: {
    type: String,
    trim: true
  },
  paymentTerms: {
    type: String,
    enum: ['cash', 'credit_7', 'credit_15', 'credit_30'],
    default: 'cash'
  },
  creditLimit: {
    type: Number,
    default: 0,
    min: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  preferredPaymentMethod: {
    type: String,
    enum: ['cash', 'card', 'mobile_money', 'bank_transfer', 'credit'],
    default: 'cash'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for better performance - REMOVED phone and email (they have unique/sparse)
customerSchema.index({ name: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ customerType: 1 });
customerSchema.index({ createdBy: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ loyaltyPoints: -1 });
customerSchema.index({ totalSpent: -1 });
customerSchema.index({ lastOrderDate: -1 });

// Virtual for customer lifetime value (LTV)
customerSchema.virtual('lifetimeValue').get(function() {
  return this.totalSpent;
});

// Virtual for average order value
customerSchema.virtual('averageOrderValue').get(function() {
  return this.orderCount > 0 ? (this.totalSpent / this.orderCount).toFixed(2) : 0;
});

// Virtual for days since last order
customerSchema.virtual('daysSinceLastOrder').get(function() {
  if (!this.lastOrderDate) return null;
  const today = new Date();
  const lastOrder = new Date(this.lastOrderDate);
  const diffTime = Math.abs(today - lastOrder);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Static method to get customer statistics
customerSchema.statics.getCustomerStats = async function() {
  const stats = await this.aggregate([
    {
      $facet: {
        totalCustomers: [{ $count: 'count' }],
        activeCustomers: [
          { $match: { isActive: true } },
          { $count: 'count' }
        ],
        customersByType: [
          {
            $group: {
              _id: '$customerType',
              count: { $sum: 1 },
              totalSpent: { $sum: '$totalSpent' }
            }
          }
        ],
        topSpenders: [
          { $sort: { totalSpent: -1 } },
          { $limit: 10 },
          {
            $project: {
              name: 1,
              totalSpent: 1,
              orderCount: 1,
              customerType: 1
            }
          }
        ],
        newCustomersThisMonth: [
          {
            $match: {
              createdAt: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
              }
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ]);

  return stats[0];
};

// Instance method to update customer stats after order
customerSchema.methods.updateAfterOrder = async function(orderAmount) {
  this.totalSpent += orderAmount;
  this.orderCount += 1;
  this.lastOrderDate = new Date();
  
  // Add loyalty points (1 point per $10 spent)
  this.loyaltyPoints += Math.floor(orderAmount / 10);
  
  // Upgrade to VIP if conditions met
  if (this.totalSpent >= 1000 && this.customerType === 'regular') {
    this.customerType = 'vip';
  }
  
  await this.save();
};

// Ensure virtual fields are serialized
customerSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Customer', customerSchema);