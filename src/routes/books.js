import express from 'express';
import { readFallbackData, writeFallbackData } from '../config/db.js';
import Book from '../models/Book.js';
import StockLog from '../models/StockLog.js';
import { verifyAdmin, verifyAdminOrStaff } from '../middleware/auth.js';
import { slugify } from '../utils/slugify.js';

const router = express.Router();

const addDynamicSlug = (book) => {
  if (!book) return book;
  const bookObj = book.toObject ? book.toObject() : book;
  if (!bookObj.slug) {
    bookObj.slug = slugify(bookObj.title);
  }
  return bookObj;
};


// Transliteration maps for Thanglish/Tamil/Sinhala phonetic conversion
const independentVowels = {
  // Tamil
  'அ': 'a', 'ஆ': 'aa', 'இ': 'i', 'ஈ': 'ee', 'உ': 'u', 'ஊ': 'oo',
  'எ': 'e', 'ஏ': 'ae', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'oo', 'ஔ': 'au',
  'ஃ': 'h',
  // Sinhala
  'අ': 'a', 'ආ': 'aa', 'ඇ': 'ae', 'ඈ': 'aae', 'ඉ': 'i', 'ඊ': 'ee',
  'උ': 'u', 'ඌ': 'oo', 'එ': 'e', 'ඒ': 'ae', 'ඔ': 'o', 'ඕ': 'oo'
};

const consonants = {
  // Tamil
  'க': 'k', 'ங': 'ng', 'ச': 's', 'ஞ': 'ny', 'ட': 't', 'ண': 'n',
  'த': 'th', 'ந': 'n', 'ப': 'p', 'ம': 'm', 'ய': 'y', 'ர': 'r',
  'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l', 'ற': 'r', 'ன': 'n',
  'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h',
  // Sinhala
  'ක': 'k', 'ග': 'g', 'ච': 'ch', 'ජ': 'j', 'ට': 't', 'ඩ': 'd',
  'ණ': 'n', 'ත': 'th', 'ද': 'd', 'න': 'n', 'ප': 'p', 'බ': 'b',
  'ම': 'm', 'ය': 'y', 'ර': 'r', 'ල': 'l', 'ව': 'v', 'ස': 's',
  'ஹ': 'h', 'හ': 'h', 'ළ': 'l'
};

const vowelDiacritics = {
  // Tamil diacritics
  '\u0bbe': 'a', // ா (aa)
  '\u0bbf': 'i', // ி (i)
  '\u0bc0': 'ee', // ீ (ee)
  '\u0bc1': 'u', // ு (u)
  '\u0bc2': 'oo', // ூ (oo)
  '\u0bc6': 'e', // ெ (e)
  '\u0bc7': 'ae', // ே (ae)
  '\u0bc8': 'ai', // ை (ai)
  '\u0bca': 'o', // ொ (o)
  '\u0bcb': 'oo', // ோ (oo)
  '\u0bcc': 'au', // ௌ (au)
  '\u0bcd': '',   // ் (pulli)
  // Sinhala diacritics
  '\u0dcf': 'a',   // ා
  '\u0dd0': 'ae',  // ැ
  '\u0dd1': 'aae', // ෑ
  '\u0dd2': 'i',   // ි
  '\u0dd3': 'ee',  // ී
  '\u0dd4': 'u',   // ු
  '\u0dd6': 'oo',  // ූ
  '\u0dd9': 'e',   // ෙ
  '\u0dda': 'ae',  // ේ
  '\u0ddc': 'o',   // ො
  '\u0ddd': 'oo',  // ෝ
  '\u0dca': ''     // ් (hal kireema)
};

function transliterateTamilToLatin(text) {
  if (!text) return '';
  let result = '';
  const chars = Array.from(text);
  
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    
    if (independentVowels[char] !== undefined) {
      result += independentVowels[char];
    } else if (consonants[char] !== undefined) {
      const nextChar = chars[i + 1];
      if (nextChar && vowelDiacritics[nextChar] !== undefined) {
        result += consonants[char] + vowelDiacritics[nextChar];
        i++; // Skip the diacritic character
      } else {
        result += consonants[char] + 'a';
      }
    } else {
      result += char;
    }
  }
  return result;
}

