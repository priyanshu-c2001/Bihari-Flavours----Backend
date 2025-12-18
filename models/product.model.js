const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    unique: true, // ✅ Ensure unique product names
  },
  desc: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true
  },
  photo: {
    type: String,
    required: [true, 'Product image URL is required'],
    match: [/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)$/, 'Invalid image URL format']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price must be a positive number']
  },
  quantity: {
    type: String,
    enum: ['instock', 'outofstock'], 
    default: 'instock'
  }
}, {
  timestamps: true
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
