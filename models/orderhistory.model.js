const mongoose = require('mongoose');
const { orderItemSchema } = require('./order.model'); // reuse orderItemSchema

const orderHistorySchema = new mongoose.Schema({
  originalOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Items copied from order
  items: { type: [orderItemSchema], required: true, default: [] },

  totalAmount: { type: Number, default: 0 },

  // Shipping address (with name and phone)
  shippingAddress: {
    name: { type: String, required: true },      // recipient name
    phone: { type: String, required: true },     // recipient phone
    street: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String, default: 'India' }
  },

  orderStatus: { type: String, default: 'Pending' },
  paymentStatus: { type: String, default: 'Pending' },
  paymentMethod: { type: String, default: '' },

  // Transaction link
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },

  completedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// TTL index to auto-delete order history after 2 weeks (14 days)
orderHistorySchema.index({ completedAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

module.exports = mongoose.models.OrderHistory || mongoose.model('OrderHistory', orderHistorySchema);
