import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/wasri/Desktop/readeora/readora-backend/.env' });

async function checkSample() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const count = await db.collection('books').countDocuments();
  console.log(`Total books count: ${count}`);

  // Fetch only 5 sample books without downloading all at once
  const cursor = db.collection('books').find({}).limit(5);

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const str = JSON.stringify(doc);
    const sizeKB = (Buffer.byteLength(str, 'utf8') / 1024).toFixed(1);
    const coverLen = doc.coverImage ? (doc.coverImage.length / 1024).toFixed(1) + ' KB' : 'none';
    const imagesCount = Array.isArray(doc.images) ? doc.images.length : 0;
    let imagesTotalKB = 0;
    if (Array.isArray(doc.images)) {
      imagesTotalKB = doc.images.reduce((acc, img) => acc + (img ? img.length : 0), 0) / 1024;
    }
    console.log(`Book: "${doc.title?.slice(0, 25)}" | Doc Size: ${sizeKB} KB | Cover: ${coverLen} | Extra Images: ${imagesCount} (${imagesTotalKB.toFixed(1)} KB)`);
  }

  // Also check banners
  const bannerCursor = db.collection('banners').find({}).limit(5);
  console.log('\n--- BANNERS SAMPLE ---');
  while (await bannerCursor.hasNext()) {
    const b = await bannerCursor.next();
    const str = JSON.stringify(b);
    const sizeKB = (Buffer.byteLength(str, 'utf8') / 1024).toFixed(1);
    console.log(`Banner: "${b.title || b._id}" | Size: ${sizeKB} KB | active: ${b.active}`);
  }

  await mongoose.disconnect();
}

checkSample().catch(console.error);
