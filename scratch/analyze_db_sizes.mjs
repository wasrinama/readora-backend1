import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/wasri/Desktop/readeora/readora-backend/.env' });

async function analyze() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const collections = ['books', 'banners', 'authors', 'publishers', 'settings', 'categories'];

  console.log('====================================================');
  console.log('📊 MONGODB ATLAS COLLECTION SIZE & PAYLOAD ANALYSIS');
  console.log('====================================================');

  for (const collName of collections) {
    const coll = db.collection(collName);
    const count = await coll.countDocuments();
    const docs = await coll.find({}).toArray();

    let totalBytes = 0;
    let maxDocBytes = 0;
    let maxDocName = '';
    let imageFieldBytes = 0;

    for (const d of docs) {
      const jsonStr = JSON.stringify(d);
      const bLen = Buffer.byteLength(jsonStr, 'utf8');
      totalBytes += bLen;
      if (bLen > maxDocBytes) {
        maxDocBytes = bLen;
        maxDocName = d.title || d.name || d._id;
      }

      // Check fields that contain base64 image data
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'string' && (v.startsWith('data:image') || v.length > 50000)) {
          imageFieldBytes += v.length;
        }
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string' && (item.startsWith('data:image') || item.length > 50000)) {
              imageFieldBytes += item.length;
            }
          }
        }
      }
    }

    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const imageMB = (imageFieldBytes / (1024 * 1024)).toFixed(2);
    const maxKB = (maxDocBytes / 1024).toFixed(1);

    console.log(
      `${collName.padEnd(14)} | Docs: ${String(count).padStart(3)} | Total: ${totalMB.padStart(6)} MB | Images: ${imageMB.padStart(6)} MB (${Math.round((imageFieldBytes / (totalBytes || 1)) * 100)}%) | Max Doc: ${maxKB} KB (${maxDocName.slice(0, 20)})`
    );
  }

  console.log('====================================================\n');
  await mongoose.disconnect();
}

analyze().catch(console.error);
