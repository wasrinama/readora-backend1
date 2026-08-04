import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import orderRoutes from './routes/orders.js';
import settingsRoutes from './routes/settings.js';
import categoryRoutes from './routes/categories.js';
import seoRoutes from './routes/seo.js';
import analyticsRoutes from './routes/analytics.js';
import authorRoutes from './routes/authors.js';
import publisherRoutes from './routes/publishers.js';
import bannerRoutes from './routes/banners.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*', // Allow all origins for testing; can restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma']
}));

// Body parser with increased limit to support base64 image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Basic API check endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Advanced Online Bookstore API',
    status: 'online',
    version: '1.0.2-test-deploy',
    database: process.env.USE_MOCK_DB === 'true' ? 'Fallback JSON DB' : 'MongoDB'
  });
});

// Setup API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/seo', seoRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/authors', authorRoutes);
app.use('/api/publishers', publisherRoutes);
app.use('/api/banners', bannerRoutes);

// Database connection initialization
await connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Base URL: http://localhost:${PORT}`);
});
