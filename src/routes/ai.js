import express from 'express';
import jwt from 'jsonwebtoken';
import { aiRateLimiter } from '../middleware/rateLimiter.js';
import { 
  detectLanguage, 
  isOutOfDomain, 
  getOutOfDomainResponse, 
  getFastPathResponse, 
  extractSearchKeyword 
} from '../services/aiIntentService.js';
import { searchBooksForAI, getCustomerOrdersForAI } from '../services/aiBookService.js';
import { callGeminiApi, isGeminiConfigured } from '../config/gemini.js';
import { readFallbackData } from '../config/db.js';
import User from '../models/User.js';

const router = express.Router();

/**
 * Optional user authentication middleware.
 * Attaches req.user if a valid Bearer token is provided, without blocking guests.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || 'bookstore_super_secret_key';

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const isMock = process.env.USE_MOCK_DB === 'true';

    if (isMock) {
      const db = readFallbackData();
      const foundUser = (db.users || []).find(u => u._id === decoded.id || u.phoneNumber === decoded.phoneNumber);
      req.user = foundUser || decoded;
    } else {
      const foundUser = await User.findById(decoded.id).select('-password');
      req.user = foundUser || decoded;
    }
  } catch (err) {
    req.user = null; // Invalid token; treat as guest
  }

  next();
};

// @route   POST /api/ai/chat
// @desc    Production-ready domain-restricted AI chatbot endpoint
// @access  Public (Rate limited)
router.post('/chat', aiRateLimiter, optionalAuth, async (req, res) => {
  const { message, conversationHistory = [] } = req.body;

  // 1. Input Validation
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid question or message.'
    });
  }

  const userMessage = message.trim();
  if (userMessage.length > 300) {
    return res.status(400).json({
      success: false,
      message: 'Message is too long. Please keep your question under 300 characters.'
    });
  }

  // 2. Language Detection
  const lang = detectLanguage(userMessage);

  // 3. Strict Domain Restriction Gate (0 Gemini API calls)
  if (isOutOfDomain(userMessage)) {
    return res.json({
      success: true,
      source: 'domain_filter',
      message: getOutOfDomainResponse(lang),
      data: null
    });
  }

  // 4. Deterministic Fast-Path FAQ Gate (0 Gemini API calls)
  const fastPathResponse = getFastPathResponse(userMessage, lang, req.user);
  if (fastPathResponse) {
    return res.json({
      success: true,
      source: 'fast_path',
      message: fastPathResponse,
      data: null
    });
  }

  // 5. Order Status Check for Authenticated Customer
  const isOrderQuery = /\b(my\s*order|track\s*order|order\s*status|orders)\b/i.test(userMessage);
  if (isOrderQuery && req.user) {
    const orders = await getCustomerOrdersForAI(req.user.phoneNumber);
    if (!orders || orders.length === 0) {
      const noOrdersMsg = lang === 'ta'
        ? 'உங்கள் கணக்கில் தற்போது எந்த ஆர்டர்களும் இல்லை.'
        : lang === 'si'
        ? 'ඔබගේ ගිණුමේ දැනට ඇණවුම් කිසිවක් නැත.'
        : 'You do not have any recent orders listed under your account.';
      return res.json({
        success: true,
        source: 'database_orders',
        message: noOrdersMsg,
        data: []
      });
    }

    // Format verified order context
    const orderContext = orders.map((o, idx) => 
      `Order #${idx + 1}: ID ${o.orderId}, Placed: ${o.date}, Status: ${o.status.toUpperCase()}, Total: Rs. ${o.totalPrice}, Items: ${o.items.map(i => `${i.title} (x${i.quantity})`).join(', ')}`
    ).join('\n');

    // If Gemini is configured, summarize naturally; otherwise use clean template
    if (isGeminiConfigured()) {
      const systemPrompt = `You are Readora Assistant. Summarize the customer's verified orders accurately in their language (${lang}). Do not invent any order details. Keep it friendly and concise (max 3 sentences).`;
      const aiResult = await callGeminiApi({
        systemPrompt,
        userMessage,
        contextData: orderContext,
        conversationHistory
      });

      if (aiResult.success && aiResult.text) {
        return res.json({
          success: true,
          source: 'ai_grounded_orders',
          message: aiResult.text,
          data: orders
        });
      }
    }

    // Fallback template for orders
    const summary = orders.map(o => 
      `📦 Order ID: ${o.orderId}\nStatus: ${o.status.toUpperCase()}\nItems: ${o.items.map(i => `${i.title} (${i.quantity})`).join(', ')}\nTotal: Rs. ${o.totalPrice}`
    ).join('\n\n');

    return res.json({
      success: true,
      source: 'database_orders_template',
      message: `Here are your recent orders from ReadAura (readaura.lk):\n\n${summary}`,
      data: orders
    });
  }

  // 6. Book Search & Availability Check
  const searchKeyword = extractSearchKeyword(userMessage) || userMessage;
  const matchedBooks = await searchBooksForAI(searchKeyword, userMessage);

  // If no books match and user was asking for a book
  if (matchedBooks.length === 0) {
    const notFoundMsg = lang === 'ta'
      ? `மன்னிக்கவும், "${searchKeyword}" தொடர்பான புத்தகங்கள் ReadAura (readaura.lk)-வில் கிடைக்கவில்லை.`
      : lang === 'si'
      ? `සමාවෙන්න, "${searchKeyword}" සඳහා පොත් ReadAura (readaura.lk) හි හමු නොවීය.`
      : `Sorry, I couldn't find any books matching "${searchKeyword}" in the ReadAura catalog.`;

    return res.json({
      success: true,
      source: 'database_empty',
      message: notFoundMsg,
      data: []
    });
  }

  // Format verified book context
  const bookContext = matchedBooks.map((b, idx) => 
    `Book #${idx + 1}: "${b.title}" by ${b.author} | Price: Rs. ${b.price} (Discount: Rs. ${b.discount || 0}) | Status: ${b.availabilityStatus} | Language: ${b.language} | Category: ${b.category} | Link: /books/${b.slug}`
  ).join('\n');

  // 7. Call Gemini for Natural Language Synthesis if Configured
  if (isGeminiConfigured()) {
    const systemPrompt = `You are ReadAura Assistant, the customer assistant for the ReadAura online bookstore (readaura.lk) in Sri Lanka.
Rules:
1. Answer ONLY using the Verified ReadAura Database Context provided.
2. If the user asks about availability or price, state the exact price (Rs.) and availability from the context.
3. If a book has a discount, mention it.
4. Respond in the customer's language (${lang}).
5. Keep your answer concise, polite, and directly helpful (maximum 3 sentences).
6. Do not invent any books, prices, or authors not in the context.`;

    const aiResult = await callGeminiApi({
      systemPrompt,
      userMessage,
      contextData: bookContext,
      conversationHistory
    });

    if (aiResult.success && aiResult.text) {
      return res.json({
        success: true,
        source: 'ai_grounded_books',
        message: aiResult.text,
        data: matchedBooks
      });
    }
  }

  // Fallback Template if Gemini is unavailable or not configured
  const bookCards = matchedBooks.map(b => {
    const discInfo = b.discount > 0 ? ` (Discount: Rs. ${b.discount} OFF)` : '';
    return `📚 "${b.title}" by ${b.author}\n• Price: Rs. ${b.price}${discInfo}\n• Status: ${b.availabilityStatus}\n• Language: ${b.language}`;
  }).join('\n\n');

  return res.json({
    success: true,
    source: 'database_books_template',
    message: `Here is what I found in ReadAura (readaura.lk):\n\n${bookCards}\n\nYou can click on any title to view details and add it to your cart!`,
    data: matchedBooks
  });
});

export default router;
