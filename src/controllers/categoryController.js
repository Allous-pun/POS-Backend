const Category = require('../models/Category');
const Product = require('../models/Product');
const { cloudinaryUtils } = require('../config/cloudinary');
const { successResponse, errorResponse } = require('../utils/response');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const isActive = req.query.isActive;

    // Build query
    let query = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const categories = await Category.find(query)
      .populate('createdBy', 'name email')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .populate('productCount');

    const total = await Category.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    successResponse(res, {
      categories,
      pagination: {
        current: page,
        pages: totalPages,
        total
      }
    }, 'Categories retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Private
const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('productCount');

    if (!category) {
      return errorResponse(res, 'Category not found', 404);
    }

    // Get products in this category
    const products = await Product.find({ 
      category: req.params.id,
      isActive: true 
    }).select('name price stock images');

    successResponse(res, {
      ...category.toObject(),
      products
    }, 'Category retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Create category
// @route   POST /api/categories
// @access  Private/Admin/Manager
const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if category already exists
    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
      return errorResponse(res, 'Category already exists', 400);
    }

    const categoryData = {
      name,
      description,
      createdBy: req.user.id
    };

    // Handle image upload
    if (req.file) {
      categoryData.image = {
        public_id: req.file.filename,
        url: req.file.path
      };
    }

    const category = await Category.create(categoryData);

    successResponse(res, category, 'Category created successfully', 201);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin/Manager
const updateCategory = async (req, res) => {
  try {
    let category = await Category.findById(req.params.id);

    if (!category) {
      return errorResponse(res, 'Category not found', 404);
    }

    // Check if name is being changed and if it already exists
    if (req.body.name && req.body.name !== category.name) {
      const categoryExists = await Category.findOne({ 
        name: req.body.name,
        _id: { $ne: req.params.id }
      });
      if (categoryExists) {
        return errorResponse(res, 'Category name already exists', 400);
      }
    }

    const updateData = { ...req.body };

    // Handle image upload
    if (req.file) {
      // Delete old image from Cloudinary if exists
      if (category.image && category.image.public_id) {
        await cloudinaryUtils.deleteImage(category.image.public_id);
      }

      updateData.image = {
        public_id: req.file.filename,
        url: req.file.path
      };
    }

    category = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    successResponse(res, category, 'Category updated successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return errorResponse(res, 'Category not found', 404);
    }

    // Check if category has products
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0) {
      return errorResponse(res, 'Cannot delete category with associated products', 400);
    }

    // Delete image from Cloudinary if exists
    if (category.image && category.image.public_id) {
      await cloudinaryUtils.deleteImage(category.image.public_id);
    }

    await Category.findByIdAndDelete(req.params.id);

    successResponse(res, null, 'Category deleted successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Toggle category status
// @route   PATCH /api/categories/:id/toggle-status
// @access  Private/Admin/Manager
const toggleCategoryStatus = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return errorResponse(res, 'Category not found', 404);
    }

    category.isActive = !category.isActive;
    await category.save();

    successResponse(res, category, `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

// @desc    Get categories with product count
// @route   GET /api/categories/stats/products-count
// @access  Private
const getCategoriesWithProductCount = async (req, res) => {
  try {
    const categories = await Category.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'category',
          as: 'products'
        }
      },
      {
        $project: {
          name: 1,
          isActive: 1,
          productCount: { $size: '$products' },
          activeProducts: {
            $size: {
              $filter: {
                input: '$products',
                as: 'product',
                cond: { $eq: ['$$product.isActive', true] }
              }
            }
          }
        }
      },
      { $sort: { productCount: -1 } }
    ]);

    successResponse(res, categories, 'Categories with product count retrieved successfully');
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  getCategoriesWithProductCount
};