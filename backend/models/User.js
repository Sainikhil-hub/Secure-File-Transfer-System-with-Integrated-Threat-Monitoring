const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  role: {
    type: String,
    enum: ['Administrator', 'Staff', 'End User'],
    default: 'End User'
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockoutUntil: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual for checking if account is currently locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockoutUntil && this.lockoutUntil > Date.now());
});

// Pre-save hook to hash password if modified
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password helper
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Return safe user object omitting password
userSchema.methods.toSafeObject = function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    isLocked: this.isLocked,
    lockoutUntil: this.lockoutUntil,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