function normalizePhonetic(str) {
  if (!str) return '';
  
  // Transliterate Tamil to Latin
  let res = transliterateTamilToLatin(str).toLowerCase();
  
  // Normalize vowels
  res = res.replace(/aa/g, 'a')
           .replace(/ee/g, 'i')
           .replace(/oo/g, 'u')
           .replace(/ae/g, 'e')
           .replace(/ow/g, 'au')
           .replace(/y/g, 'i');
           
  // Normalize consonants
  res = res.replace(/ch/g, 's')
           .replace(/sh/g, 's')
           .replace(/c/g, 's')
           .replace(/z/g, 's')
           .replace(/zh/g, 'l')
           .replace(/th/g, 't')
           .replace(/d/g, 't')
           .replace(/g/g, 'k')
           .replace(/b/g, 'p')
           .replace(/w/g, 'v');
           
  // Remove duplicate consecutive characters
  let clean = '';
  for (let i = 0; i < res.length; i++) {
    if (res[i] !== res[i - 1]) {
      clean += res[i];
    }
  }
  return clean;
}

function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Function to score search relevance
function scoreBookRelevance(book, search) {
  const query = search.trim();
  const cleanQuery = query.toLowerCase();
  
  // Basic attributes
  const cleanTitle = (book.title || '').trim().toLowerCase();
  const cleanAuthor = (book.author || '').trim().toLowerCase();
  const cleanDesc = (book.description || '').trim().toLowerCase();
  const cleanCategory = (book.category || '').trim().toLowerCase();
  const cleanLanguage = (book.language || '').trim().toLowerCase();
  const cleanPublisher = (book.publisher || '').trim().toLowerCase();
  const cleanIsbn = (book.isbn || '').replace(/[\s-]+/g, '').toLowerCase();
  const rawQueryIsbn = cleanQuery.replace(/[\s-]+/g, '');

  const normQuery = normalizePhonetic(query);
  const flatQuery = normQuery.replace(/\s+/g, '');
  
  const normTitle = normalizePhonetic(book.title || '');
  const flatTitle = normTitle.replace(/\s+/g, '');
  
  const normAuthor = normalizePhonetic(book.author || '');
  const flatAuthor = normAuthor.replace(/\s+/g, '');
  
  const normDesc = normalizePhonetic(book.description || '');
  
  const normPub = book.publisher ? normalizePhonetic(book.publisher) : '';
  const flatPub = normPub.replace(/\s+/g, '');

  const normCat = book.category ? normalizePhonetic(book.category) : '';
  const flatCat = normCat.replace(/\s+/g, '');

  let score = 0;

  // 1. Exact matches (Title, Author, ISBN, Publisher)
  if (cleanQuery === cleanTitle) {
    score += 1000;
  } else if (rawQueryIsbn && cleanIsbn === rawQueryIsbn) {
    score += 1000;
  } else if (cleanQuery === cleanAuthor) {
    score += 800;
  } else if (cleanQuery === cleanPublisher) {
    score += 700;
  }
  
  // 2. Phonetic exact match (spaces ignored, e.g. "ponniyinselvan" vs "ponniyin selvan")
  else if (flatQuery === flatTitle) {
    score += 700;
  } else if (flatQuery === flatAuthor) {
    score += 600;
  } else if (flatQuery === flatPub) {
    score += 600;
  }
  
  // 3. Substring match on original text
  else if (cleanTitle.includes(cleanQuery)) {
    score += 500;
  } else if (rawQueryIsbn.length >= 4 && cleanIsbn.includes(rawQueryIsbn)) {
    score += 500;
  } else if (cleanAuthor.includes(cleanQuery)) {
    score += 400;
  } else if (cleanPublisher.includes(cleanQuery)) {
    score += 300;
  } else if (cleanCategory === cleanQuery) {
    score += 600;
  } else if (cleanCategory.includes(cleanQuery)) {
    score += 200;
  } else if (cleanLanguage === cleanQuery) {
    score += 600;
  } else if (cleanLanguage.includes(cleanQuery)) {
    score += 200;
  }
  
  // 4. Substring match on phonetic text
  else if (normTitle.includes(normQuery)) {
    score += 300;
  } else if (normAuthor.includes(normQuery)) {
    score += 250;
  } else if (normPub && normPub.includes(normQuery)) {
    score += 200;
  } else if (normCat && normCat.includes(normQuery)) {
    score += 200;
  }
  
  // 5. Fuzzy Levenshtein match
  else {
    const titleDist = getLevenshteinDistance(flatQuery, flatTitle);
    const maxLenTitle = Math.max(flatQuery.length, flatTitle.length);
    if (titleDist <= 2 || (maxLenTitle > 4 && titleDist / maxLenTitle <= 0.3)) {
      score += Math.max(0, 200 - titleDist * 30);
    }
    
    const authorDist = getLevenshteinDistance(flatQuery, flatAuthor);
    const maxLenAuthor = Math.max(flatQuery.length, flatAuthor.length);
    if (authorDist <= 2 || (maxLenAuthor > 4 && authorDist / maxLenAuthor <= 0.3)) {
      score += Math.max(0, 150 - authorDist * 30);
    }
  }

  // 6. Individual word matches (partial matching)
  const queryWords = normQuery.split(/\s+/).filter(Boolean);
  const titleWords = normTitle.split(/\s+/).filter(Boolean);
  const authorWords = normAuthor.split(/\s+/).filter(Boolean);

  let wordMatches = 0;
  for (const qw of queryWords) {
    if (qw.length < 2) continue; // Skip single letter search words
    
    const matchesTitle = titleWords.some(tw => tw.includes(qw) || getLevenshteinDistance(qw, tw) <= 1);
    const matchesAuthor = authorWords.some(aw => aw.includes(qw) || getLevenshteinDistance(qw, aw) <= 1);
    const matchesDesc = normDesc.includes(qw);
    const matchesPub = normPub && normPub.includes(qw);
    const matchesCat = normCat && normCat.includes(qw);
    
    if (matchesTitle || matchesAuthor || matchesDesc || matchesPub || matchesCat) {
      wordMatches++;
    }
  }

  if (queryWords.length > 0 && wordMatches > 0) {
    score += (wordMatches / queryWords.length) * 100;
  }

  return score;
}

