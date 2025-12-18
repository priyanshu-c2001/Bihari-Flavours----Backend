const mongoose = require('mongoose');

const transactionItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true }
});

const transactionSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [transactionItemSchema],
  amount: { type: Number, required: true },
paymentMethod: { 
  type: String, 
  enum: ['UPI','COD','Credit Card','Debit Card','Net Banking','Online'], 
  required: true
},
  paymentStatus: { type: String, enum: ['Pending','Success','Failed'], default: 'Pending' },
  transactionId: { type: String, unique: true, required: true }
}, { timestamps: true });

// ✅ Fix: export as TransactionModel to avoid naming conflicts
module.exports = mongoose.model('TransactionModel', transactionSchema);
