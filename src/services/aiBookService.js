/**
 * Verified Database Grounding Service for AI Chatbot
 * Performs safe, sanitized queries against the Readora database (MongoDB & JSON fallback).
 * Filters out archived books and sensitive data.
 */

import { readFallbackData } from '../config/db.js';
import Book from '../models/Book.js';
import Order from '../models/Order.js';
import { slugify } from '../utils/slugify.js';

// Word boundary match helper to prevent false positive substring collisions
function matchesWord(text, word) {
  if (!text || !word) return false;
  const isLatin = /^[a-zA-Z0-9]+$/.test(word);
  if (isLatin) {
    try {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(text);
    } catch {
      return text.toLowerCase().includes(word.toLowerCase());
    }
  }
  return text.includes(word);
}

/**
 * Search active books in Readora catalog matching keyword.
 * Returns top 3 matches with only customer-safe fields.
 */
export async function searchBooksForAI(keyword = '', rawQuery = '') {
  if (!keyword && !rawQuery) return [];

  const cleanKeyword = (keyword || '').trim().toLowerCase();
  const cleanRaw = (rawQuery || '').trim().toLowerCase();
  const isMock = process.env.USE_MOCK_DB === 'true';

  // Detect if the user specifically asked for an author
  const isExplicitAuthorQuery = /\b(author|written\s*by|books?\s*by|eluthiya|rachitha)\b/i.test(cleanRaw);

  try {
    let allBooks = [];

    if (isMock) {
      const db = readFallbackData();
      allBooks = (db.books || []).filter(b => b.status !== 'archived');
    } else {
      // Fetch only active books with essential text fields (skip heavy base64 images)
      allBooks = await Book.find({ status: { $ne: 'archived' } })
        .select('title author publisher category price discount discountPercent availabilityStatus language slug tamilTitle englishTitle sinhalaTitle isbn')
        .lean();
    }

    // Stop words to exclude from token matching
    const STOP_WORDS = new Set([
      'the', 'and', 'for', 'are', 'you', 'how', 'can', 'what', 'who', 'why', 'when',
      'where', 'have', 'has', 'had', 'does', 'did', 'with', 'from', 'this', 'that',
      'some', 'book', 'books', 'any', 'please', 'tell', 'show', 'give', 'about',
      'available', 'stock', 'price', 'cost', 'much', 'want', 'need', 'find', 'author'
    ]);

    // Prepare tokens (words >= 3 chars, not in stop words) from search inputs
    const searchTokens = Array.from(new Set([
      ...cleanKeyword.split(/\s+/),
      ...cleanRaw.split(/\s+/)
    ])).filter(t => t.length >= 3 && !STOP_WORDS.has(t));

    // Score and match books
    const matched = [];

    for (const b of allBooks) {
      const title = (b.title || '').toLowerCase();
      const author = (b.author || '').toLowerCase();
      const publisher = (b.publisher || '').toLowerCase();
      const category = (b.category || '').toLowerCase();
      const isbn = (b.isbn || '').replace(/[\s-]+/g, '').toLowerCase();
      const tamilTitle = (b.tamilTitle || '').toLowerCase();
      const englishTitle = (b.englishTitle || '').toLowerCase();
      const sinhalaTitle = (b.sinhalaTitle || '').toLowerCase();
      const rawQueryIsbn = cleanKeyword.replace(/[\s-]+/g, '');

      // If user specifically asked for an author, require author to match
      if (isExplicitAuthorQuery) {
        const matchesAuthor = cleanKeyword && (
          author === cleanKeyword || 
          matchesWord(author, cleanKeyword) ||
          searchTokens.some(tok => matchesWord(author, tok))
        );

        if (!matchesAuthor) {
          continue; // Skip books by other authors completely
        }

        let authorScore = 80;
        if (author === cleanKeyword) authorScore += 20;
        matched.push({
          book: {
            title: b.title,
            author: b.author,
            publisher: b.publisher || 'ReadAura Sourcing',
            category: b.category,
            language: b.language || 'English',
            price: b.price,
            discount: b.discount || 0,
            discountPercent: b.discountPercent || 0,
            availabilityStatus: b.availabilityStatus || (b.stock > 0 ? 'In Stock' : 'Out of Stock'),
            slug: b.slug || slugify(b.title)
          },
          score: authorScore
        });
        continue;
      }

      let score = 0;

      // 1. Exact matches
      if (cleanKeyword && (title === cleanKeyword || tamilTitle === cleanKeyword || sinhalaTitle === cleanKeyword)) {
        score += 100;
      } else if (rawQueryIsbn && isbn === rawQueryIsbn) {
        score += 90;
      } else if (cleanKeyword && author === cleanKeyword) {
        score += 85;
      } else if (cleanKeyword && publisher === cleanKeyword) {
        score += 70;
      }
      // 2. Word boundary containment
      else if (cleanKeyword && (matchesWord(title, cleanKeyword) || matchesWord(tamilTitle, cleanKeyword) || matchesWord(sinhalaTitle, cleanKeyword) || matchesWord(englishTitle, cleanKeyword))) {
        score += 65;
      } else if (title.length >= 4 && (cleanKeyword.includes(title) || cleanRaw.includes(title))) {
        score += 60;
      } else if (cleanKeyword && matchesWord(author, cleanKeyword)) {
        score += 55;
      } else if (cleanKeyword && matchesWord(publisher, cleanKeyword)) {
        score += 40;
      } else if (cleanKeyword && matchesWord(category, cleanKeyword)) {
        score += 30;
      } else if (rawQueryIsbn.length >= 4 && isbn.includes(rawQueryIsbn)) {
        score += 40;
      }

      // 3. Token-based matching with word boundaries
      for (const token of searchTokens) {
        if (matchesWord(title, token) || matchesWord(tamilTitle, token) || matchesWord(sinhalaTitle, token) || matchesWord(englishTitle, token)) {
          score += 25;
        }
        if (matchesWord(author, token)) {
          score += 15;
        }
        if (matchesWord(publisher, token)) {
          score += 10;
        }
        if (matchesWord(category, token)) {
          score += 8;
        }
      }

      if (score > 0) {
        matched.push({
          book: {
            title: b.title,
            author: b.author,
            publisher: b.publisher || 'ReadAura Sourcing',
            category: b.category,
            language: b.language || 'English',
            price: b.price,
            discount: b.discount || 0,
            discountPercent: b.discountPercent || 0,
            availabilityStatus: b.availabilityStatus || (b.stock > 0 ? 'In Stock' : 'Out of Stock'),
            slug: b.slug || slugify(b.title)
          },
          score
        });
      }
    }

    // Sort by score descending
    matched.sort((a, b) => b.score - a.score);

    // If top match has a high score (>= 70), filter out weak incidental matches (< 50 or < 70% of top score)
    const topScore = matched.length > 0 ? matched[0].score : 0;
    const filtered = matched.filter(m => {
      if (topScore >= 70) {
        return m.score >= Math.max(50, topScore * 0.7);
      }
      return m.score >= 25;
    });

    return filtered.slice(0, 3).map(m => m.book);
  } catch (err) {
    console.error('[AI Book Search Error]:', err.message);
    return [];
  }
}

/**
 * Fetch verified orders for the authenticated customer using their phone number.
 * Returns up to 3 most recent orders with customer-safe fields.
 */
export async function getCustomerOrdersForAI(customerPhone = '') {
  if (!customerPhone || !customerPhone.trim()) return [];

  const phone = customerPhone.trim();
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    let orders = [];

    if (isMock) {
      const db = readFallbackData();
      orders = (db.orders || [])
        .filter(o => o.customerPhone === phone)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      orders = await Order.find({ customerPhone: phone })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();
    }

    return orders.slice(0, 3).map(o => ({
      orderId: o._id,
      date: o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB') : 'Recent',
      status: o.status,
      paymentMethod: o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Bank Transfer',
      paymentStatus: o.paymentStatus,
      totalPrice: o.totalPrice,
      items: (o.items || []).map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price
      }))
    }));
  } catch (err) {
    console.error('[AI Order Search Error]:', err.message);
    return [];
  }
}