// @route   GET /api/books
// @desc    Get all books with optional search and category filters
router.get('/', async (req, res) => {
  const { search, category, featured, language, includeArchived, offers, author, publisher } = req.query;
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    let books = [];

    if (isMock) {
      const db = readFallbackData();
      books = db.books || [];

      // Exclude archived books by default
      if (includeArchived !== 'true') {
        books = books.filter(b => b.status !== 'archived');
      }

      // Filter by category or offers
      const isOffersFilter = offers === 'true' || (category && (category.toLowerCase() === 'offers' || category.toLowerCase() === 'special offers'));
      if (isOffersFilter) {
        books = books.filter(b => 
          (b.category && (b.category.toLowerCase() === 'offers' || b.category.toLowerCase() === 'special offers')) ||
          (b.discount && Number(b.discount) > 0) ||
          (b.discountPercent && Number(b.discountPercent) > 0) ||
          b.isOffer === true
        );
      } else if (category && category !== 'All') {
        books = books.filter(b => b.category && b.category.toLowerCase() === category.toLowerCase());
      }

      // Filter by language
      if (language && language !== 'All') {
        books = books.filter(b => b.language && b.language.toLowerCase() === language.toLowerCase());
      }

      // Filter by author
      if (author && author !== 'All') {
        books = books.filter(b => b.author && (slugify(b.author) === slugify(author) || b.author.toLowerCase() === author.toLowerCase()));
      }

      // Filter by publisher
      if (publisher && publisher !== 'All') {
        books = books.filter(b => b.publisher && (slugify(b.publisher) === slugify(publisher) || b.publisher.toLowerCase() === publisher.toLowerCase()));
      }

      // Filter by featured
      if (featured === 'true') {
        books = books.filter(b => b.featured === true);
      }
    } else {
      let filter = {};

      // Exclude archived books by default
      if (includeArchived !== 'true') {
        filter.status = { $ne: 'archived' };
      }

      const isOffersFilter = offers === 'true' || (category && (category.toLowerCase() === 'offers' || category.toLowerCase() === 'special offers'));
      if (isOffersFilter) {
        filter.$or = [
          { category: { $regex: /^offers$|^special offers$/i } },
          { discount: { $gt: 0 } },
          { discountPercent: { $gt: 0 } },
          { isOffer: true }
        ];
      } else if (category && category !== 'All') {
        const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.category = { $regex: new RegExp(`^${escapedCategory}$`, 'i') };
      }

      if (language && language !== 'All') {
        const escapedLanguage = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.language = { $regex: new RegExp(`^${escapedLanguage}$`, 'i') };
      }

      if (author && author !== 'All') {
        const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.author = { $regex: new RegExp(`^${escapedAuthor}$`, 'i') };
      }

      if (publisher && publisher !== 'All') {
        const escapedPublisher = publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.publisher = { $regex: new RegExp(`^${escapedPublisher}$`, 'i') };
      }

      if (featured === 'true') {
        filter.featured = true;
      }

      // Fetch from MongoDB
      books = await Book.find(filter);
    }

    // Apply intelligent phonetic search sorting if query is provided
    if (search) {
      books = books
        .map(b => {
          const bookObj = b.toObject ? b.toObject() : b;
          return {
            ...bookObj,
            _searchScore: scoreBookRelevance(bookObj, search)
          };
        })
        .filter(b => b._searchScore > 0)
        .sort((a, b) => b._searchScore - a._searchScore);
    } else if (!isMock) {
      // Sort by latest created if not mock and no search query
      books.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.json(books.map(addDynamicSlug));
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving books', error: error.message });
  }
});

