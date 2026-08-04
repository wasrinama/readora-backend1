import express from 'express';
import { readFallbackData } from '../config/db.js';
import { verifyAdminOrStaff } from '../middleware/auth.js';
import Order from '../models/Order.js';
import Book from '../models/Book.js';

const router = express.Router();

// @route   GET /api/reports/sales
// @desc    Retrieve detailed sales report metrics (Admin/Staff only)
router.get('/sales', verifyAdminOrStaff, async (req, res) => {
  const { startDate, endDate } = req.query;
  const isMock = process.env.USE_MOCK_DB === 'true';

  let start = startDate ? new Date(startDate) : new Date();
  if (!startDate) start.setDate(start.getDate() - 30); // default last 30 days
  start.setHours(0, 0, 0, 0);

  let end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  try {
    let report = {
      totalRevenue: 0,
      ordersCount: 0,
      averageOrderValue: 0,
      cancelledCount: 0,
      pendingCount: 0,
      salesByCategory: {},
      salesByBook: []
    };

    if (isMock) {
      const db = readFallbackData();
      const books = db.books || [];
      const orders = db.orders || [];

      // Filter orders by date range
      const rangeOrders = orders.filter(o => {
        const oDate = new Date(o.createdAt);
        return oDate >= start && oDate <= end;
      });

      // Filter active orders that count as sales
      const saleOrders = rangeOrders.filter(o => 
        ['completed', 'delivered', 'processing', 'shipped'].includes(o.status || o.orderStatus)
      );

      report.ordersCount = saleOrders.length;
      report.cancelledCount = rangeOrders.filter(o => o.status === 'cancelled').length;
      report.pendingCount = rangeOrders.filter(o => o.status === 'pending').length;

      // Sum Revenue
      report.totalRevenue = saleOrders.reduce((sum, o) => sum + Number(o.totalPrice || o.total || 0), 0);
      report.averageOrderValue = report.ordersCount > 0 ? report.totalRevenue / report.ordersCount : 0;

      // Aggregations
      const catMap = {};
      const bookMap = {};

      saleOrders.forEach(order => {
        const items = order.items || [];
        items.forEach(item => {
          const qty = Number(item.quantity || 1);
          const price = Number(item.price || 0);
          const subtotal = qty * price;
          const bookId = item.bookId;

          // Lookup category in db books
          const bookDetail = books.find(b => b._id === bookId);
          const category = bookDetail ? bookDetail.category : 'General';
          const title = item.title || (bookDetail ? bookDetail.title : 'Unknown Book');
          const author = bookDetail ? bookDetail.author : 'Unknown';

          // Category Aggregation
          if (!catMap[category]) {
            catMap[category] = { category, sales: 0, units: 0 };
          }
          catMap[category].sales += subtotal;
          catMap[category].units += qty;

          // Book Aggregation
          if (!bookMap[bookId]) {
            bookMap[bookId] = { bookId, title, author, category, sales: 0, units: 0 };
          }
          bookMap[bookId].sales += subtotal;
          bookMap[bookId].units += qty;
        });
      });

      report.salesByCategory = Object.values(catMap).sort((a, b) => b.sales - a.sales);
      report.salesByBook = Object.values(bookMap).sort((a, b) => b.sales - a.sales);

    } else {
      // MongoDB aggregation queries
      const rangeOrders = await Order.find({
        createdAt: { $gte: start, $lte: end }
      });

      const saleOrders = rangeOrders.filter(o => 
        ['completed', 'delivered', 'processing', 'shipped'].includes(o.status)
      );

      report.ordersCount = saleOrders.length;
      report.cancelledCount = rangeOrders.filter(o => o.status === 'cancelled').length;
      report.pendingCount = rangeOrders.filter(o => o.status === 'pending').length;
      
      report.totalRevenue = saleOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
      report.averageOrderValue = report.ordersCount > 0 ? report.totalRevenue / report.ordersCount : 0;

      // Aggregations
      const catMap = {};
      const bookMap = {};

      for (const order of saleOrders) {
        for (const item of order.items) {
          const qty = Number(item.quantity || 1);
          const price = Number(item.price || 0);
          const subtotal = qty * price;
          const bookId = item.bookId;

          const bookDetail = await Book.findById(bookId);
          const category = bookDetail ? bookDetail.category : 'General';
          const title = item.title || (bookDetail ? bookDetail.title : 'Unknown Book');
          const author = bookDetail ? bookDetail.author : 'Unknown';

          // Category Aggregation
          if (!catMap[category]) {
            catMap[category] = { category, sales: 0, units: 0 };
          }
          catMap[category].sales += subtotal;
          catMap[category].units += qty;

          // Book Aggregation
          if (!bookMap[bookId]) {
            bookMap[bookId] = { bookId, title, author, category, sales: 0, units: 0 };
          }
          bookMap[bookId].sales += subtotal;
          bookMap[bookId].units += qty;
        }
      }

      report.salesByCategory = Object.values(catMap).sort((a, b) => b.sales - a.sales);
      report.salesByBook = Object.values(bookMap).sort((a, b) => b.sales - a.sales);
    }

    res.json(report);

  } catch (error) {
    res.status(500).json({ message: 'Error compiling sales report', error: error.message });
  }
});

export default router;
