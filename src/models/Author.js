import mongoose from 'mongoose';

const authorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  bio: {
    type: String,
    default: 'Author biography details not set yet.'
  },
  image: {
    type: String,
    default: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
  },
  slug: {
    type: String,
    unique: true,
    trim: true
  }
}, {
  timestamps: true
});

const Author = mongoose.model('Author', authorSchema);
export default Author;