// @route   GET /api/books/suggestions
// @desc    Get live autocomplete suggestions for Books, Authors, and Publishers
router.get('/suggestions', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.json({ books: [], authors: [], publishers: [] });
  }

  const query = q.trim();
  const cleanQuery = query.toLowerCase();
  const normQuery = normalizePhonetic(query);
  const flatQuery = normQuery.replace(/\s+/g, '');

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    let books = [];
    if (isMock) {
      const db = readFallbackData();
      books = db.books || [];
    } else {
      books = await Book.find({});
    }

    const matchedBooks = [];
    const matchedAuthors = new Set();
    const matchedPublishers = new Set();

    for (const b of books) {
      const bookObj = b.toObject ? b.toObject() : b;
      
      const cleanTitle = (bookObj.title || '').trim().toLowerCase();
      const cleanAuthor = (bookObj.author || '').trim().toLowerCase();
      const cleanPub = (bookObj.publisher || '').trim().toLowerCase();
      
      const normTitle = normalizePhonetic(bookObj.title || '');
      const flatTitle = normTitle.replace(/\s+/g, '');
      
      const normAuthor = normalizePhonetic(bookObj.author || '');
      const flatAuthor = normAuthor.replace(/\s+/g, '');
      
      const normPub = bookObj.publisher ? normalizePhonetic(bookObj.publisher) : '';
      const flatPub = normPub.replace(/\s+/g, '');

      let isBookMatch = false;
      let isAuthorMatch = false;
      let isPubMatch = false;

      // Book Title matching
      if (cleanTitle.includes(cleanQuery) || flatTitle.includes(flatQuery)) {
        isBookMatch = true;
      }
      
      // Author matching
      if (cleanAuthor.includes(cleanQuery) || flatAuthor.includes(flatQuery)) {
        isAuthorMatch = true;
      }

      // Publisher matching
      if (cleanPub && (cleanPub.includes(cleanQuery) || flatPub.includes(flatQuery))) {
        isPubMatch = true;
      }

      // Add to results
      if (isBookMatch) {
        matchedBooks.push({
          _id: bookObj._id,
          title: bookObj.title,
          author: bookObj.author,
          coverImage: bookObj.coverImage,
          category: bookObj.category,
          language: bookObj.language,
          slug: bookObj.slug || slugify(bookObj.title)
        });
      }

      if (isAuthorMatch) {
        matchedAuthors.add(bookObj.author);
      }

      if (isPubMatch && bookObj.publisher) {
        matchedPublishers.add(bookObj.publisher);
      }
    }

    res.json({
      books: matchedBooks.slice(0, 5),
      authors: Array.from(matchedAuthors).slice(0, 5),
      publishers: Array.from(matchedPublishers).slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching suggestions', error: error.message });
  }
});

// @route   GET /api/books/meta/authors
// @desc    Get all unique authors
router.get('/meta/authors', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let books = [];
    if (isMock) {
      books = readFallbackData().books || [];
    } else {
      books = await Book.find({});
    }
    const authors = Array.from(new Set(books.map(b => b.author).filter(Boolean)));
    const authorsData = authors.map(name => ({
      name,
      slug: slugify(name)
    }));
    res.json(authorsData);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving authors', error: error.message });
  }
});

// @route   GET /api/books/meta/publishers
// @desc    Get all unique publishers
router.get('/meta/publishers', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let books = [];
    if (isMock) {
      books = readFallbackData().books || [];
    } else {
      books = await Book.find({});
    }
    const publishers = Array.from(new Set(books.map(b => b.publisher).filter(Boolean)));
    const publishersData = publishers.map(name => ({
      name,
      slug: slugify(name)
    }));
    res.json(publishersData);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving publishers', error: error.message });
  }
});

