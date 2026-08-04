import mongoose from 'mongoose';

const stockLogSchema = new mongoose.Schema({
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  bookTitle: {
    type: String,
    required: true
  },
  operatorName: {
    type: String,
    required: true
  },
  actionType: {
    type: String,
    enum: ['increase', 'decrease', 'set', 'sale'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  prevStock: {
    type: Number,
    required: true
  },
  newStock: {
    type: Number,
    required: true
  },
  note: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const StockLog = mongoose.model('StockLog', stockLogSchema);
export default StockLog;
