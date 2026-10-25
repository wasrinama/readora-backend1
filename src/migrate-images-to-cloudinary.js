import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cloudinary from './config/cloudinary.js';
import Book from './models/Book.js';
import Banner from './models/Banner.js';

dotenv.config();

async function uploadBase64ToCloudinary(base64String) {
  const result = await cloudinary.uploader.upload(base64String, {
    folder: 'readora',
    transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
  });
  return result.secure_url;
}

async function migrateBooks() {
  // Only fetch the IDs first, so we never hold all the images in memory at once
  const ids = await Book.find({
    $or: [
      { coverImage: { $regex: '^data:image' } },
      { images: { $regex: '^data:image' } }
    ]
  }).select('_id').lean();

  console.log(`Found ${ids.length} book(s) with base64 images to migrate.`);

  let done = 0;
  for (const { _id } of ids) {
    const book = await Book.findById(_id).lean();
    const update = {};

    try {
      if (book.coverImage && book.coverImage.startsWith('data:image')) {
        update.coverImage = await uploadBase64ToCloudinary(book.coverImage);
      }

      if (Array.isArray(book.images) && book.images.some(i => i && i.startsWith('data:image'))) {
        const newImages = [];
        for (const img of book.images) {
          newImages.push(img && img.startsWith('data:image') ? await uploadBase64ToCloudinary(img) : img);
        }
        update.images = newImages;
      }

      if (Object.keys(update).length > 0) {
        await Book.updateOne({ _id }, { $set: update });
      }
      done++;
      console.log(`  ✔ (${done}/${ids.length}) ${book.title}`);
    } catch (err) {
      console.error(`  ✘ Failed: ${book.title}`, err.message);
    }
  }
}

async function migrateBanners() {
  const ids = await Banner.find({ imageUrl: { $regex: '^data:image' } }).select('_id').lean();
  console.log(`Found ${ids.length} banner(s) with base64 images to migrate.`);

  for (const { _id } of ids) {
    const banner = await Banner.findById(_id).lean();
    try {
      const newUrl = await uploadBase64ToCloudinary(banner.imageUrl);
      await Banner.updateOne({ _id }, { $set: { imageUrl: newUrl } });
      console.log(`  ✔ Migrated banner: ${banner.title || _id}`);
    } catch (err) {
      console.error(`  ✘ Failed banner: ${banner.title || _id}`, err.message);
    }
  }
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
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