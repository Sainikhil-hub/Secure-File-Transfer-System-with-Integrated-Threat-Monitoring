const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const websocketService = require('./services/websocketService');

// Models for initialization
const User = require('./models/User');
const SecurityPolicy = require('./models/SecurityPolicy');

const legacyDemoEmails = [
  'admin@securetransfer.local',
  'staff@securetransfer.local',
  'user@securetransfer.local'
];

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

async function ensureSecurityPolicy() {
  const policy = await SecurityPolicy.findOne({ policyKey: 'global_policy' });
  if (!policy) {
    await SecurityPolicy.create({ policyKey: 'global_policy' });
    console.log('🛡️ Default security policy initialized.');
  }
}

// Demo accounts are deliberately opt-in and are never created in production.
async function initializeAccounts() {
  try {
    // Never make a production database containing known demo credentials reachable.
    if (config.isProduction) {
      const legacyAccountCount = await User.countDocuments({ email: { $in: legacyDemoEmails } });
      if (legacyAccountCount > 0) {
        throw new Error(
          'Legacy demo accounts were found. Remove or reset admin@securetransfer.local, staff@securetransfer.local, and user@securetransfer.local before deploying.'
        );
      }
    }

    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if ((bootstrapEmail && !bootstrapPassword) || (!bootstrapEmail && bootstrapPassword)) {
      throw new Error('Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or neither.');
    }

    if (bootstrapEmail && bootstrapPassword) {
      if (bootstrapPassword.length < 12) {
        throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long.');
      }
      const admin = await User.findOne({ email: bootstrapEmail });
      if (!admin) {
        await User.create({
          name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Security Administrator',
          email: bootstrapEmail,
          password: bootstrapPassword,
          role: 'Administrator'
        });
        console.log(`Bootstrap administrator created: ${bootstrapEmail}`);
      }
    }

    if (!config.isProduction && process.env.SEED_DEMO_USERS === 'true') {
      const demoUsers = [
        ['Security Administrator', 'admin@securetransfer.local', 'Admin@12345', 'Administrator'],
        ['Staff Operations', 'staff@securetransfer.local', 'Staff@12345', 'Staff'],
        ['Standard User', 'user@securetransfer.local', 'User@12345', 'End User']
      ];
      for (const [name, email, password, role] of demoUsers) {
        if (!await User.findOne({ email })) await User.create({ name, email, password, role });
      }
      console.warn('Demo accounts enabled for development only; do not use their credentials outside a local test environment.');
    }

    await ensureSecurityPolicy();
  } catch (err) {
    throw new Error(`Account initialization failed: ${err.message}`);
  }
}

// Connect to MongoDB and start server
async function startServer() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongodbUri);
    console.log('✅ MongoDB connection established.');

    await initializeAccounts();

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
