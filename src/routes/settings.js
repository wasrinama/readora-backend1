import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import Setting from '../models/Setting.js';
import Book from '../models/Book.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Category from '../models/Category.js';
import Author from '../models/Author.js';
import Publisher from '../models/Publisher.js';
import Banner from '../models/Banner.js';
import StockLog from '../models/StockLog.js';
import { verifyAdmin, verifyAdminOrStaff } from '../middleware/auth.js';
import { memoryCache } from '../utils/cache.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupsDir = path.join(__dirname, '../../backups');

// Ensure backups directory exists
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// @route   GET /api/settings
// @desc    Get all settings as a key-value object (Cached in memory)
router.get('/', async (req, res) => {
  const cacheKey = 'settings:all';
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(cached);
  }

  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    if (isMock) {
      const db = readFallbackData();
      const settingsMap = {};
      (db.settings || []).forEach(s => {
        settingsMap[s.key] = s.value;
      });
      memoryCache.set(cacheKey, settingsMap, 600);
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(settingsMap);
    } else {
      const settings = await Setting.find().lean();
      const settingsMap = {};
      settings.forEach(s => {
        settingsMap[s.key] = s.value;
      });
      memoryCache.set(cacheKey, settingsMap, 600);
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(settingsMap);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving settings', error: error.message });
  }
});

// @route   GET /api/settings/:key
// @desc    Get setting by key (Cached in memory)
router.get('/:key', async (req, res) => {
  const { key } = req.params;
  const cacheKey = `setting:${key}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(cached);
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      if (!db.settings) db.settings = [];
      const setting = db.settings.find(s => s.key === key);
      if (!setting) {
        return res.status(404).json({ message: 'Setting not found' });
      }
      memoryCache.set(cacheKey, setting, 600);
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(setting);
    } else {
      const setting = await Setting.findOne({ key }).lean();
      if (!setting) {
        return res.status(404).json({ message: 'Setting not found' });
      }
      memoryCache.set(cacheKey, setting, 600);
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(setting);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving setting', error: error.message });
  }
});

// @route   POST /api/settings
// @desc    Create or update a setting (Admin/Staff only)
router.post('/', verifyAdminOrStaff, async (req, res) => {
  const { key, value } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  if (!key || value === undefined) {
    return res.status(400).json({ message: 'Missing key or value.' });
  }

  try {
    memoryCache.invalidatePrefix('setting');
    if (isMock) {
      const db = readFallbackData();
      if (!db.settings) db.settings = [];
      const index = db.settings.findIndex(s => s.key === key);

      const updatedSetting = {
        _id: index !== -1 ? db.settings[index]._id : 'setting_' + Date.now(),
        key,
        value,
        createdAt: index !== -1 ? db.settings[index].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (index !== -1) {
        db.settings[index] = updatedSetting;
      } else {
        db.settings.push(updatedSetting);
      }

      writeFallbackData(db);
      return res.status(200).json(updatedSetting);
    } else {
      const updatedSetting = await Setting.findOneAndUpdate(
        { key },
        { value },
        { new: true, upsert: true, runValidators: true }
      );
      return res.status(200).json(updatedSetting);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error saving setting', error: error.message });
  }
});

// @route   POST /api/settings/backup
// @desc    Trigger database backup (Admin only)
router.post('/backup', verifyAdmin, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${timestamp}.json`;
  const filePath = path.join(backupsDir, filename);

  try {
    let backupData = {};

    if (isMock) {
      const db = readFallbackData();
      backupData = {
        type: 'fallback_json',
        data: db
      };
    } else {
      // Export all MongoDB collections
      const books = await Book.find();
      const users = await User.find();
      const orders = await Order.find();
      const categories = await Category.find();
      const settings = await Setting.find();
      const authors = await Author.find();
      const publishers = await Publisher.find();
      const banners = await Banner.find();
      const stockLogs = await StockLog.find();

      backupData = {
        type: 'mongodb',
        data: {
          books,
          users,
          orders,
          categories,
          settings,
          authors,
          publishers,
          banners,
          stockLogs
        }
      };
    }

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

    res.status(201).json({
      success: true,
      message: `Database backup "${filename}" created successfully.`,
      filename,
      size: fs.statSync(filePath).size
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Backup execution failed', error: error.message });
  }
});

// @route   GET /api/settings/backups
// @desc    List all database backups (Admin only)
router.get('/backups', verifyAdmin, async (req, res) => {
  try {
    const files = fs.readdirSync(backupsDir);
    const backups = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(backupsDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    res.json(backups);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list backups', error: error.message });
  }
});

// @route   POST /api/settings/backups/:filename/restore
// @desc    Restore database from backup file (Admin only)
router.post('/backups/:filename/restore', verifyAdmin, async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(backupsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Backup file not found.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const backup = JSON.parse(raw);

    if (isMock) {
      // Restore fallback JSON
      if (backup.type !== 'fallback_json') {
        return res.status(400).json({ message: 'Invalid backup type. Cannot restore MongoDB backup to Fallback DB.' });
      }
      writeFallbackData(backup.data);
    } else {
      // Restore MongoDB collections
      if (backup.type !== 'mongodb') {
        return res.status(400).json({ message: 'Invalid backup type. Cannot restore Fallback DB backup to MongoDB.' });
      }

      const { data } = backup;

      // Clear existing records
      await Book.deleteMany({});
      await User.deleteMany({});
      await Order.deleteMany({});
      await Category.deleteMany({});
      await Setting.deleteMany({});
      await Author.deleteMany({});
      await Publisher.deleteMany({});
      await Banner.deleteMany({});
      await StockLog.deleteMany({});

      // Re-populate from backup arrays
      if (Array.isArray(data.books)) await Book.insertMany(data.books);
      if (Array.isArray(data.users)) await User.insertMany(data.users);
      if (Array.isArray(data.orders)) await Order.insertMany(data.orders);
      if (Array.isArray(data.categories)) await Category.insertMany(data.categories);
      if (Array.isArray(data.settings)) await Setting.insertMany(data.settings);
      if (Array.isArray(data.authors)) await Author.insertMany(data.authors);
      if (Array.isArray(data.publishers)) await Publisher.insertMany(data.publishers);
      if (Array.isArray(data.banners)) await Banner.insertMany(data.banners);
      if (Array.isArray(data.stockLogs)) await StockLog.insertMany(data.stockLogs);
    }

    res.json({ success: true, message: `Database successfully restored from backup "${filename}".` });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Restore execution failed', error: error.message });
  }
});

// @route   DELETE /api/settings/backups/:filename
// @desc    Delete a database backup file (Admin only)
router.delete('/backups/:filename', verifyAdmin, async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(backupsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Backup file not found.' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Backup file deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete backup file', error: error.message });
  }
});

export default router;
