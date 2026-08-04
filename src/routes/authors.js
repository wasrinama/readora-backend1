import express from 'express';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import Author from '../models/Author.js';
import { verifyAdminOrStaff } from '../middleware/auth.js';
import { slugify } from '../utils/slugify.js';

const router = express.Router();

// @route   GET /api/authors
// @desc    Get all authors
router.get('/', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let authors = [];
    if (isMock) {
      const db = readFallbackData();
      authors = db.authors || [];
    } else {
      authors = await Author.find().sort({ name: 1 });
    }
    res.json(authors);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving authors', error: error.message });
  }
});

// @route   POST /api/authors
// @desc    Create an author (Admin/Staff only)
router.post('/', verifyAdminOrStaff, async (req, res) => {
  const { name, bio, image } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Author name is required.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';
  const slug = slugify(name);

  try {
    if (isMock) {
      const db = readFallbackData();
      if (!db.authors) db.authors = [];

      const exists = db.authors.some(a => a.name.toLowerCase() === name.trim().toLowerCase());
      if (exists) return res.status(400).json({ message: 'Author already exists.' });

      const newAuthor = {
        _id: 'auth_' + Date.now(),
        name: name.trim(),
        bio: bio || '',
        image: image || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        slug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.authors.push(newAuthor);
      writeFallbackData(db);
      res.status(201).json(newAuthor);
    } else {
      const exists = await Author.findOne({ name: name.trim() });
      if (exists) return res.status(400).json({ message: 'Author already exists.' });

      const newAuthor = new Author({
        name: name.trim(),
        bio,
        image,
        slug
      });
      await newAuthor.save();
      res.status(201).json(newAuthor);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating author', error: error.message });
  }
});

// @route   PUT /api/authors/:id
// @desc    Update an author (Admin/Staff only)
router.put('/:id', verifyAdminOrStaff, async (req, res) => {
  const { name, bio, image } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.authors.findIndex(a => a._id === req.params.id);
      if (index === -1) return res.status(404).json({ message: 'Author not found.' });

      db.authors[index] = {
        ...db.authors[index],
        name: name !== undefined ? name.trim() : db.authors[index].name,
        bio: bio !== undefined ? bio : db.authors[index].bio,
        image: image !== undefined ? image : db.authors[index].image,
        slug: name !== undefined ? slugify(name) : db.authors[index].slug,
        updatedAt: new Date().toISOString()
      };
      writeFallbackData(db);
      res.json(db.authors[index]);
    } else {
      const updateData = {};
      if (name !== undefined) {
        updateData.name = name.trim();
        updateData.slug = slugify(name);
      }
      if (bio !== undefined) updateData.bio = bio;
      if (image !== undefined) updateData.image = image;

      const updated = await Author.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Author not found.' });
      res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating author', error: error.message });
  }
});

// @route   DELETE /api/authors/:id
// @desc    Delete an author (Admin/Staff only)
router.delete('/:id', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.authors.findIndex(a => a._id === req.params.id);
      if (index === -1) return res.status(404).json({ message: 'Author not found.' });

      db.authors.splice(index, 1);
      writeFallbackData(db);
      res.json({ message: 'Author deleted successfully.' });
    } else {
      const deleted = await Author.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Author not found.' });
      res.json({ message: 'Author deleted successfully.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting author', error: error.message });
  }
});

export default router;
