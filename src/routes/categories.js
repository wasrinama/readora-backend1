import express from 'express';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import Category from '../models/Category.js';
import { verifyAdmin, verifyAdminOrStaff } from '../middleware/auth.js';
import { memoryCache } from '../utils/cache.js';

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories (Cached in memory for instant responses)
router.get('/', async (req, res) => {
  const cacheKey = 'categories:all';
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(cached);
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    let categories = [];
    if (isMock) {
      const db = readFallbackData();
      categories = db.categories || [];
    } else {
      categories = await Category.find().sort({ name: 1 }).lean();
    }

    memoryCache.set(cacheKey, categories, 600); // Cache for 10 minutes
    res.set('Cache-Control', 'public, max-age=300');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving categories', error: error.message });
  }
});

// @route   POST /api/categories
// @desc    Create a new category (Admin/Staff only)
router.post('/', verifyAdminOrStaff, async (req, res) => {
  const { name } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  const categoryName = name.trim();

  try {
    if (isMock) {
      const db = readFallbackData();
      if (!db.categories) db.categories = [];

      const exists = db.categories.some(c => c.name.toLowerCase() === categoryName.toLowerCase());
      if (exists) {
        return res.status(400).json({ message: 'Category already exists' });
      }

      const newCategory = {
        _id: 'cat_' + Date.now(),
        name: categoryName
      };

      db.categories.push(newCategory);
      writeFallbackData(db);
      memoryCache.del('categories:all');
      res.status(201).json(newCategory);
    } else {
      const escapedCategoryName = categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exists = await Category.findOne({ name: { $regex: new RegExp(`^${escapedCategoryName}$`, 'i') } });
      if (exists) {
        return res.status(400).json({ message: 'Category already exists' });
      }

      const newCategory = new Category({ name: categoryName });
      await newCategory.save();
      memoryCache.del('categories:all');
      res.status(201).json(newCategory);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating category', error: error.message });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category name (Admin/Staff only)
router.put('/:id', verifyAdminOrStaff, async (req, res) => {
  const { name } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';
  const categoryId = req.params.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  const categoryName = name.trim();

  try {
    if (isMock) {
      const db = readFallbackData();
      if (!db.categories) db.categories = [];

      const index = db.categories.findIndex(c => c._id === categoryId);
      if (index === -1) {
        return res.status(404).json({ message: 'Category not found' });
      }

      const exists = db.categories.some(c => c._id !== categoryId && c.name.toLowerCase() === categoryName.toLowerCase());
      if (exists) {
        return res.status(400).json({ message: 'Another category with this name already exists' });
      }

      db.categories[index].name = categoryName;
      writeFallbackData(db);
      memoryCache.del('categories:all');
      res.json(db.categories[index]);
    } else {
      const escapedCategoryName = categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exists = await Category.findOne({ _id: { $ne: categoryId }, name: { $regex: new RegExp(`^${escapedCategoryName}$`, 'i') } });
      if (exists) {
        return res.status(400).json({ message: 'Another category with this name already exists' });
      }

      const updatedCategory = await Category.findByIdAndUpdate(
        categoryId,
        { name: categoryName },
        { new: true }
      );
      if (!updatedCategory) {
        return res.status(404).json({ message: 'Category not found' });
      }
      memoryCache.del('categories:all');
      res.json(updatedCategory);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating category', error: error.message });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete a category (Admin/Staff only)
router.delete('/:id', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  const categoryId = req.params.id;

  try {
    if (isMock) {
      const db = readFallbackData();
      if (!db.categories) db.categories = [];

      const index = db.categories.findIndex(c => c._id === categoryId);
      if (index === -1) {
        return res.status(404).json({ message: 'Category not found' });
      }

      db.categories.splice(index, 1);
      writeFallbackData(db);
      memoryCache.del('categories:all');
      res.json({ message: 'Category deleted successfully' });
    } else {
      const deletedCategory = await Category.findByIdAndDelete(categoryId);
      if (!deletedCategory) {
        return res.status(404).json({ message: 'Category not found' });
      }
      memoryCache.del('categories:all');
      res.json({ message: 'Category deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting category', error: error.message });
  }
});

export default router;