// @route   GET /api/books/slug/:slug
// @desc    Get a single book by slug
router.get('/slug/:slug', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let book = null;
    if (isMock) {
      const db = readFallbackData();
      book = db.books.find(b => b.slug === req.params.slug || slugify(b.title) === req.params.slug);
    } else {
      book = await Book.findOne({ slug: req.params.slug });
      if (!book) {
        // Fallback for older books: fetch all and match in-memory
        const allBooks = await Book.find({});
        book = allBooks.find(b => slugify(b.title) === req.params.slug);
      }
    }
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }
    res.json(addDynamicSlug(book));
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving book details', error: error.message });
  }
});

// @route   GET /api/books/author/:slug
// @desc    Get books by author slug
router.get('/author/:slug', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let books = [];
    if (isMock) {
      books = readFallbackData().books || [];
    } else {
      books = await Book.find({});
    }
    const target = (req.params.slug || '').toLowerCase().trim();
    const filtered = books.filter(b => {
      if (!b.author) return false;
      const bSlug = slugify(b.author).toLowerCase();
      const bName = b.author.toLowerCase().trim();
      return (
        bSlug === target ||
        bName === target ||
        bName === target.replace(/-/g, ' ') ||
        bSlug === slugify(target)
      );
    });
    res.json(filtered.map(addDynamicSlug));
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving books by author', error: error.message });
  }
});

// @route   GET /api/books/publisher/:slug
// @desc    Get books by publisher slug
router.get('/publisher/:slug', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let books = [];
    if (isMock) {
      books = readFallbackData().books || [];
    } else {
      books = await Book.find({});
    }
    const target = (req.params.slug || '').toLowerCase().trim();
    const filtered = books.filter(b => {
      if (!b.publisher) return false;
      const bSlug = slugify(b.publisher).toLowerCase();
      const bName = b.publisher.toLowerCase().trim();
      return (
        bSlug === target ||
        bName === target ||
        bName === target.replace(/-/g, ' ') ||
        bSlug === slugify(target)
      );
    });
    res.json(filtered.map(addDynamicSlug));
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving books by publisher', error: error.message });
  }
});

// @route   GET /api/books/category/:slug
// @desc    Get books by category slug
router.get('/category/:slug', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let books = [];
    if (isMock) {
      books = readFallbackData().books || [];
    } else {
      books = await Book.find({});
    }
    const filtered = books.filter(b => slugify(b.category) === req.params.slug);
    res.json(filtered.map(addDynamicSlug));
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving books by category', error: error.message });
  }
});

// @route   GET /api/books/admin
// @desc    Get all books including archived ones (Admin/Staff only)
router.get('/admin', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    let books = [];
    if (isMock) {
      const db = readFallbackData();
      books = db.books || [];
    } else {
      books = await Book.find().sort({ createdAt: -1 });
    }
    res.json(books.map(addDynamicSlug));
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving admin catalog', error: error.message });
  }
});

// @route   GET /api/books/:id
// @desc    Get a single book by ID
router.get('/:id', async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const book = db.books.find(b => b._id === req.params.id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }
      return res.json(addDynamicSlug(book));
    } else {
      const book = await Book.findById(req.params.id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }
      res.json(addDynamicSlug(book));
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving book details', error: error.message });
  }
});

