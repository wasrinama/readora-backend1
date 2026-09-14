import express from 'express';
import jwt from 'jsonwebtoken';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import User from '../models/User.js';
import { verifyToken, verifyAdmin, verifyAdminOrStaff } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bookstore_super_secret_key';

// @route   POST /api/auth/login
// @desc    Phone number or static/database-backed admin/staff login
router.post('/login', async (req, res) => {
  const { phoneNumber, name, username, password } = req.body;
  const { verifyPassword } = await import('../utils/crypto.js');

  // Username/Password authentication (Admin Panel login)
  if (username && password) {
    const isMock = process.env.USE_MOCK_DB === 'true';
    const adminPhone = (process.env.ADMIN_PHONE || '0774454785').trim().replace(/\s+/g, '');
    let user;

    try {
      if (isMock) {
        const db = readFallbackData();
        // Check if there is a database user matching username
        user = db.users.find(u => u.username === username);
        
        if (user) {
          if (user.status === 'blocked') {
            return res.status(403).json({ message: 'This account has been blocked.' });
          }
          const isPasswordValid = verifyPassword(password, user.password);
          if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials.' });
          }
        } else if (username === 'Meyaw' && password === 'Meyaw10607$') {
          // Bootstrap static admin check
          user = db.users.find(u => u.role === 'super_admin' || u.role === 'admin' || u.phoneNumber === adminPhone);
          if (!user) {
            user = {
              _id: 'user_admin',
              phoneNumber: adminPhone,
              name: 'Sysadmin',
              address: 'Head Office',
              role: 'super_admin',
              username: 'Meyaw',
              status: 'active'
            };
            db.users.push(user);
            writeFallbackData(db);
          }
        } else {
          return res.status(401).json({ message: 'Invalid credentials.' });
        }
      } else {
        // Query MongoDB
        user = await User.findOne({ username });

        if (user) {
          if (user.status === 'blocked') {
            return res.status(403).json({ message: 'This account has been blocked.' });
          }
          const isPasswordValid = verifyPassword(password, user.password);
          if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials.' });
          }
        } else if (username === 'Meyaw' && password === 'Meyaw10607$') {
          // Bootstrap static admin check
          user = await User.findOne({ role: 'super_admin' }) || await User.findOne({ role: 'admin' });
          if (!user) {
            user = new User({
              phoneNumber: adminPhone,
              name: 'Sysadmin',
              role: 'super_admin',
              address: 'Head Office',
              username: 'Meyaw',
              status: 'active'
            });
            // We store a hashed password for bootstrap so they can update it
            const { hashPassword } = await import('../utils/crypto.js');
            user.password = hashPassword('Meyaw10607$');
            await user.save();
          }
        } else {
          return res.status(401).json({ message: 'Invalid credentials.' });
        }
      }

      // Sign Token
      const payload = {
        id: user._id || user.id,
        phoneNumber: user.phoneNumber,
        role: user.role
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

      return res.json({
        token,
        user: {
          id: user._id || user.id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          address: user.address || '',
          role: user.role,
          username: user.username || ''
        }
      });
    } catch (error) {
      return res.status(500).json({ message: 'Admin login error', error: error.message });
    }
  }

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Phone number is required.' });
  }

  // Normalize phone number (remove spaces, etc.)
  const normalizedPhone = phoneNumber.trim().replace(/\s+/g, '');

  // Check if phone matches configured admin number (normalizing prefix formats)
  const isAdmin = (phone) => {
    const adminEnv = (process.env.ADMIN_PHONE || '0774454785').trim().replace(/\s+/g, '');
    const cleanPhone = phone.replace(/^\+94/, '0');
    const cleanAdmin = adminEnv.replace(/^\+94/, '0');
    return cleanPhone === cleanAdmin;
  };

  try {
    let user;
    const isMock = process.env.USE_MOCK_DB === 'true';

    if (isMock) {
      const db = readFallbackData();
      user = db.users.find(u => u.phoneNumber === normalizedPhone);
      
      if (user && user.status === 'blocked') {
        return res.status(403).json({ message: 'This account has been blocked.' });
      }

      if (!user) {
        // Create user
        user = {
          _id: 'user_' + Date.now(),
          phoneNumber: normalizedPhone,
          name: name ? name.trim() : `Customer (${normalizedPhone.slice(-4)})`,
          address: '',
          role: isAdmin(normalizedPhone) ? 'admin' : 'user',
          status: 'active'
        };
        db.users.push(user);
        writeFallbackData(db);
      } else if (name) {
        // Update name if supplied
        user.name = name.trim();
        writeFallbackData(db);
      }
    } else {
      user = await User.findOne({ phoneNumber: normalizedPhone });

      if (user && user.status === 'blocked') {
        return res.status(403).json({ message: 'This account has been blocked.' });
      }

      if (!user) {
        const role = isAdmin(normalizedPhone) ? 'admin' : 'user';
        user = new User({
          phoneNumber: normalizedPhone,
          name: name ? name.trim() : `Customer (${normalizedPhone.slice(-4)})`,
          role,
          status: 'active'
        });
        await user.save();
      } else if (name) {
        user.name = name.trim();
        await user.save();
      }
    }

    // Sign Token
    const payload = {
      id: user._id,
      phoneNumber: user.phoneNumber,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        address: user.address || '',
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Login error', error: error.message });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
router.get('/me', verifyToken, async (req, res) => {
  res.json({
    user: {
      id: req.user._id || req.user.id,
      name: req.user.name,
      phoneNumber: req.user.phoneNumber,
      address: req.user.address || '',
      role: req.user.role
    }
  });
});

// @route   PUT /api/auth/profile
// @desc    Update user profile details
router.put('/profile', verifyToken, async (req, res) => {
  const { name, address } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';
  const userId = req.user._id || req.user.id;

  try {
    if (isMock) {
      const db = readFallbackData();
      const userIndex = db.users.findIndex(u => u._id === userId);
      if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found.' });
      }
      
      if (name) db.users[userIndex].name = name;
      if (address !== undefined) db.users[userIndex].address = address;
      
      const updatedUser = db.users[userIndex];
      writeFallbackData(db);
      
      res.json({
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          phoneNumber: updatedUser.phoneNumber,
          address: updatedUser.address || '',
          role: updatedUser.role
        }
      });
    } else {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      if (name) user.name = name;
      if (address !== undefined) user.address = address;

      await user.save();
      
      res.json({
        user: {
          id: user._id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          address: user.address || '',
          role: user.role
        }
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
});

// @route   GET /api/auth/users
// @desc    Get all registered users/customers (Admin/Staff only)
router.get('/users', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    if (isMock) {
      const db = readFallbackData();
      const usersList = (db.users || []).map(u => ({
        id: u._id || u.id,
        _id: u._id || u.id,
        name: u.name,
        phoneNumber: u.phoneNumber,
        address: u.address || '',
        role: u.role || 'user',
        status: u.status || 'active',
        createdAt: u.createdAt || new Date().toISOString()
      }));
      res.json(usersList);
    } else {
      const users = await User.find().sort({ createdAt: -1 });
      res.json(users);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving users list', error: error.message });
  }
});

// @route   PUT /api/auth/users/:id/status
// @desc    Toggle user status active/blocked (Admin/Staff only)
router.put('/users/:id/status', verifyAdminOrStaff, async (req, res) => {
  const { status } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';
  const targetId = req.params.id;

  if (!['active', 'blocked'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.users.findIndex(u => u._id === targetId || u.id === targetId);
      if (index === -1) return res.status(404).json({ message: 'User not found.' });

      db.users[index].status = status;
      writeFallbackData(db);
      res.json({ success: true, user: db.users[index] });
    } else {
      const user = await User.findById(targetId);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      user.status = status;
      await user.save();
      res.json({ success: true, user });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating user status', error: error.message });
  }
});

// @route   PUT /api/auth/users/:id/role
// @desc    Update user authorization role (Admin only)
router.put('/users/:id/role', verifyAdmin, async (req, res) => {
  const { role } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';
  const targetId = req.params.id;

  if (!['super_admin', 'admin', 'staff', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role value.' });
  }

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.users.findIndex(u => u._id === targetId || u.id === targetId);
      if (index === -1) return res.status(404).json({ message: 'User not found.' });

      db.users[index].role = role;
      writeFallbackData(db);
      res.json({ success: true, user: db.users[index] });
    } else {
      const user = await User.findById(targetId);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      user.role = role;
      await user.save();
      res.json({ success: true, user });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating user authorization role', error: error.message });
  }
});

export default router;
