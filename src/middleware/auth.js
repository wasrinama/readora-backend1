import jwt from 'jsonwebtoken';
import { readFallbackData } from '../config/db.js';
import User from '../models/User.js';

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access Denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'bookstore_super_secret_key';
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }

    if (process.env.USE_MOCK_DB === 'true') {
      const db = readFallbackData();
      const user = db.users.find(u => u._id === decoded.id || u.phoneNumber === decoded.phoneNumber);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }
      req.user = user;
    } else {
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }
      req.user = user;
    }
    
    next();
  } catch (error) {
    res.status(500).json({ message: 'Authentication server error', error: error.message });
  }
};

export const verifyAdmin = (req, res, next) => {
  // In mock DB mode allow a relaxed admin flow to ease local/offline development:
  const isMock = process.env.USE_MOCK_DB === 'true';
  const authHeader = req.headers.authorization;

  const tryAssignAdminFromFallback = () => {
    if (!isMock) return false;
    try {
      const db = readFallbackData();
      const admin = db.users.find(u => u.role === 'admin' || u.role === 'super_admin') || db.users[0];
      if (admin) {
        req.user = admin;
        return true;
      }
    } catch (err) {}
    return false;
  };

  if (isMock) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const jwtSecret = process.env.JWT_SECRET || 'bookstore_super_secret_key';
      try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        if (req.user.role === 'admin' || req.user.role === 'super_admin') return next();
      } catch (err) {
        if (tryAssignAdminFromFallback()) return next();
      }
    } else {
      if (tryAssignAdminFromFallback()) return next();
    }
    return res.status(403).json({ message: 'Forbidden. Admin credentials required.' });
  }

  // Non-mock flow
  verifyToken(req, res, () => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      next();
    } else {
      res.status(403).json({ message: 'Forbidden. Admin credentials required.' });
    }
  });
};

export const verifySuperAdmin = (req, res, next) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  const authHeader = req.headers.authorization;

  const tryAssignSuperFromFallback = () => {
    if (!isMock) return false;
    try {
      const db = readFallbackData();
      const superAdmin = db.users.find(u => u.role === 'super_admin') || db.users.find(u => u.role === 'admin') || db.users[0];
      if (superAdmin) {
        req.user = superAdmin;
        return true;
      }
    } catch (err) {}
    return false;
  };

  if (isMock) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const jwtSecret = process.env.JWT_SECRET || 'bookstore_super_secret_key';
      try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        if (req.user.role === 'super_admin') return next();
      } catch (err) {
        if (tryAssignSuperFromFallback()) return next();
      }
    } else {
      if (tryAssignSuperFromFallback()) return next();
    }
    return res.status(403).json({ message: 'Forbidden. Super Admin credentials required.' });
  }

  verifyToken(req, res, () => {
    if (req.user && req.user.role === 'super_admin') {
      next();
    } else {
      res.status(403).json({ message: 'Forbidden. Super Admin credentials required.' });
    }
  });
};

export const verifyAdminOrStaff = (req, res, next) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  const authHeader = req.headers.authorization;

  const tryAssignStaffFromFallback = () => {
    if (!isMock) return false;
    try {
      const db = readFallbackData();
      const staffUser = db.users.find(u => ['super_admin', 'admin', 'staff'].includes(u.role)) || db.users[0];
      if (staffUser) {
        req.user = staffUser;
        return true;
      }
    } catch (err) {}
    return false;
  };

  if (isMock) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const jwtSecret = process.env.JWT_SECRET || 'bookstore_super_secret_key';
      try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        if (['super_admin', 'admin', 'staff'].includes(req.user.role)) return next();
      } catch (err) {
        if (tryAssignStaffFromFallback()) return next();
      }
    } else {
      if (tryAssignStaffFromFallback()) return next();
    }
    return res.status(403).json({ message: 'Forbidden. Admin or Staff credentials required.' });
  }

  verifyToken(req, res, () => {
    if (req.user && ['super_admin', 'admin', 'staff'].includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ message: 'Forbidden. Admin or Staff credentials required.' });
    }
  });
};
