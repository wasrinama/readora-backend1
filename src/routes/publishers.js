import express from 'express';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import Publisher from '../models/Publisher.js';
import { verifyAdminOrStaff } from '../middleware/auth.js';
import { slugify } from '../utils/slugify.js';
import { memoryCache } from '../utils/cache.js';

const router = express.Router();

// @route   GET /api/publishers
// @desc    Get all publishers (Cached in memory)
router.get('/', async (req, res) => {
  const cacheKey = 'publishers:all';
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(cached);
  }

  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let publishers = [];
    if (isMock) {
      const db = readFallbackData();
      publishers = db.publishers || [];
    } else {
      publishers = await Publisher.find().sort({ name: 1 }).lean();
    }
    memoryCache.set(cacheKey, publishers, 600);
    res.set('Cache-Control', 'public, max-age=300');
    res.json(publishers);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving publishers', error: error.message });
  }
});

// @route   GET /api/publishers/:identifier
// @desc    Get publisher by ID, slug, or name
router.get('/:identifier', async (req, res) => {
  const { identifier } = req.params;
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    let publisher = null;
    if (isMock) {
      const db = readFallbackData();
      const publishers = db.publishers || [];
      publisher = publishers.find(p => 
        p._id === identifier || 
        p.slug === identifier || 
        slugify(p.name) === identifier ||
        p.name.toLowerCase() === identifier.toLowerCase()
      );
    } else {
      if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
        publisher = await Publisher.findById(identifier);
      }
      if (!publisher) {
        publisher = await Publisher.findOne({ slug: identifier });
      }
      if (!publisher) {
        const allPublishers = await Publisher.find({});
        publisher = allPublishers.find(p => 
          slugify(p.name) === identifier || 
          p.name.toLowerCase() === identifier.toLowerCase()
        );
      }
    }

    if (!publisher) {
      return res.status(404).json({ message: 'Publisher not found' });
    }

    res.json(publisher);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving publisher', error: error.message });
  }
});

// @route   POST /api/publishers
// @desc    Create a publisher (Admin/Staff only)
router.post('/', verifyAdminOrStaff, async (req, res) => {
  const { name, description, logo } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Publisher name is required.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';
  const slug = slugify(name);

  try {
    if (isMock) {
      const db = readFallbackData();
      if (!db.publishers) db.publishers = [];

      const exists = db.publishers.some(p => p.name.toLowerCase() === name.trim().toLowerCase());
      if (exists) return res.status(400).json({ message: 'Publisher already exists.' });

      const newPublisher = {
        _id: 'pub_' + Date.now(),
        name: name.trim(),
        description: description || '',
        logo: logo || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=200',
        slug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.publishers.push(newPublisher);
      writeFallbackData(db);
      res.status(201).json(newPublisher);
    } else {
      const exists = await Publisher.findOne({ name: name.trim() });
      if (exists) return res.status(400).json({ message: 'Publisher already exists.' });

      const newPublisher = new Publisher({
        name: name.trim(),
        description,
        logo,
        slug
      });
      await newPublisher.save();
      memoryCache.invalidatePrefix('publishers:');
      res.status(201).json(newPublisher);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating publisher', error: error.message });
  }
});

// @route   PUT /api/publishers/:id
// @desc    Update a publisher (Admin/Staff only)
router.put('/:id', verifyAdminOrStaff, async (req, res) => {
  const { name, description, logo } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.publishers.findIndex(p => p._id === req.params.id);
      if (index === -1) return res.status(404).json({ message: 'Publisher not found.' });

      db.publishers[index] = {
        ...db.publishers[index],
        name: name !== undefined ? name.trim() : db.publishers[index].name,
        description: description !== undefined ? description : db.publishers[index].description,
        logo: logo !== undefined ? logo : db.publishers[index].logo,
        slug: name !== undefined ? slugify(name) : db.publishers[index].slug,
        updatedAt: new Date().toISOString()
      };
      writeFallbackData(db);
      memoryCache.invalidatePrefix('publishers:');
      res.json(db.publishers[index]);
    } else {
      const updateData = {};
      if (name !== undefined) {
        updateData.name = name.trim();
        updateData.slug = slugify(name);
      }
      if (description !== undefined) updateData.description = description;
      if (logo !== undefined) updateData.logo = logo;

      const updated = await Publisher.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Publisher not found.' });
      memoryCache.invalidatePrefix('publishers:');
      res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating publisher', error: error.message });
  }
});

// @route   DELETE /api/publishers/:id
// @desc    Delete a publisher (Admin/Staff only)
router.delete('/:id', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.publishers.findIndex(p => p._id === req.params.id);
      if (index === -1) return res.status(404).json({ message: 'Publisher not found.' });

      db.publishers.splice(index, 1);
      writeFallbackData(db);
      memoryCache.invalidatePrefix('publishers:');
      res.json({ message: 'Publisher deleted successfully.' });
    } else {
      const deleted = await Publisher.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Publisher not found.' });
      memoryCache.invalidatePrefix('publishers:');
      res.json({ message: 'Publisher deleted successfully.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting publisher', error: error.message });
  }
});

export default router;
