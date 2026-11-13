const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const shareRecordSchema = new mongoose.Schema({
  shareId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileRecord',
    required: true
  },
  fileUuid: {
    type: String,
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderEmail: {
    type: String,
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientEmail: {
    type: String,
    required: true
  },
  recipientName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active'
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index to quickly query recipient's inbox and sender's sent files
shareRecordSchema.index({ recipientId: 1, createdAt: -1 });
shareRecordSchema.index({ senderId: 1, createdAt: -1 });
shareRecordSchema.index({ fileUuid: 1, recipientId: 1 });

module.exports = mongoose.model('ShareRecord', shareRecordSchema);
