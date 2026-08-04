import mongoose from 'mongoose';
import { slugify } from '../utils/slugify.js';


const bookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  coverImage: {
    type: String,
    default: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=600'
  },
  rating: {
    type: Number,
    default: 4.5,
    min: 0,
    max: 5
  },
  featured: {
    type: Boolean,
    default: false
  },
  stock: {
    type: Number,
    default: 10,
    min: 0
  },
  language: {
    type: String,
    enum: ['English', 'Tamil', 'Sinhala'],
    default: 'English'
  },
  publisher: {
    type: String,
    trim: true,
    default: ''
  },
  pages: {
    type: Number,
    default: 0
  },
  publishYear: {
    type: Number,
    default: new Date().getFullYear()
  },
  isbn: {
    type: String,
    trim: true,
    default: ''
  },
  availabilityStatus: {
    type: String,
    enum: ['In Stock', 'Out of Stock', 'Pre-Order'],
    default: 'In Stock'
  },
  images: {
    type: [String],
    default: []
  },
  tamilTitle: {
    type: String,
    default: ''
  },
  englishTitle: {
    type: String,
    default: ''
  },
  sinhalaTitle: {
    type: String,
    default: ''
  },
  discount: {
    type: Number,
    default: 0
  },
  bestSeller: {
    type: Boolean,
    default: false
  },
  newArrival: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  },
  views: {
    type: Number,
    default: 0
  },
  slug: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

bookSchema.pre('save', function(next) {
  if (this.isModified('title') || !this.slug) {
    this.slug = slugify(this.title);
  }
  next();
});

const Book = mongoose.model('Book', bookSchema);
export default Book;
