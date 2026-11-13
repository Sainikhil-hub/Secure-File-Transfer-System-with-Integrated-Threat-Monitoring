const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('../backend/config');

async function cleanData() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to DB');

  const User = require('../backend/models/User');
  const FileRecord = require('../backend/models/FileRecord');
  const ShareRecord = require('../backend/models/ShareRecord');
  const ActivityLog = require('../backend/models/ActivityLog');
  const Alert = require('../backend/models/Alert');

  const legitimateEmails = [
    'admin@securetransfer.local',
    'staff@securetransfer.local',
    'user@securetransfer.local',
    'sainikhil@gmail.com',
    'cheedallasainikhil@gmail.com',
    'sirisainikhil@gmail.com'
  ];

  // 1. Delete all fake / test / brute-force accounts
  const delUsers = await User.deleteMany({
    email: { $nin: legitimateEmails }
  });
  console.log(`Deleted fake users: ${delUsers.deletedCount}`);

  // Also unlock any locked accounts
  await User.updateMany({}, {
    $set: { failedLoginAttempts: 0, lockoutUntil: null }
  });

  // 2. Clear all fake / test file transfers
  const delFiles = await FileRecord.deleteMany({});
  console.log(`Deleted fake files from DB: ${delFiles.deletedCount}`);

  const delShares = await ShareRecord.deleteMany({});
  console.log(`Deleted fake shares: ${delShares.deletedCount}`);

  // 3. Clear activity logs and test alerts
  const delLogs = await ActivityLog.deleteMany({});
  console.log(`Deleted activity logs: ${delLogs.deletedCount}`);

  const delAlerts = await Alert.deleteMany({});
  console.log(`Deleted alerts: ${delAlerts.deletedCount}`);

  // 4. Delete physical encrypted files from disk
  const uploadDir = config.uploadDir;
  if (fs.existsSync(uploadDir)) {
    const diskFiles = fs.readdirSync(uploadDir);
    for (const f of diskFiles) {
      fs.unlinkSync(path.join(uploadDir, f));
    }
    console.log(`Cleaned ${diskFiles.length} files from disk directory: ${uploadDir}`);
  }

  const remainingUsers = await User.find({}, 'name email role');
  console.log('✅ Clean legitimate users in database:');
  console.log(remainingUsers);

  await mongoose.disconnect();
}

cleanData().catch(err => {
  console.error('Clean error:', err);
  process.exit(1);
});
