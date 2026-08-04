import express from 'express';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import Banner from '../models/Banner.js';
import { verifyAdminOrStaff } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/banners
// @desc    Get all active banners (Public)
router.get('/', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let banners = [];
    if (isMock) {
      const db = readFallbackData();
      banners = (db.banners || []).filter(b => b.active !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    } else {
      banners = await Banner.find({ active: true }).sort({ order: 1 });
    }
    res.json(banners);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving banners', error: error.message });
  }
});

// @route   GET /api/banners/admin
// @desc    Get all banners including inactive ones (Admin/Staff only)
router.get('/admin', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let banners = [];
    if (isMock) {
      const db = readFallbackData();
      banners = db.banners || [];
    } else {
      banners = await Banner.find().sort({ order: 1 });
    }
    res.json(banners);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving admin banners list', error: error.message });
  }
});

// @route   POST /api/banners
// @desc    Create a promotional banner (Admin/Staff only)
router.post('/', verifyAdminOrStaff, async (req, res) => {
  const { title, imageUrl, link, active, order } = req.body;
  if (!title || !imageUrl) {
    return res.status(400).json({ message: 'Banner title and image URL are required.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      if (!db.banners) db.banners = [];

      const newBanner = {
        _id: 'banner_' + Date.now(),
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        link: link || '/books',
        active: active !== false,
        order: Number(order !== undefined ? order : 0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.banners.push(newBanner);
      writeFallbackData(db);
      res.status(201).json(newBanner);
    } else {
      const newBanner = new Banner({
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        link: link || '/books',
        active: active !== false,
        order: Number(order !== undefined ? order : 0)
      });
      await newBanner.save();
      res.status(201).json(newBanner);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating banner', error: error.message });
  }
});

// @route   PUT /api/banners/:id
// @desc    Update a banner details (Admin/Staff only)
router.put('/:id', verifyAdminOrStaff, async (req, res) => {
  const { title, imageUrl, link, active, order } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.banners.findIndex(b => b._id === req.params.id);
      if (index === -1) return res.status(404).json({ message: 'Banner not found.' });

      db.banners[index] = {
        ...db.banners[index],
        title: title !== undefined ? title.trim() : db.banners[index].title,
        imageUrl: imageUrl !== undefined ? imageUrl.trim() : db.banners[index].imageUrl,
        link: link !== undefined ? link : db.banners[index].link,
        active: active !== undefined ? active === true : db.banners[index].active,
        order: order !== undefined ? Number(order) : db.banners[index].order,
        updatedAt: new Date().toISOString()
      };
      writeFallbackData(db);
      res.json(db.banners[index]);
    } else {
      const updateData = {};
      if (title !== undefined) updateData.title = title.trim();
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl.trim();
      if (link !== undefined) updateData.link = link;
      if (active !== undefined) updateData.active = active;
      if (order !== undefined) updateData.order = Number(order);

      const updated = await Banner.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Banner not found.' });
      res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating banner', error: error.message });
  }
});

// @route   DELETE /api/banners/:id
// @desc    Delete a banner (Admin/Staff only)
router.delete('/:id', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.banners.findIndex(b => b._id === req.params.id);
      if (index === -1) return res.status(404).json({ message: 'Banner not found.' });

      db.banners.splice(index, 1);
      writeFallbackData(db);
      res.json({ message: 'Banner deleted successfully.' });
    } else {
      const deleted = await Banner.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Banner not found.' });
      res.json({ message: 'Banner deleted successfully.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting banner', error: error.message });
  }
});

export default router;
