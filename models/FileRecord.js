const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const fileRecordSchema = new mongoose.Schema({
  fileId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  storedFileName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    default: 'application/octet-stream'
  },
  size: {
    type: Number,
    required: true
  },
  checksum: {
    type: String, // SHA-256 hash of original plaintext
    required: true
  },
  encrypted: {
    type: Boolean,
    default: true
  },
  encryptionAlgorithm: {
    type: String,
    default: 'AES-256-GCM'
  },
  iv: {
    type: String, // hex encoded initialization vector
    required: true
  },
  authTag: {
    type: String, // hex encoded 16-byte authentication tag
    required: true
  },
  salt: {
    type: String, // hex encoded salt used for per-file key derivation
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploaderName: {
    type: String,
    required: true
  },
  uploaderEmail: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['stored', 'quarantined', 'deleted'],
    default: 'stored'
  },
  quarantineReason: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FileRecord', fileRecordSchema);
