import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Book from '../src/models/Book.js';
import { searchBooksForAI } from '../src/services/aiBookService.js';

dotenv.config();

async function test() {
  console.log('Connecting to Mongo...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected!');

  console.log('Testing searchBooksForAI("Madol Doova")...');
  const results = await searchBooksForAI('Madol Doova');
  console.log('Results:', results);

  await mongoose.disconnect();
  console.log('Done!');
}

test();
