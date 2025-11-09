const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  cost: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  }
});

const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    required: true,
    enum: ['cash', 'card', 'mobile_money', 'bank_transfer', 'credit']
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  transactionId: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paidAt: {
    type: Date
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  customer: {
    type: mongoose.Schema.ObjectId,
    ref: 'Customer'
  },
  customerName: {
    type: String,
    trim: true
  },
  customerPhone: {
    type: String,
    trim: true
  },
  customerEmail: {
    type: String,
    trim: true
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  shippingAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'processing',
      'ready',
      'completed',
      'cancelled',
      'refunded'
    ],
    default: 'pending'
  },
  payment: paymentSchema,
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partially_paid', 'refunded', 'failed'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  orderType: {
    type: String,
    enum: ['walk-in', 'delivery', 'pickup'],
    default: 'walk-in'
  },
  tableNumber: {
    type: String,
    trim: true
  },
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  preparedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  servedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  cashier: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  branch: {
    type: String,
    trim: true
  },
  isTaxable: {
    type: Boolean,
    default: true
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Indexes for better performance
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ cashier: 1 });
orderSchema.index({ 'payment.method': 1 });

// REMOVED: The pre-save middleware for order number generation
// Order number is now generated in the controller

// Virtual for profit calculation
orderSchema.virtual('profit').get(function() {
  return this.totalAmount - this.totalCost;
});

// Virtual for profit margin
orderSchema.virtual('profitMargin').get(function() {
  return ((this.profit / this.totalAmount) * 100).toFixed(2);
});

// Virtual for item count
orderSchema.virtual('itemCount').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Instance method to update stock
orderSchema.methods.updateProductStock = async function(operation) {
  const Product = mongoose.model('Product');
  
  for (const item of this.items) {
    const product = await Product.findById(item.product);
    if (product && product.trackInventory) {
      if (operation === 'reduce') {
        product.stock -= item.quantity;
        if (product.stock < 0) product.stock = 0;
      } else if (operation === 'restore') {
        product.stock += item.quantity;
      }
      await product.save();
    }
  }
};

// Static method to get sales statistics
orderSchema.statics.getSalesStats = async function(startDate, endDate) {
  const matchStage = {
    status: 'completed',
    paymentStatus: 'paid',
    createdAt: { $gte: startDate, $lte: endDate }
  };

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$totalAmount' },
        totalCost: { $sum: '$totalCost' },
        totalProfit: { $sum: { $subtract: ['$totalAmount', '$totalCost'] } },
        totalOrders: { $sum: 1 },
        totalItems: { $sum: { $size: '$items' } },
        averageOrderValue: { $avg: '$totalAmount' }
      }
    }
  ]);

  return stats[0] || {
    totalSales: 0,
    totalCost: 0,
    totalProfit: 0,
    totalOrders: 0,
    totalItems: 0,
    averageOrderValue: 0
  };
};

// Ensure virtual fields are serialized
orderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);