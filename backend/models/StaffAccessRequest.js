const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const staffAccessRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  fullName: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  employeeId: { type: String, required: true, trim: true, maxlength: 100 },
  department: { type: String, required: true, trim: true, maxlength: 100 },
  designation: { type: String, required: true, trim: true, maxlength: 100 },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  reviewedBy: { type: String, default: null },
  reviewNote: { type: String, default: null, maxlength: 1000 },
  reviewedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

staffAccessRequestSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('StaffAccessRequest', staffAccessRequestSchema);