// @route   POST /api/books
// @desc    Create a new book (Admin only)
router.post('/', verifyAdmin, async (req, res) => {
  const { 
    title, author, price, category, description, coverImage, stock, featured, language,
    publisher, pages, publishYear, isbn, availabilityStatus,
    images, tamilTitle, englishTitle, sinhalaTitle, discount, discountPercent, isOffer, bestSeller, newArrival, status
  } = req.body;
  const isMock = process.env.USE_MOCK_DB === 'true';

  if (!title || !author || !price || !category || !description) {
    return res.status(400).json({ message: 'Please provide all required fields.' });
  }

  const numPrice = Number(price);
  const numDiscount = Number(discount || 0);
  let numDiscountPercent = Number(discountPercent || 0);
  if (!numDiscountPercent && numPrice > 0 && numDiscount > 0) {
    numDiscountPercent = Math.round((numDiscount / numPrice) * 100);
  }
  const boolIsOffer = isOffer === true || isOffer === 'true' || numDiscount > 0 || numDiscountPercent > 0 || (category && category.toLowerCase() === 'offers');

  try {
    if (isMock) {
      const db = readFallbackData();
      const newBook = {
        _id: 'book_' + Date.now(),
        title,
        author,
        price: numPrice,
        category,
        description,
        coverImage: coverImage || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=600',
        stock: Number(stock) || 10,
        featured: featured === true || featured === 'true',
        rating: 4.5,
        language: language || 'English',
        publisher: publisher || '',
        pages: Number(pages) || 0,
        publishYear: Number(publishYear) || new Date().getFullYear(),
        isbn: isbn || '',
        availabilityStatus: availabilityStatus || 'In Stock',
        images: Array.isArray(images) ? images : [],
        tamilTitle: tamilTitle || '',
        englishTitle: englishTitle || '',
        sinhalaTitle: sinhalaTitle || '',
        discount: numDiscount,
        discountPercent: numDiscountPercent,
        isOffer: boolIsOffer,
        bestSeller: bestSeller === true || bestSeller === 'true',
        newArrival: newArrival === true || newArrival === 'true',
        status: status || 'active',
        views: 0
      };

      db.books.push(newBook);
      writeFallbackData(db);
      res.status(201).json(addDynamicSlug(newBook));
    } else {
      const newBook = new Book({
        title,
        author,
        price: numPrice,
        category,
        description,
        coverImage,
        stock,
        featured,
        language,
        publisher,
        pages,
        publishYear,
        isbn,
        availabilityStatus,
        images: Array.isArray(images) ? images : [],
        tamilTitle: tamilTitle || '',
        englishTitle: englishTitle || '',
        sinhalaTitle: sinhalaTitle || '',
        discount: numDiscount,
        discountPercent: numDiscountPercent,
        isOffer: boolIsOffer,
        bestSeller: bestSeller === true || bestSeller === 'true',
        newArrival: newArrival === true || newArrival === 'true',
        status: status || 'active'
      });

      await newBook.save();
      res.status(201).json(addDynamicSlug(newBook));
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating book', error: error.message });
  }
});

// @route   PUT /api/books/:id
// @desc    Update an existing book (Admin only)
router.put('/:id', verifyAdmin, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  const { 
    title, author, price, category, description, coverImage, stock, featured, language,
    publisher, pages, publishYear, isbn, availabilityStatus,
    images, tamilTitle, englishTitle, sinhalaTitle, discount, discountPercent, isOffer, bestSeller, newArrival, status
  } = req.body;

  try {
    const numPrice = price !== undefined ? Number(price) : undefined;
    const numDiscount = discount !== undefined ? Number(discount) : undefined;
    let numDiscountPercent = discountPercent !== undefined ? Number(discountPercent) : undefined;
    if (numDiscountPercent === undefined && numPrice !== undefined && numDiscount !== undefined && numPrice > 0 && numDiscount > 0) {
      numDiscountPercent = Math.round((numDiscount / numPrice) * 100);
    }
    const boolIsOffer = isOffer !== undefined 
      ? (isOffer === true || isOffer === 'true') 
      : (numDiscount !== undefined ? numDiscount > 0 : undefined);

    if (isMock) {
      const db = readFallbackData();
      const index = db.books.findIndex(b => b._id === req.params.id);
      
      if (index === -1) {
        return res.status(404).json({ message: 'Book not found' });
      }

      const updatedBook = {
        ...db.books[index],
        title: title || db.books[index].title,
        author: author || db.books[index].author,
        price: numPrice !== undefined ? numPrice : db.books[index].price,
        category: category || db.books[index].category,
        description: description || db.books[index].description,
        coverImage: coverImage || db.books[index].coverImage,
        stock: stock !== undefined ? Number(stock) : db.books[index].stock,
        featured: featured !== undefined ? (featured === true || featured === 'true') : db.books[index].featured,
        language: language || db.books[index].language,
        publisher: publisher !== undefined ? publisher : db.books[index].publisher,
        pages: pages !== undefined ? Number(pages) : db.books[index].pages,
        publishYear: publishYear !== undefined ? Number(publishYear) : db.books[index].publishYear,
        isbn: isbn !== undefined ? isbn : db.books[index].isbn,
        availabilityStatus: availabilityStatus || db.books[index].availabilityStatus,
        images: Array.isArray(images) ? images : db.books[index].images || [],
        tamilTitle: tamilTitle !== undefined ? tamilTitle : db.books[index].tamilTitle || '',
        englishTitle: englishTitle !== undefined ? englishTitle : db.books[index].englishTitle || '',
        sinhalaTitle: sinhalaTitle !== undefined ? sinhalaTitle : db.books[index].sinhalaTitle || '',
        discount: numDiscount !== undefined ? numDiscount : (db.books[index].discount || 0),
        discountPercent: numDiscountPercent !== undefined ? numDiscountPercent : (db.books[index].discountPercent || 0),
        isOffer: boolIsOffer !== undefined ? boolIsOffer : (db.books[index].isOffer || false),
        bestSeller: bestSeller !== undefined ? (bestSeller === true || bestSeller === 'true') : db.books[index].bestSeller || false,
        newArrival: newArrival !== undefined ? (newArrival === true || newArrival === 'true') : db.books[index].newArrival || false,
        status: status || db.books[index].status || 'active'
      };

      db.books[index] = updatedBook;
      writeFallbackData(db);
      res.json(addDynamicSlug(updatedBook));
    } else {
      const updateData = { 
        title, author, category, description, coverImage, stock, featured, language,
        publisher, pages, publishYear, isbn, availabilityStatus,
        images, tamilTitle, englishTitle, sinhalaTitle, bestSeller, newArrival, status
      };
      if (numPrice !== undefined) updateData.price = numPrice;
      if (numDiscount !== undefined) updateData.discount = numDiscount;
      if (numDiscountPercent !== undefined) updateData.discountPercent = numDiscountPercent;
      if (boolIsOffer !== undefined) updateData.isOffer = boolIsOffer;

      const updatedBook = await Book.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedBook) {
        return res.status(404).json({ message: 'Book not found' });
      }
      res.json(addDynamicSlug(updatedBook));
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating book', error: error.message });
  }
});

