import mongoose from 'mongoose';

const publisherSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: 'Publisher catalog info not set yet.'
  },
  logo: {
    type: String,
    default: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=200'
  },
  slug: {
    type: String,
    unique: true,
    trim: true
  }
}, {
  timestamps: true
});

const Publisher = mongoose.model('Publisher', publisherSchema);
export default Publisher;
