const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const websocketService = require('./services/websocketService');

// Models for seed data
const User = require('./models/User');
const SecurityPolicy = require('./models/SecurityPolicy');

const app = express();
const server = http.createServer(app);

// Initialize WebSockets for real-time threat alert streaming (REQ-10)
websocketService.init(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/files', require('./routes/fileRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/config', require('./routes/configRoutes'));

// System health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    cryptoStandard: 'AES-256-GCM',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Single Page Application fallback for non-API routes
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  } else {
    res.status(404).json({ success: false, message: 'Resource not found' });
  }
});

// Seed default users if database is fresh or ensure clean corporate accounts
async function seedDefaultUsers() {
  try {
    // 1. Administrator
    let admin = await User.findOne({ email: 'admin@securetransfer.local' });
    if (!admin) {
      await User.create({
        name: 'Security Administrator',
        email: 'admin@securetransfer.local',
        password: 'Admin@12345',
        role: 'Administrator'
      });
    }

    // 2. Staff (Generic Corporate Account)
    let staff = await User.findOne({ email: 'staff@securetransfer.local' });
    if (!staff) {
      await User.create({
        name: 'Staff Operations',
        email: 'staff@securetransfer.local',
        password: 'Staff@12345',
        role: 'Staff'
      });
    }

    // 3. End User (Generic Client Account)
    let endUser = await User.findOne({ email: 'user@securetransfer.local' });
    if (!endUser) {
      await User.create({
        name: 'Standard User',
        email: 'user@securetransfer.local',
        password: 'User@12345',
        role: 'End User'
      });
    }

    // Clean up any legacy accounts with personal names
    await User.deleteMany({ email: { $in: ['samanvi@securetransfer.local', 'nikhil@securetransfer.local'] } });

    console.log('✅ Standard Accounts Active:');
    console.log('   👑 Admin:    admin@securetransfer.local (Pass: Admin@12345)');
    console.log('   💼 Staff:    staff@securetransfer.local (Pass: Staff@12345)');
    console.log('   👤 End User: user@securetransfer.local  (Pass: User@12345)');

    // Ensure default security policy exists
    const policy = await SecurityPolicy.findOne({ policyKey: 'global_policy' });
    if (!policy) {
      await SecurityPolicy.create({ policyKey: 'global_policy' });
      console.log('🛡️ Default security policy initialized.');
    }
  } catch (err) {
    console.error('Error during seed:', err.message);
  }
}

// Connect to MongoDB and start server
async function startServer() {
  try {
    console.log(`Connecting to MongoDB at ${config.mongodbUri}...`);
    await mongoose.connect(config.mongodbUri);
    console.log('✅ MongoDB connection established.');

    await seedDefaultUsers();

    server.listen(config.port, () => {
      console.log(`=======================================================`);
      console.log(`🚀 CipherDrop — Secure File Transfer & Threat Monitoring`);
      console.log(`🌐 Application running at: http://localhost:${config.port}`);
      console.log(`🔒 Encryption Engine: AES-256-GCM (Authenticated AEAD)`);
      console.log(`📡 Real-Time Threat Alerts: ws://localhost:${config.port}/ws/alerts`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
