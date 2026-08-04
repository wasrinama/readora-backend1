import express from 'express';
import { readFallbackData } from '../config/db.js';
import { verifyAdminOrStaff } from '../middleware/auth.js';
import Book from '../models/Book.js';
import User from '../models/User.js';
import Order from '../models/Order.js';

const router = express.Router();

// @route   GET /api/analytics/dashboard
// @desc    Get real-time dashboard analytics (Admin/Staff only)
router.get('/dashboard', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    let kpis = {
      totalRevenue: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalBooks: 0,
      lowStockAlerts: 0,
      outOfStockAlerts: 0,
      pendingOrdersCount: 0
    };

    let recentOrders = [];
    let recentCustomers = [];
    let bestSellers = [];
    let mostViewed = [];
    let salesChartData = []; // Monthly sales data points

    if (isMock) {
      const db = readFallbackData();
      const books = db.books || [];
      const users = db.users || [];
      const orders = db.orders || [];

      // Calculate KPIs
      kpis.totalBooks = books.length;
      kpis.totalCustomers = users.filter(u => u.role === 'user').length;
      kpis.totalOrders = orders.length;
      kpis.lowStockAlerts = books.filter(b => b.stock <= 5 && b.stock > 0).length;
      kpis.outOfStockAlerts = books.filter(b => b.stock === 0).length;
      kpis.pendingOrdersCount = orders.filter(o => o.status === 'pending').length;

      // Calculate revenue from completed/delivered/processing orders
      const validOrders = orders.filter(o => ['completed', 'delivered', 'processing', 'shipped'].includes(o.status || o.orderStatus));
      kpis.totalRevenue = validOrders.reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);

      // Recent Orders (last 8)
      recentOrders = [...orders]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8);

      // Recent Customers (last 8)
      recentCustomers = [...users]
        .filter(u => u.role === 'user')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8);

      // Most Viewed (last 5)
      mostViewed = [...books]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 5);

      // Best Sellers: aggregate book occurrences in orders
      const bookSales = {};
      validOrders.forEach(order => {
        const items = order.items || order.books || [];
        items.forEach(item => {
          const bookId = item.bookId || (item.book && item.book._id) || item._id;
          const qty = Number(item.quantity || item.qty || 1);
          if (bookId) {
            bookSales[bookId] = (bookSales[bookId] || 0) + qty;
          }
        });
      });

      bestSellers = Object.keys(bookSales)
        .map(bookId => {
          const book = books.find(b => b._id === bookId);
          return {
            book: book || { _id: bookId, title: 'Unknown Book', author: 'Unknown' },
            salesCount: bookSales[bookId]
          };
        })
        .sort((a, b) => b.salesCount - a.salesCount)
        .slice(0, 5);

      // Sales Chart Data (simulate last 6 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthBuckets = {};
      
      // Initialize past 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
        monthBuckets[label] = { label, sales: 0, orders: 0 };
      }

      validOrders.forEach(o => {
        const oDate = new Date(o.createdAt);
        const label = `${monthNames[oDate.getMonth()]} ${oDate.getFullYear().toString().slice(-2)}`;
        if (monthBuckets[label]) {
          monthBuckets[label].sales += Number(o.total || o.totalAmount || 0);
          monthBuckets[label].orders += 1;
        }
      });

      salesChartData = Object.values(monthBuckets);

    } else {
      // MongoDB Real Database queries
      kpis.totalBooks = await Book.countDocuments();
      kpis.totalCustomers = await User.countDocuments({ role: 'user' });
      kpis.totalOrders = await Order.countDocuments();
      kpis.lowStockAlerts = await Book.countDocuments({ stock: { $gt: 0, $lte: 5 } });
      kpis.outOfStockAlerts = await Book.countDocuments({ stock: 0 });
      kpis.pendingOrdersCount = await Order.countDocuments({ status: 'pending' });

      // Calculate revenue
      const revenueResult = await Order.aggregate([
        { $match: { status: { $in: ['completed', 'delivered', 'processing', 'shipped'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      kpis.totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

      // Recent Orders (last 8)
      recentOrders = await Order.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('userId', 'name phoneNumber');

      // Recent Customers (last 8)
      recentCustomers = await User.find({ role: 'user' })
        .sort({ createdAt: -1 })
        .limit(8);

      // Most Viewed (last 5)
      mostViewed = await Book.find()
        .sort({ views: -1 })
        .limit(5);

      // Best Sellers
      const bestSellersAgg = await Order.aggregate([
        { $match: { status: { $in: ['completed', 'delivered', 'processing', 'shipped'] } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.bookId', salesCount: { $sum: '$items.quantity' } } },
        { $sort: { salesCount: -1 } },
        { $limit: 5 }
      ]);

      // Populate best sellers
      bestSellers = await Promise.all(
        bestSellersAgg.map(async (agg) => {
          const book = await Book.findById(agg._id);
          return {
            book: book || { _id: agg._id, title: 'Unknown Book', author: 'Unknown' },
            salesCount: agg.salesCount
          };
        })
      );

      // Sales Chart Data (last 6 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthBuckets = {};
      
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
        monthBuckets[label] = { label, sales: 0, orders: 0 };
      }

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const ordersPastMonths = await Order.find({
        createdAt: { $gte: sixMonthsAgo },
        status: { $in: ['completed', 'delivered', 'processing', 'shipped'] }
      });

      ordersPastMonths.forEach(o => {
        const oDate = new Date(o.createdAt);
        const label = `${monthNames[oDate.getMonth()]} ${oDate.getFullYear().toString().slice(-2)}`;
        if (monthBuckets[label]) {
          monthBuckets[label].sales += o.total || 0;
          monthBuckets[label].orders += 1;
        }
      });

      salesChartData = Object.values(monthBuckets);
    }

    res.json({
      success: true,
      kpis,
      recentOrders,
      recentCustomers,
      bestSellers,
      mostViewed,
      salesChartData
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Analytics aggregation error', error: error.message });
  }
});

export default router;
