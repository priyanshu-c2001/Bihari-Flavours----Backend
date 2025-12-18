const mongoose = require('mongoose');

// Subschema for individual items in an order
const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 }
});

// Main order schema
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Array of items in the order
  items: { type: [orderItemSchema], required: true, default: [] },

  totalAmount: { type: Number, required: true },

  // Shipping address (now includes name and phone)
  shippingAddress: {
    name: { type: String, required: true },      // recipient name
    phone: { type: String, required: true },     // recipient phone
    street: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String, default: 'India' }
  },

  // Order status
  orderStatus: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending'
  },

  // Payment status
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed'],
    default: 'Pending'
  },

  // Payment method
 paymentMethod: { 
  type: String, 
  enum: ['UPI','COD','Credit Card','Debit Card','Net Banking','Online'], 
  required: true
},

  // Coupon info (optional)
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },

  // Linked transaction
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },

  // Razorpay order ID for webhook mapping
  razorpayOrderId: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
