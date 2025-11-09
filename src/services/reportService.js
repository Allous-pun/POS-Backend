const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Category = require('../models/Category');
const User = require('../models/User');

class ReportService {
  // @desc    Generate sales report
  // @param   {Date} startDate - Start date for report
  // @param   {Date} endDate - End date for report
  // @param   {String} groupBy - Group by: day, week, month, year, product, category
  static async generateSalesReport(startDate, endDate, groupBy = 'day') {
    const matchStage = {
      status: 'completed',
      paymentStatus: 'paid',
      createdAt: { $gte: startDate, $lte: endDate }
    };

    let groupStage;
    let sortStage;

    switch (groupBy) {
      case 'day':
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          date: { $first: '$createdAt' }
        };
        sortStage = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
        break;
      
      case 'week':
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            week: { $week: '$createdAt' }
          },
          date: { $first: '$createdAt' }
        };
        sortStage = { '_id.year': 1, '_id.week': 1 };
        break;
      
      case 'month':
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          date: { $first: '$createdAt' }
        };
        sortStage = { '_id.year': 1, '_id.month': 1 };
        break;
      
      case 'year':
        groupStage = {
          _id: { year: { $year: '$createdAt' } },
          date: { $first: '$createdAt' }
        };
        sortStage = { '_id.year': 1 };
        break;
      
      case 'product':
        groupStage = {
          _id: '$items.product'
        };
        sortStage = { totalSales: -1 };
        break;
      
      case 'category':
        groupStage = {
          _id: '$items.product'
        };
        sortStage = { totalSales: -1 };
        break;
      
      default:
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          date: { $first: '$createdAt' }
        };
        sortStage = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
    }

    const salesData = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      { $unwind: '$productInfo' },
      {
        $group: {
          ...groupStage,
          totalSales: { $sum: '$items.total' },
          totalCost: { $sum: { $multiply: ['$items.cost', '$items.quantity'] } },
          totalProfit: { $sum: { $subtract: ['$items.total', { $multiply: ['$items.cost', '$items.quantity'] }] } },
          totalQuantity: { $sum: '$items.quantity' },
          orderCount: { $addToSet: '$_id' },
          productName: { $first: '$productInfo.name' },
          category: { $first: '$productInfo.category' }
        }
      },
      {
        $project: {
          _id: 1,
          date: 1,
          totalSales: 1,
          totalCost: 1,
          totalProfit: 1,
          totalQuantity: 1,
          orderCount: { $size: '$orderCount' },
          productName: 1,
          category: 1,
          profitMargin: {
            $cond: {
              if: { $eq: ['$totalSales', 0] },
              then: 0,
              else: { $multiply: [{ $divide: ['$totalProfit', '$totalSales'] }, 100] }
            }
          }
        }
      },
      { $sort: sortStage }
    ]);

    // If grouping by category, we need to do additional processing
    if (groupBy === 'category') {
      const categorySales = await this.getSalesByCategory(startDate, endDate);
      return categorySales;
    }

    return salesData;
  }

  // @desc    Get sales by category
  static async getSalesByCategory(startDate, endDate) {
    const categorySales = await Order.aggregate([
      {
        $match: {
          status: 'completed',
          paymentStatus: 'paid',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      { $unwind: '$productInfo' },
      {
        $lookup: {
          from: 'categories',
          localField: 'productInfo.category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: '$categoryInfo._id',
          categoryName: { $first: '$categoryInfo.name' },
          totalSales: { $sum: '$items.total' },
          totalCost: { $sum: { $multiply: ['$items.cost', '$items.quantity'] } },
          totalProfit: { $sum: { $subtract: ['$items.total', { $multiply: ['$items.cost', '$items.quantity'] }] } },
          totalQuantity: { $sum: '$items.quantity' },
          productCount: { $addToSet: '$items.product' }
        }
      },
      {
        $project: {
          categoryName: 1,
          totalSales: 1,
          totalCost: 1,
          totalProfit: 1,
          totalQuantity: 1,
          productCount: { $size: '$productCount' },
          profitMargin: {
            $cond: {
              if: { $eq: ['$totalSales', 0] },
              then: 0,
              else: { $multiply: [{ $divide: ['$totalProfit', '$totalSales'] }, 100] }
            }
          }
        }
      },
      { $sort: { totalSales: -1 } }
    ]);

    return categorySales;
  }

  // @desc    Generate inventory report
  static async generateInventoryReport() {
    const inventoryData = await Product.aggregate([
      {
        $facet: {
          stockSummary: [
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalValue: { $sum: { $multiply: ['$cost', '$stock'] } },
                totalStock: { $sum: '$stock' },
                outOfStock: {
                  $sum: {
                    $cond: [{ $eq: ['$stock', 0] }, 1, 0]
                  }
                },
                lowStock: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gt: ['$stock', 0] },
                          { $lte: ['$stock', '$lowStockAlert'] }
                        ]
                      },
                      1,
                      0
                    ]
                  }
                }
              }
            }
          ],
          productsByStockStatus: [
            {
              $project: {
                name: 1,
                sku: 1,
                stock: 1,
                lowStockAlert: 1,
                cost: 1,
                price: 1,
                stockValue: { $multiply: ['$cost', '$stock'] },
                stockStatus: {
                  $cond: {
                    if: { $eq: ['$stock', 0] },
                    then: 'out-of-stock',
                    else: {
                      $cond: {
                        if: { $lte: ['$stock', '$lowStockAlert'] },
                        then: 'low-stock',
                        else: 'in-stock'
                      }
                    }
                  }
                }
              }
            },
            {
              $group: {
                _id: '$stockStatus',
                products: { $push: '$$ROOT' },
                count: { $sum: 1 },
                totalValue: { $sum: '$stockValue' }
              }
            }
          ],
          topProductsByValue: [
            { $match: { trackInventory: true } },
            {
              $project: {
                name: 1,
                sku: 1,
                stock: 1,
                cost: 1,
                stockValue: { $multiply: ['$cost', '$stock'] }
              }
            },
            { $sort: { stockValue: -1 } },
            { $limit: 10 }
          ],
          lowStockProducts: [
            {
              $match: {
                trackInventory: true,
                stock: { $gt: 0, $lte: '$lowStockAlert' }
              }
            },
            {
              $project: {
                name: 1,
                sku: 1,
                stock: 1,
                lowStockAlert: 1,
                cost: 1,
                price: 1
              }
            },
            { $sort: { stock: 1 } }
          ]
        }
      }
    ]);

    return inventoryData[0];
  }

  // @desc    Generate customer analytics report
  static async generateCustomerAnalytics(startDate, endDate) {
    const customerAnalytics = await Customer.aggregate([
      {
        $facet: {
          customerOverview: [
            {
              $group: {
                _id: null,
                totalCustomers: { $sum: 1 },
                activeCustomers: {
                  $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
                },
                vipCustomers: {
                  $sum: { $cond: [{ $eq: ['$customerType', 'vip'] }, 1, 0] }
                },
                wholesaleCustomers: {
                  $sum: { $cond: [{ $eq: ['$customerType', 'wholesale'] }, 1, 0] }
                },
                totalLoyaltyPoints: { $sum: '$loyaltyPoints' }
              }
            }
          ],
          customerAcquisition: [
            {
              $match: {
                createdAt: { $gte: startDate, $lte: endDate }
              }
            },
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' }
                },
                newCustomers: { $sum: 1 }
              }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
          ],
          topCustomers: [
            { $match: { totalSpent: { $gt: 0 } } },
            {
              $project: {
                name: 1,
                email: 1,
                phone: 1,
                customerType: 1,
                totalSpent: 1,
                orderCount: 1,
                loyaltyPoints: 1,
                lastOrderDate: 1,
                averageOrderValue: {
                  $cond: {
                    if: { $eq: ['$orderCount', 0] },
                    then: 0,
                    else: { $divide: ['$totalSpent', '$orderCount'] }
                  }
                }
              }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 20 }
          ],
          customerLifetimeValue: [
            {
              $bucket: {
                groupBy: '$totalSpent',
                boundaries: [0, 100, 500, 1000, 5000, 10000],
                default: '10000+',
                output: {
                  count: { $sum: 1 },
                  totalValue: { $sum: '$totalSpent' },
                  avgOrders: { $avg: '$orderCount' }
                }
              }
            }
          ]
        }
      }
    ]);

    return customerAnalytics[0];
  }

  // @desc    Generate product performance report
  static async generateProductPerformanceReport(startDate, endDate) {
    const productPerformance = await Order.aggregate([
      {
        $match: {
          status: 'completed',
          paymentStatus: 'paid',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      { $unwind: '$productInfo' },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$productInfo.name' },
          sku: { $first: '$productInfo.sku' },
          category: { $first: '$productInfo.category' },
          totalSales: { $sum: '$items.total' },
          totalCost: { $sum: { $multiply: ['$items.cost', '$items.quantity'] } },
          totalProfit: { $sum: { $subtract: ['$items.total', { $multiply: ['$items.cost', '$items.quantity'] }] } },
          totalQuantity: { $sum: '$items.quantity' },
          orderCount: { $addToSet: '$_id' },
          averagePrice: { $avg: '$items.price' }
        }
      },
      {
        $project: {
          productName: 1,
          sku: 1,
          category: 1,
          totalSales: 1,
          totalCost: 1,
          totalProfit: 1,
          totalQuantity: 1,
          orderCount: { $size: '$orderCount' },
          averagePrice: 1,
          profitMargin: {
            $cond: {
              if: { $eq: ['$totalSales', 0] },
              then: 0,
              else: { $multiply: [{ $divide: ['$totalProfit', '$totalSales'] }, 100] }
            }
          },
          revenuePerUnit: {
            $cond: {
              if: { $eq: ['$totalQuantity', 0] },
              then: 0,
              else: { $divide: ['$totalSales', '$totalQuantity'] }
            }
          }
        }
      },
      { $sort: { totalSales: -1 } }
    ]);

    return productPerformance;
  }

  // @desc    Generate payment method report
  static async generatePaymentMethodReport(startDate, endDate) {
    const paymentReport = await Order.aggregate([
      {
        $match: {
          status: 'completed',
          paymentStatus: 'paid',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$payment.method',
          totalAmount: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          averageOrderValue: { $avg: '$totalAmount' }
        }
      },
      {
        $project: {
          paymentMethod: '$_id',
          totalAmount: 1,
          orderCount: 1,
          averageOrderValue: 1,
          percentage: {
            $multiply: [
              {
                $divide: [
                  '$totalAmount',
                  {
                    $sum: '$totalAmount'
                  }
                ]
              },
              100
            ]
          }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    return paymentReport;
  }

  // @desc    Generate staff performance report
  static async generateStaffPerformanceReport(startDate, endDate) {
    const staffPerformance = await Order.aggregate([
      {
        $match: {
          status: 'completed',
          paymentStatus: 'paid',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'cashier',
          foreignField: '_id',
          as: 'cashierInfo'
        }
      },
      { $unwind: '$cashierInfo' },
      {
        $group: {
          _id: '$cashier',
          cashierName: { $first: '$cashierInfo.name' },
          cashierEmail: { $first: '$cashierInfo.email' },
          totalSales: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          averageOrderValue: { $avg: '$totalAmount' },
          totalItems: { $sum: { $size: '$items' } },
          totalProfit: { $sum: { $subtract: ['$totalAmount', '$totalCost'] } }
        }
      },
      {
        $project: {
          cashierName: 1,
          cashierEmail: 1,
          totalSales: 1,
          orderCount: 1,
          averageOrderValue: 1,
          totalItems: 1,
          totalProfit: 1,
          itemsPerOrder: {
            $cond: {
              if: { $eq: ['$orderCount', 0] },
              then: 0,
              else: { $divide: ['$totalItems', '$orderCount'] }
            }
          },
          profitMargin: {
            $cond: {
              if: { $eq: ['$totalSales', 0] },
              then: 0,
              else: { $multiply: [{ $divide: ['$totalProfit', '$totalSales'] }, 100] }
            }
          }
        }
      },
      { $sort: { totalSales: -1 } }
    ]);

    return staffPerformance;
  }

  // @desc    Generate comprehensive dashboard report
  static async generateDashboardReport(period = 'today') {
    let startDate, endDate;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'yesterday':
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
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
        endDate = new Date();
    }

    if (!endDate) endDate = new Date();

    const [
      salesStats,
      productPerformance,
      paymentMethods,
      staffPerformance,
      inventorySummary
    ] = await Promise.all([
      Order.getSalesStats(startDate, endDate),
      this.generateProductPerformanceReport(startDate, endDate),
      this.generatePaymentMethodReport(startDate, endDate),
      this.generateStaffPerformanceReport(startDate, endDate),
      this.generateInventoryReport()
    ]);

    // Get hourly sales for today
    let hourlySales = [];
    if (period === 'today') {
      hourlySales = await Order.aggregate([
        {
          $match: {
            status: 'completed',
            paymentStatus: 'paid',
            createdAt: { $gte: startDate, $lte: endDate }
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
      ]);
    }

    return {
      period: {
        start: startDate,
        end: endDate,
        type: period
      },
      sales: salesStats,
      productPerformance: productPerformance.slice(0, 10), // Top 10 products
      paymentMethods,
      staffPerformance,
      inventorySummary,
      hourlySales
    };
  }

  // @desc    Export report data to various formats
  static async exportReportData(reportType, format, data, options = {}) {
    // This would typically integrate with libraries like:
    // - ExcelJS for Excel files
    // - pdfkit for PDF files
    // - json2csv for CSV files
    
    const exportData = {
      reportType,
      format,
      generatedAt: new Date(),
      data,
      options
    };

    // Placeholder for actual export implementation
    // In a real implementation, you would generate files here
    return exportData;
  }
}

module.exports = ReportService;