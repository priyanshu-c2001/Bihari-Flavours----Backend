const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Step 1: Define the schema (structure of user)
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format'] // E.164 standard
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: String,
    enum: ['user', 'admin'], // restrict allowed roles
    default: 'user'
  }
}, {
  timestamps: true // adds createdAt, updatedAt automatically
});

// Step 2: Hash password before saving to DB
userSchema.pre('save', async function(next) {
  // Only hash if password was modified or is new
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Step 3: Compare entered password with stored hash (for login)
userSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Step 4: Create and export the model
const User = mongoose.model('User', userSchema);
module.exports = User;
