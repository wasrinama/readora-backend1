import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cloudinary from './config/cloudinary.js';
import Book from './models/Book.js';
import Banner from './models/Banner.js';

dotenv.config();

// Uploads a single base64 data-URI string to Cloudinary and returns the hosted URL
async function uploadBase64ToCloudinary(base64String) {
  const result = await cloudinary.uploader.upload(base64String, {
    folder: 'readora',
    transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
  });
  return result.secure_url;
}

async function migrateBooks() {
  const books = await Book.find({
    $or: [
      { coverImage: { $regex: '^data:image' } },
      { images: { $regex: '^data:image' } }
    ]
  });

  console.log(`Found ${books.length} book(s) with base64 images to migrate.`);

  for (const book of books) {
    let changed = false;

    if (book.coverImage && book.coverImage.startsWith('data:image')) {
      try {
        book.coverImage = await uploadBase64ToCloudinary(book.coverImage);
        changed = true;
        console.log(`  ✔ Migrated cover for: ${book.title}`);
      } catch (err) {
        console.error(`  ✘ Failed cover for: ${book.title}`, err.message);
      }
    }

    if (Array.isArray(book.images) && book.images.length > 0) {
      const newImages = [];
      for (const img of book.images) {
        if (img && img.startsWith('data:image')) {
          try {
            newImages.push(await uploadBase64ToCloudinary(img));
            changed = true;
          } catch (err) {
            console.error(`  ✘ Failed gallery image for: ${book.title}`, err.message);
            newImages.push(img); // keep the old one rather than losing it
          }
        } else {
          newImages.push(img);
        }
      }
      book.images = newImages;
    }

    if (changed) {
      await book.save();
    }
  }
}

async function migrateBanners() {
  const banners = await Banner.find({ imageUrl: { $regex: '^data:image' } });

  console.log(`Found ${banners.length} banner(s) with base64 images to migrate.`);

  for (const banner of banners) {
    try {
      banner.imageUrl = await uploadBase64ToCloudinary(banner.imageUrl);
      await banner.save();
      console.log(`  ✔ Migrated banner: ${banner.title || banner._id}`);
    } catch (err) {
      console.error(`  ✘ Failed banner: ${banner.title || banner._id}`, err.message);
    }
  }
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB. Starting migration...\n');

  await migrateBooks();
  await migrateBanners();

  console.log('\nMigration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});