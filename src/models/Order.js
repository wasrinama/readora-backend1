import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  bookId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  }
});

const orderSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerPhone: {
    type: String,
    required: true,
    trim: true
  },
  customerAddress: {
    type: String,
    required: true,
    trim: true
  },
  items: [orderItemSchema],
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'completed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'bank_transfer'],
    default: 'cod'
  },
  paymentSlip: {
    type: String,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'pending', 'paid'],
    default: 'unpaid'
  }
}, {
  timestamps: true
});

const Order = mongoose.model('Order', orderSchema);
export default Order;