// @route   DELETE /api/books/:id
// @desc    Delete a book (Admin only)
router.delete('/:id', verifyAdmin, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.books.findIndex(b => b._id === req.params.id);
      
      if (index === -1) {
        return res.status(404).json({ message: 'Book not found' });
      }

      db.books.splice(index, 1);
      writeFallbackData(db);
      res.json({ message: 'Book deleted successfully' });
    } else {
      const deletedBook = await Book.findByIdAndDelete(req.params.id);
      if (!deletedBook) {
        return res.status(404).json({ message: 'Book not found' });
      }
      res.json({ message: 'Book deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting book', error: error.message });
  }
});



// @route   PUT /api/books/:id/archive
// @desc    Archive a book (Admin only)
router.put('/:id/archive', verifyAdmin, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.books.findIndex(b => b._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Book not found' });
      }
      db.books[index].status = 'archived';
      writeFallbackData(db);
      res.json(addDynamicSlug(db.books[index]));
    } else {
      const book = await Book.findById(req.params.id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }
      book.status = 'archived';
      await book.save();
      res.json(addDynamicSlug(book));
    }
  } catch (error) {
    res.status(500).json({ message: 'Error archiving book', error: error.message });
  }
});

// @route   PUT /api/books/:id/restore
// @desc    Restore an archived book (Admin only)
router.put('/:id/restore', verifyAdmin, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';
  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.books.findIndex(b => b._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Book not found' });
      }
      db.books[index].status = 'active';
      writeFallbackData(db);
      res.json(addDynamicSlug(db.books[index]));
    } else {
      const book = await Book.findById(req.params.id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }
      book.status = 'active';
      await book.save();
      res.json(addDynamicSlug(book));
    }
  } catch (error) {
    res.status(500).json({ message: 'Error restoring book', error: error.message });
  }
});

// @route   POST /api/books/bulk-import
// @desc    Bulk import books (Admin only)
router.post('/bulk-import', verifyAdmin, async (req, res) => {
  const { books } = req.body;
  if (!books || !Array.isArray(books)) {
    return res.status(400).json({ message: 'Payload must contain a books array.' });
  }

  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    const importedBooks = [];
    if (isMock) {
      const db = readFallbackData();
      for (const b of books) {
        if (!b.title || !b.author || !b.price || !b.category) continue;
        const newBook = {
          _id: b._id || 'book_' + Date.now() + Math.random().toString(36).substr(2, 5),
          title: b.title,
          author: b.author,
          price: Number(b.price),
          category: b.category,
          description: b.description || 'No description available.',
          coverImage: b.coverImage || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=600',
          images: Array.isArray(b.images) ? b.images : [],
          tamilTitle: b.tamilTitle || '',
          englishTitle: b.englishTitle || '',
          sinhalaTitle: b.sinhalaTitle || '',
          discount: Number(b.discount || 0),
          stock: Number(b.stock !== undefined ? b.stock : 10),
          language: b.language || 'English',
          publisher: b.publisher || '',
          pages: Number(b.pages || 0),
          publishYear: Number(b.publishYear || new Date().getFullYear()),
          isbn: b.isbn || '',
          availabilityStatus: b.availabilityStatus || 'In Stock',
          bestSeller: b.bestSeller === true || b.bestSeller === 'true',
          newArrival: b.newArrival === true || b.newArrival === 'true',
          status: b.status || 'active',
          views: 0,
          slug: b.slug || slugify(b.title),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.books.push(newBook);
        importedBooks.push(newBook);
      }
      writeFallbackData(db);
    } else {
      for (const b of books) {
        if (!b.title || !b.author || !b.price || !b.category) continue;
        const newBook = new Book({
          title: b.title,
          author: b.author,
          price: Number(b.price),
          category: b.category,
          description: b.description || 'No description available.',
          coverImage: b.coverImage,
          images: Array.isArray(b.images) ? b.images : [],
          tamilTitle: b.tamilTitle || '',
          englishTitle: b.englishTitle || '',
          sinhalaTitle: b.sinhalaTitle || '',
          discount: Number(b.discount || 0),
          stock: Number(b.stock !== undefined ? b.stock : 10),
          language: b.language || 'English',
          publisher: b.publisher || '',
          pages: Number(b.pages || 0),
          publishYear: Number(b.publishYear || new Date().getFullYear()),
          isbn: b.isbn || '',
          availabilityStatus: b.availabilityStatus || 'In Stock',
          bestSeller: b.bestSeller === true || b.bestSeller === 'true',
          newArrival: b.newArrival === true || b.newArrival === 'true',
          status: b.status || 'active'
        });
        await newBook.save();
        importedBooks.push(newBook);
      }
    }
    res.status(201).json({ message: `Successfully imported ${importedBooks.length} books.`, count: importedBooks.length });
  } catch (error) {
    res.status(500).json({ message: 'Error importing books', error: error.message });
  }
});

