import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Book from '../src/models/Book.js';
import { slugify } from '../src/utils/slugify.js';

dotenv.config();

async function run() {
  await connectDB();
  try {
    const books = await Book.find({});
    console.log(`Total books: ${books.length}`);
    const categories = Array.from(new Set(books.map(b => b.category)));
    console.log('Categories in DB:', categories);
    
    console.log('Slugified categories:');
    categories.forEach(c => {
      console.log(`  "${c}" -> "${slugify(c)}"`);
    });

    console.log('\nSample books:');
    books.slice(0, 5).forEach(b => {
      console.log(`- Title: "${b.title}", Category: "${b.category}", Slugified: "${slugify(b.category)}"`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

run();
