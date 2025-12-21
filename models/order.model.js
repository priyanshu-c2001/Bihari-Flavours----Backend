const mongoose = require('mongoose');

// Subschema for individual items in an order
const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
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

// Main order schema
const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ✅ FIX 1: Prevent empty order
  items: {
    type: [orderItemSchema],
    required: true,
    validate: {
      validator: function (arr) {
        return Array.isArray(arr) && arr.length > 0;
      },
      message: 'Order must contain at least one item'
    }
  },

  totalAmount: {
    type: Number,
    required: true
  },

  // ✅ FIX 2: Complete address required
  shippingAddress: {
    name: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    street: {
      type: String,
    
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    postalCode: {
      type: String,
      
    },
    country: {
      type: String,
      default: 'India'
    }
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

  // Payment method (UNCHANGED as requested)
  paymentMethod: {
    type: String,
    enum: ['UPI', 'COD', 'Credit Card', 'Debit Card', 'Net Banking', 'Online'],
    required: true
  },

  // Coupon info (optional)
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  },

  // Linked transaction (optional)
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionModel'
  },

  // ✅ FIX 3: Unique Razorpay Order ID
  razorpayOrderId: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