// @route   PUT /api/books/:id/stock
// @desc    Manually adjust book stock & record a transaction log (Admin/Staff only)
router.put('/:id/stock', verifyAdminOrStaff, async (req, res) => {
  const { adjustment, note } = req.body;
  if (adjustment === undefined || isNaN(Number(adjustment))) {
    return res.status(400).json({ message: 'Adjustment value must be a valid number.' });
  }

  const adjVal = Number(adjustment);
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    if (isMock) {
      const db = readFallbackData();
      const index = db.books.findIndex(b => b._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Book not found' });
      }

      const prevStock = Number(db.books[index].stock || 0);
      const newStock = Math.max(0, prevStock + adjVal);
      db.books[index].stock = newStock;
      
      // Update availabilityStatus based on new stock
      db.books[index].availabilityStatus = newStock === 0 ? 'Out of Stock' : 'In Stock';

      // Create log entry
      if (!db.stockLogs) db.stockLogs = [];
      const newLog = {
        _id: 'log_' + Date.now(),
        bookId: req.params.id,
        bookTitle: db.books[index].title,
        operatorName: req.user?.name || 'Staff User',
        actionType: adjVal >= 0 ? 'increase' : 'decrease',
        quantity: Math.abs(adjVal),
        prevStock,
        newStock,
        note: note || '',
        createdAt: new Date().toISOString()
      };
      db.stockLogs.push(newLog);

      writeFallbackData(db);
      res.json({ success: true, book: addDynamicSlug(db.books[index]), log: newLog });
    } else {
      const book = await Book.findById(req.params.id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }

      const prevStock = Number(book.stock || 0);
      const newStock = Math.max(0, prevStock + adjVal);
      book.stock = newStock;
      book.availabilityStatus = newStock === 0 ? 'Out of Stock' : 'In Stock';
      await book.save();

      // Create log entry
      const log = new StockLog({
        bookId: book._id,
        bookTitle: book.title,
        operatorName: req.user?.name || 'Staff User',
        actionType: adjVal >= 0 ? 'increase' : 'decrease',
        quantity: Math.abs(adjVal),
        prevStock,
        newStock,
        note: note || ''
      });
      await log.save();

      res.json({ success: true, book: addDynamicSlug(book), log });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error adjusting stock', error: error.message });
  }
});

// @route   GET /api/books/:id/stock-logs
// @desc    Retrieve stock adjustment logs for a specific book (Admin/Staff only)
router.get('/:id/stock-logs', verifyAdminOrStaff, async (req, res) => {
  const isMock = process.env.USE_MOCK_DB === 'true';

  try {
    let logs = [];
    if (isMock) {
      const db = readFallbackData();
      logs = (db.stockLogs || []).filter(l => l.bookId === req.params.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      logs = await StockLog.find({ bookId: req.params.id })
        .sort({ createdAt: -1 });
    }
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving stock logs', error: error.message });
  }
});

export default router;
export { scoreBookRelevance, normalizePhonetic, transliterateTamilToLatin };
