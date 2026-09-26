import express from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { verifyAdminOrStaff } from '../middleware/auth.js';

const router = express.Router();

// Keep the uploaded file in memory only, never write it to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB, same limit you already use
});

// @route   POST /api/upload
// @desc    Upload one image to Cloudinary, get back a small hosted URL
router.post('/', verifyAdminOrStaff, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided.' });
  }

  try {
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'readora',
          // Automatically shrink oversized images and compress smartly
          transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: uploadResult.secure_url });
  } catch (error) {
    res.status(500).json({ message: 'Image upload failed', error: error.message });
  }
});

export default router;