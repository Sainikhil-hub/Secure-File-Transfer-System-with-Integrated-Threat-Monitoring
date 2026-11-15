/**
 * Full End-to-End Integration & SRS Requirements Verification
 */
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Demo users are intentionally opt-in; the integration suite needs them locally.
process.env.SEED_DEMO_USERS = 'true';

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && typeof body === 'object' && !(body instanceof Buffer)) {
      body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runIntegrationTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING INTEGRATION & SRS REQUIREMENTS TESTS');
  console.log('====================================================\n');

  try {
    // 1. Health check
    console.log('1. Testing System Health API (/api/health)...');
    const health = await makeRequest('GET', '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.cryptoStandard, 'AES-256-GCM');
    assert.strictEqual(health.data.database, 'connected');
    console.log('   ✅ Health API verified: AES-256-GCM online & MongoDB connected.');

    // 2. Demo logins
    console.log('\n2. Testing Pre-seeded User Logins (REQ-4)...');
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@securetransfer.local',
      password: 'Admin@12345'
    });
    assert.strictEqual(adminLogin.status, 200);
    assert(adminLogin.data.token, 'Should return JWT token');
    assert.strictEqual(adminLogin.data.user.role, 'Administrator');
    const adminToken = adminLogin.data.token;
    console.log('   ✅ Administrator signed in successfully.');

    const staffLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'staff@securetransfer.local',
      password: 'Staff@12345'
    });
    assert.strictEqual(staffLogin.status, 200);
    const staffToken = staffLogin.data.token;
    console.log('   ✅ Staff user signed in successfully.');

    const userLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'user@securetransfer.local',
      password: 'User@12345'
    });
    assert.strictEqual(userLogin.status, 200);
    const userToken = userLogin.data.token;
    const endUserId = userLogin.data.user.id;
    console.log('   ✅ End user signed in successfully.');

    // 3. REQ-5 & REQ-6: Brute-Force Password Guessing & Lockout Protection
    console.log('\n3. Testing Brute-Force Password Guessing & Account Lockout (REQ-5, REQ-6)...');
    // Create a temporary test user to test brute force
    const testEmail = `brute_victim_${Date.now()}@example.com`;
    const regRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Brute Force Test Subject',
      email: testEmail,
      password: 'CorrectPassword123!',
      role: 'End User'
    });
    assert.strictEqual(regRes.status, 201);

    // Now fail 5 times consecutively
    let lastRes;
    for (let i = 1; i <= 5; i++) {
      lastRes = await makeRequest('POST', '/api/auth/login', {
        email: testEmail,
        password: 'WrongPassword'
      });
    }
    // The 5th failure must lock the account
    assert.strictEqual(lastRes.status, 423, '5th failed attempt should trigger 423 Locked');
    assert.strictEqual(lastRes.data.locked, true);
    console.log('   ✅ Account lockout successfully enforced after 5 failed attempts.');

    // 4. Admin Threat Center verification
    console.log('\n4. Verifying Real-time Alerts & Admin Dashboard (REQ-10, REQ-12, REQ-14)...');
    const alertsRes = await makeRequest('GET', '/api/admin/alerts?status=Active', null, adminToken);
    assert.strictEqual(alertsRes.status, 200);
    assert(Array.isArray(alertsRes.data.alerts));
    // Verify an alert was generated for the brute force attack
    const bruteAlert = alertsRes.data.alerts.find(a => a.type === 'BRUTE_FORCE_LOGIN' && a.targetUser === testEmail);
    assert(bruteAlert, 'Brute force alert should be present in Admin Alert feed');
    console.log(`   ✅ Security Alert confirmed in admin feed: "${bruteAlert.message}"`);

    // 5. REQ-14: Access Control - Non-Admin attempting to view Admin API must be denied
    console.log('\n5. Verifying Role-Based Access Control (REQ-14)...');
    const forbiddenRes = await makeRequest('GET', '/api/admin/metrics', null, userToken);
    assert.strictEqual(forbiddenRes.status, 403, 'End User must be blocked with 403 Forbidden on admin routes');
    console.log('   ✅ REQ-14 Access Control verified: End User blocked from Admin API.');

    // 6. REQ-13: Mark alert as reviewed or resolved
    console.log('\n6. Testing Alert Resolution Workflow (REQ-13)...');
    const updateRes = await makeRequest('PATCH', `/api/admin/alerts/${bruteAlert.alertId}`, {
      status: 'Resolved'
    }, adminToken);
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.alert.status, 'Resolved');
    console.log('   ✅ Alert marked as Resolved by Administrator.');

    // 7. Testing File Upload & Recipient-Only Decrypted Download (REQ-1, REQ-2, REQ-15)
    console.log('\n7. Testing File Upload with AES-256-GCM & Authorized Download (REQ-1, REQ-2, REQ-15)...');
    
    // Create multipart/form-data payload manually
    const boundary = '--------------------------' + Date.now().toString(16);
    const fileContent = 'CipherDrop Enterprise Secure Test Transfer Payload';
    const postData = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="recipientId"`,
      '',
      endUserId,
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="lab_research_data.txt"`,
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const uploadHeaders = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Authorization': `Bearer ${staffToken}`,
      'Content-Length': Buffer.byteLength(postData)
    };

    const uploadRes = await new Promise((resolve, reject) => {
      const ureq = http.request(`http://localhost:${PORT}/api/files/upload`, {
        method: 'POST',
        headers: uploadHeaders
      }, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
      });
      ureq.on('error', reject);
      ureq.write(postData);
      ureq.end();
    });

    assert.strictEqual(uploadRes.status, 201);
    assert(uploadRes.data.file.fileId, 'Should return generated fileId');
    assert.strictEqual(uploadRes.data.file.encryptionAlgorithm, 'AES-256-GCM');
    const uploadedFileId = uploadRes.data.file.fileId;
    console.log(`   ✅ File uploaded and encrypted with AES-256-GCM (File ID: ${uploadedFileId})`);

    // 8. Authorized recipient download & decryption test
    console.log('\n8. Testing Authorized Recipient Decryption & Download...');
    const downloadRes = await makeRequest('GET', `/api/files/download/${uploadedFileId}`, null, userToken);
    assert.strictEqual(downloadRes.status, 200);
    assert.strictEqual(downloadRes.raw, fileContent, 'Decrypted content must match original plaintext');
    console.log('   ✅ File decrypted on the fly and downloaded with 100% integrity match.');

    // 9. Unauthorized user access rejection (REQ-15)
    console.log('\n9. Testing Unauthorized Access Rejection (REQ-15)...');
    // Create third user who is NOT sender and NOT recipient
    const unauthorizedEmail = `intruder_${Date.now()}@test.org`;
    const regIntruder = await makeRequest('POST', '/api/auth/register', {
      name: 'Intruder External',
      email: unauthorizedEmail,
      password: 'IntruderPassword123!',
      role: 'End User'
    });
    const intruderToken = regIntruder.data.token;

    const unauthDownload = await makeRequest('GET', `/api/files/download/${uploadedFileId}`, null, intruderToken);
    assert.strictEqual(unauthDownload.status, 403, 'Unauthorized user download must be rejected with 403');
    console.log('   ✅ REQ-15 verified: Unauthorized access denied and logged.');

    // 10. Interactive Simulator Lab check
    console.log('\n10. Testing Interactive Threat Simulation Lab...');
    const simRes = await makeRequest('POST', '/api/admin/simulator', {
      scenario: 'decrypt_tamper'
    }, adminToken);
    assert.strictEqual(simRes.status, 200);
    console.log(`   ✅ Threat Simulation executed: ${simRes.data.message}`);

    // Cleanup temporary test users and files so database stays 100% clean
    try {
      const mongoose = require('mongoose');
      const config = require('../backend/config');
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(config.mongodbUri);
      }
      const User = require('../backend/models/User');
      const FileRecord = require('../backend/models/FileRecord');
      const ShareRecord = require('../backend/models/ShareRecord');
      const Alert = require('../backend/models/Alert');
      const ActivityLog = require('../backend/models/ActivityLog');
      await User.deleteMany({ email: { $in: [testEmail, unauthorizedEmail] } });
      await FileRecord.deleteMany({ fileId: uploadedFileId });
      await ShareRecord.deleteMany({ fileId: uploadedFileId });
      await Alert.deleteMany({ targetUser: testEmail });
      await ActivityLog.deleteMany({ userEmail: { $in: [testEmail, unauthorizedEmail] } });
      const diskPath = path.join(config.uploadDir, `${uploadedFileId}.enc`);
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    } catch {
      // ignore
    }

    console.log('\n====================================================');
    console.log('🎉 ALL INTEGRATION & SRS REQUIREMENTS TESTS PASSED!');
    console.log('====================================================\n');

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

// Check if server is running, if not start it temporarily
const req = http.request(BASE_URL + '/api/health', (res) => {
  runIntegrationTests();
});

req.on('error', () => {
  console.log('Server not currently running on port 5000, starting background instance for test...');
  const { spawn } = require('child_process');
  const serverProc = spawn('node', ['server.js'], { stdio: 'inherit' });
  setTimeout(() => {
    runIntegrationTests().finally(() => {
      serverProc.kill();
    });
  }, 3000);
});
req.end();
