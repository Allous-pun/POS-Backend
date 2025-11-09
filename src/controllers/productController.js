const Product = require('../models/Product');
const Category = require('../models/Category');
const { cloudinaryUtils } = require('../config/cloudinary');
const { successResponse, errorResponse } = require('../utils/response');

// @desc    Get all products
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category;
    const isActive = req.query.isActive;
    const lowStock = req.query.lowStock === 'true';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) {
      query.category = category;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (lowStock) {
      query.$expr = { $lte: ['$stock', '$lowStockAlert'] };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder;

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      products,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, 'Products retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    if (!product) {
      return errorResponse(res, 'Product not found', 404);
    }

    successResponse(res, product, 'Product retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin/Manager
const createProduct = async (req, res) => {
  try {
    const {
      name, description, category, price, cost, stock,
      lowStockAlert, brand, size, color, weight, tags,
      trackInventory, isFeatured, barcode
    } = req.body;

    // Check if category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return errorResponse(res, 'Category not found', 404);
    }

    // Check if SKU or barcode already exists
    if (barcode) {
      const existingProduct = await Product.findOne({ barcode });
      if (existingProduct) {
        return errorResponse(res, 'Barcode already exists', 400);
      }
    }

    const productData = {
      name,
      description,
      category,
      price: parseFloat(price),
      cost: parseFloat(cost),
      stock: parseInt(stock),
      lowStockAlert: parseInt(lowStockAlert) || 10,
      brand,
      size,
      color,
      trackInventory: trackInventory !== 'false',
      isFeatured: isFeatured === 'true',
      barcode,
      createdBy: req.user.id
    };

    // Handle weight
    if (weight) {
      const weightData = typeof weight === 'string' ? JSON.parse(weight) : weight;
      productData.weight = weightData;
    }

    // Handle tags
    if (tags) {
      productData.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;
    }

    // Handle images
    if (req.files && req.files.length > 0) {
      productData.images = req.files.map((file, index) => ({
        public_id: file.filename,
        url: file.path,
        isPrimary: index === 0
      }));
    }

    const product = await Product.create(productData);

    successResponse(res, product, 'Product created successfully', 201);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin/Manager
const updateProduct = async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return errorResponse(res, 'Product not found', 404);
    }

    // Check if category exists
    if (req.body.category) {
      const categoryExists = await Category.findById(req.body.category);
      if (!categoryExists) {
        return errorResponse(res, 'Category not found', 404);
      }
    }

    // Check if barcode already exists
    if (req.body.barcode && req.body.barcode !== product.barcode) {
      const existingProduct = await Product.findOne({ 
        barcode: req.body.barcode,
        _id: { $ne: req.params.id }
      });
      if (existingProduct) {
        return errorResponse(res, 'Barcode already exists', 400);
      }
    }

    const updateData = { ...req.body };

    // Handle numeric fields
    if (req.body.price) updateData.price = parseFloat(req.body.price);
    if (req.body.cost) updateData.cost = parseFloat(req.body.cost);
    if (req.body.stock) updateData.stock = parseInt(req.body.stock);
    if (req.body.lowStockAlert) updateData.lowStockAlert = parseInt(req.body.lowStockAlert);

    // Handle weight
    if (req.body.weight) {
      updateData.weight = typeof req.body.weight === 'string' ? 
        JSON.parse(req.body.weight) : req.body.weight;
    }

    // Handle tags
    if (req.body.tags) {
      updateData.tags = typeof req.body.tags === 'string' ? 
        JSON.parse(req.body.tags) : req.body.tags;
    }

    // Handle images
    if (req.files && req.files.length > 0) {
      // Delete old images from Cloudinary
      if (product.images && product.images.length > 0) {
        const publicIds = product.images.map(img => img.public_id);
        await cloudinaryUtils.deleteMultipleImages(publicIds);
      }

      updateData.images = req.files.map((file, index) => ({
        public_id: file.filename,
        url: file.path,
        isPrimary: index === 0
      }));
    }

    product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('category', 'name');

    successResponse(res, product, 'Product updated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return errorResponse(res, 'Product not found', 404);
    }

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      const publicIds = product.images.map(img => img.public_id);
      await cloudinaryUtils.deleteMultipleImages(publicIds);
    }

    await Product.findByIdAndDelete(req.params.id);

    successResponse(res, null, 'Product deleted successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update product stock
// @route   PATCH /api/products/:id/stock
// @access  Private/Admin/Manager
const updateStock = async (req, res) => {
  try {
    const { stock, operation } = req.body; // operation: 'set', 'increment', 'decrement'

    const product = await Product.findById(req.params.id);
    if (!product) {
      return errorResponse(res, 'Product not found', 404);
    }

    let newStock = product.stock;

    switch (operation) {
      case 'set':
        newStock = parseInt(stock);
        break;
      case 'increment':
        newStock += parseInt(stock);
        break;
      case 'decrement':
        newStock -= parseInt(stock);
        if (newStock < 0) newStock = 0;
        break;
      default:
        return errorResponse(res, 'Invalid operation', 400);
    }

    product.stock = newStock;
    await product.save();

    successResponse(res, product, 'Stock updated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Toggle product status
// @route   PATCH /api/products/:id/toggle-status
// @access  Private/Admin/Manager
const toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return errorResponse(res, 'Product not found', 404);
    }

    product.isActive = !product.isActive;
    await product.save();

    successResponse(res, product, `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get low stock products
// @route   GET /api/products/alerts/low-stock
// @access  Private/Admin/Manager
const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({
      $expr: { $lte: ['$stock', '$lowStockAlert'] },
      isActive: true,
      trackInventory: true
    })
    .populate('category', 'name')
    .sort({ stock: 1 });

    successResponse(res, products, 'Low stock products retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get product statistics
// @route   GET /api/products/stats/overview
// @access  Private/Admin/Manager
const getProductStats = async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $facet: {
          totalProducts: [
            { $count: 'count' }
          ],
          activeProducts: [
            { $match: { isActive: true } },
            { $count: 'count' }
          ],
          lowStockProducts: [
            { 
              $match: { 
                $expr: { $lte: ['$stock', '$lowStockAlert'] },
                isActive: true,
                trackInventory: true
              } 
            },
            { $count: 'count' }
          ],
          outOfStockProducts: [
            { 
              $match: { 
                stock: 0,
                isActive: true,
                trackInventory: true
              } 
            },
            { $count: 'count' }
          ],
          totalInventoryValue: [
            {
              $group: {
                _id: null,
                value: { $sum: { $multiply: ['$cost', '$stock'] } }
              }
            }
          ]
        }
      }
    ]);

    successResponse(res, stats[0], 'Product statistics retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Search products by barcode or SKU
// @route   GET /api/products/search/scan
// @access  Private
const searchByBarcodeOrSKU = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return errorResponse(res, 'Search query is required', 400);
    }

    const products = await Product.find({
      $or: [
        { barcode: query },
        { sku: query }
      ],
      isActive: true
    })
    .populate('category', 'name')
    .limit(5);

    successResponse(res, products, 'Products retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

module.exports = {
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
};