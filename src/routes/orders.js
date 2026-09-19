import express from 'express';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import Order from '../models/Order.js';
import { verifyAdmin, verifyAdminOrStaff, verifyToken } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/orders/my-orders
// @desc    Get logged in user's orders
router.get('/my-orders', verifyToken, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  const phone = req.user.phoneNumber;

  try {
    if (isMock) {
      const db = readFallbackData();
      const myOrders = db.orders.filter(o => o.customerPhone === phone)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(myOrders);
    } else {
      const myOrders = await Order.find({ customerPhone: phone }).sort({ createdAt: -1 });
      res.json(myOrders);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving your orders', error: error.message });
  }
});

// @route   PUT /api/orders/:id/cancel
// @desc    Allow customer to cancel their own pending order
router.put('/:id/cancel', verifyToken, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  const phone = req.user.phoneNumber;

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.orders.findIndex(o => o._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Verify order ownership
      if (db.orders[index].customerPhone !== phone) {
        return res.status(403).json({ message: 'Unauthorized to cancel this order.' });
      }
      
      db.orders[index].status = 'cancelled';
      writeFallbackData(db);
      res.json(db.orders[index]);
    } else {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Verify ownership
      if (order.customerPhone !== phone) {
        return res.status(403).json({ message: 'Unauthorized to cancel this order.' });
      }

      order.status = 'cancelled';
      await order.save();
      res.json(order);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling order', error: error.message });
  }
});

// @route   POST /api/orders
// @desc    Record order in database before WhatsApp redirect
router.post('/', async (req, res) => {
  const { customerName, customerPhone, customerAddress, items, totalPrice, paymentMethod } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  if (!customerName || !customerPhone || !customerAddress || !items || !items.length || !totalPrice) {
    return res.status(400).json({ message: 'Missing required order details.' });
  }

  const selectedPaymentMethod = paymentMethod || 'cod';

  try {
    if (isMock) {
      const db = readFallbackData();
      const newOrder = {
        _id: 'order_' + Date.now(),
        customerName,
        customerPhone,
        customerAddress,
        items,
        totalPrice: Number(totalPrice),
        status: 'pending',
        paymentMethod: selectedPaymentMethod,
        paymentStatus: 'unpaid',
        paymentSlip: '',
        createdAt: new Date().toISOString()
      };

      db.orders.push(newOrder);
      writeFallbackData(db);
      res.status(201).json(newOrder);
    } else {
      const newOrder = new Order({
        customerName,
        customerPhone,
        customerAddress,
        items,
        totalPrice,
        paymentMethod: selectedPaymentMethod,
        paymentStatus: 'unpaid',
        paymentSlip: ''
      });

      await newOrder.save();
      res.status(201).json(newOrder);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error logging order', error: error.message });
  }
});

// @route   GET /api/orders
// @desc    Get all orders (Admin/Staff only)
router.get('/', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      // Sort orders descending by date
      const sortedOrders = [...db.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(sortedOrders);
    } else {
      const orders = await Order.find().sort({ createdAt: -1 });
      res.json(orders);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving orders', error: error.message });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status (Admin/Staff only)
router.put('/:id/status', verifyAdminOrStaff, async (req, res) => {
  const { status } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  if (!['pending', 'processing', 'shipped', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' });
  }

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.orders.findIndex(o => o._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Order not found' });
      }
      db.orders[index].status = status;
      writeFallbackData(db);
      res.json(db.orders[index]);
    } else {
      const updatedOrder = await Order.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );
      if (!updatedOrder) {
        return res.status(404).json({ message: 'Order not found' });
      }
      res.json(updatedOrder);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating order status', error: error.message });
  }
});

// @route   PUT /api/orders/:id/upload-slip
// @desc    Upload bank transfer slip (Customer only)
router.put('/:id/upload-slip', verifyToken, async (req, res) => {
  const { paymentSlip } = req.body;
  if (!paymentSlip) {
    return res.status(400).json({ message: 'Please provide a payment slip image/link.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.orders.findIndex(o => o._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Order not found' });
      }
      db.orders[index].paymentSlip = paymentSlip;
      db.orders[index].paymentStatus = 'pending';
      writeFallbackData(db);
      res.json(db.orders[index]);
    } else {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      order.paymentSlip = paymentSlip;
      order.paymentStatus = 'pending';
      await order.save();
      res.json(order);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error uploading payment slip', error: error.message });
  }
});

// @route   PUT /api/orders/:id/verify-payment
// @desc    Verify payment slip status (Admin/Staff only)
router.put('/:id/verify-payment', verifyAdminOrStaff, async (req, res) => {
  const { status } = req.body; // 'paid' or 'unpaid'
  if (!['paid', 'unpaid', 'pending'].includes(status)) {
    return res.status(400).json({ message: 'Invalid payment status.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.orders.findIndex(o => o._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Order not found' });
      }
      db.orders[index].paymentStatus = status;
      writeFallbackData(db);
      res.json(db.orders[index]);
    } else {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      order.paymentStatus = status;
      await order.save();
      res.json(order);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error verifying payment', error: error.message });
  }
});

// @route   GET /api/orders/customer/:phone
// @desc    Get order history for a specific customer (Admin/Staff or owner)
router.get('/customer/:phone', verifyToken, async (req, res) => {
  const targetPhone = req.params.phone.trim().replace(/\s+/g, '');
  const userPhone = req.user.phoneNumber;
  const userRole = req.user.role;

  // Verify permission: admin, staff, super_admin, or the customer themselves
  const isAuthorized = ['admin', 'super_admin', 'staff'].includes(userRole) || userPhone === targetPhone;
  if (!isAuthorized) {
    return res.status(403).json({ message: 'Unauthorized to view these orders.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const customerOrders = (db.orders || [])
        .filter(o => o.customerPhone && o.customerPhone.replace(/\s+/g, '') === targetPhone)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(customerOrders);
    } else {
      const customerOrders = await Order.find({ customerPhone: targetPhone }).sort({ createdAt: -1 });
      res.json(customerOrders);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving customer orders', error: error.message });
  }
});

export default router;

