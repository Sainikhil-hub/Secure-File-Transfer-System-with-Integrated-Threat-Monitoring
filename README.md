# CipherDrop — Enterprise Secure File Transfer System with Integrated Threat Monitoring

[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM%20AEAD-blue.svg)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![Database: MongoDB](https://img.shields.io/badge/Database-MongoDB%20Port%2027017-green.svg)](https://www.mongodb.com/)
[![Runtime: Node.js 24+](https://img.shields.io/badge/Runtime-Node.js%2024%2B-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](#license)

---

## 1. Project Overview

Organizations routinely need to share sensitive documents, customer datasets, and intellectual property. However, most legacy tools treat file security and access monitoring as disjointed concerns:
- **Encryption-only tools** (e.g., FileZilla, standard SFTP) encrypt files in transit, but fail to monitor who is attempting unauthorized access, guessing passwords, or tampering with stored data.
- **Network monitoring tools** (e.g., Wireshark) observe bulk packet traffic, but cannot inspect encrypted payloads or correlate application-level file events.

**CipherDrop** bridges this critical gap. It is a unified, web-based secure file transfer platform designed with an attractive, professional public SaaS interface. It combines **authenticated AES-256-GCM encryption** at rest with a **real-time threat monitoring engine** that detects brute-force login attempts, ciphertext tampering, abnormal download velocity spikes, and unauthorized file access.

```
+-----------------------------------------------------------------------------------+
|                         CipherDrop Responsive Web UI                              |
|  - 4-Step Guided Upload Wizard (End Users & Staff)                                |
|  - Real-Time Security Threat Center & Analytics (Administrator)                   |
|  - File Transfer Inbox & Outbox with Instant Stream Decryption                    |
|  - Mobile Responsive Navigation Drawer for Smartphones & Tablets                  |
+-----------------------------------------------------------------------------------+
                                    |  HTTPS (Port 5000) & WSS (/ws/alerts)
                                    v
+-----------------------------------------------------------------------------------+
|                        Node.js / Express Application Server                       |
|  +--------------------+  +----------------------+  +---------------------------+  |
|  |   Authentication   |  |   AES-256-GCM Engine |  |  Threat Monitoring Engine |  |
|  | - bcrypt (Salt 10) |  | - PBKDF2 (100k) DEKs |  | - Brute-force Lockout     |  |
|  | - JWT Tokens (24h) |  | - 12-byte IV & Auth  |  | - Tamper Auto-Quarantine  |  |
|  | - Role Enforcement |  | - SHA-256 Checksums  |  | - Download Velocity Spike |  |
|  +--------------------+  +----------------------+  +---------------------------+  |
+-----------------------------------------------------------------------------------+
             |                                                  |
             v                                                  v
+-------------------------------+             +-------------------------------------+
|   MongoDB Database (Port 27017)|             |   Encrypted Blob Storage (Local)    |
| - Users & Lockout State       |             | - uploads/encrypted/[fileId].enc    |
| - File Metadata (IV, Tag, Salt|             | - Zero plaintext written to disk    |
| - Share Records & Permissions |             +-------------------------------------+
| - Audit Activity Logs         |
| - Security Alerts & Policies  |
+-------------------------------+
```

---

## 2. Database & Technologies Used

| Layer | Technology | Details & Justification |
| :--- | :--- | :--- |
| **Database** | **MongoDB (Port 27017)** | High-performance document database using Mongoose ODM. Stores schemas for `Users`, `FileRecords` (metadata, IVs, auth tags, salts), `ShareRecords`, `ActivityLogs`, `Alerts`, and dynamic `SecurityPolicies`. |
| **Backend Runtime** | **Node.js (v24.16+)** | Asynchronous, event-driven JavaScript runtime supporting high-throughput file streams and cryptographic operations. |
| **Web Framework** | **Express (v5.3+)** | Secure RESTful APIs, static asset delivery, and role-based middleware. |
| **Real-Time Push** | **WebSockets (`ws` v8.22+)** | Sub-second WebSocket server (`/ws/alerts`) pushing real-time threat alerts and live activity logs to the Admin Dashboard without manual page refreshes (**REQ-10**). |
| **Cryptographic Engine** | **Node.js Native `crypto`** | Hardware-accelerated cryptographic primitives implementing **AES-256-GCM (AEAD)** with zero external proprietary dependencies. |
| **Password Security** | **`bcryptjs`** | Salted cryptographic password hashing with 10 salt rounds to defend against rainbow table and offline dictionary attacks. |
| **Session Security** | **JSON Web Tokens (`jsonwebtoken`)** | Stateless, cryptographically signed tokens containing user identity and role claims with 24-hour expiration. |
| **File Ingestion** | **`multer` (Memory Buffer)** | Streams incoming uploads into volatile memory; files are encrypted on the fly before touching disk storage (**REQ-2**). |
| **Frontend UI** | **HTML5, Tailwind CSS, Responsive ES6** | Modern, sleek SaaS interface with glassmorphism, responsive mobile hamburger drawer navigation, and accessible UX. |

---

## 3. Cryptographic Implementation: AES-256-GCM Deep Dive

### 1. Authenticated Encryption with Associated Data (AEAD)
Standard AES modes like AES-CBC or AES-CTR provide confidentiality, but **do not guarantee data integrity**, making them vulnerable to bit-flipping attacks. CipherDrop implements **AES-256 in Galois/Counter Mode (GCM)**, which delivers both:
- **Confidentiality:** 256-bit key encryption ensures the ciphertext cannot be read without the key.
- **Integrity & Authenticity:** Generates a 128-bit authentication tag (`authTag`). If even a single bit of the encrypted file is altered on disk, decryption immediately throws an error: `Unsupported state or unable to authenticate data`.

### 2. Envelope & Per-File Key Derivation
- Decryption keys are **never stored alongside the encrypted files** they protect.
- A 32-byte master key is stored securely in environment configuration.
- For every file transfer, the system generates a cryptographically secure random **32-byte salt** (`crypto.randomBytes(32)`).
- Using **PBKDF2-HMAC-SHA256 with 100,000 rounds**, a completely unique **256-bit Data Encryption Key (DEK)** is derived per file.
- A fresh, non-repeating **12-byte Initialization Vector (IV)** is generated for every encryption operation.

### 3. Zero Plaintext at Rest (**REQ-2**)
Files are ingested via in-memory streaming. Plaintext is **never written to the filesystem**. Only the resulting encrypted ciphertext (`uploads/encrypted/[fileId].enc`) is persisted.

### 4. Bit-for-Bit Integrity Checksum
Before encryption, an in-memory **SHA-256 checksum** is calculated on the plaintext. Upon decryption by the recipient, the SHA-256 hash of the decrypted stream is compared with the recorded checksum to guarantee 100% byte fidelity before delivery.

---

## 4. Integrated Threat Monitoring Engine

The threat engine continuously observes application events and enforces active countermeasures:

| Threat Pattern | Detection Logic | Countermeasure & Requirement |
| :--- | :--- | :--- |
| **Brute-Force Password Guessing** | Sliding-window tracker records consecutive failed logins per email/IP. | Once threshold is reached (default: 5 failures within 15 min), the account is locked for 15 minutes, and a **High-severity alert** is pushed in real-time (**REQ-5, REQ-6**). |
| **Ciphertext Tampering / Decryption Attack** | GCM authentication tag verification failure or checksum mismatch during download. | Logged as `DECRYPT_FAILURE`. If failures reach threshold (default: 3 in 5 min), the file is **automatically quarantined** to block further access, and a **Critical-severity alert** is broadcasted (**REQ-7, REQ-8**). |
| **Download Velocity Spike** | Sliding-window tracker observes rapid file download requests per user. | If a single user requests more than 8 downloads within 2 minutes, a **Medium-severity alert** is raised for abnormal data exfiltration (**REQ-9**). |
| **Unauthorized File Access** | User attempts to access a file without being the recorded uploader or recipient. | The download request is denied with `403 Forbidden`, logged as an `UNAUTHORIZED_ACCESS_ATTEMPT`, and a **High-severity alert** is generated (**REQ-9, REQ-15**). |
| **Executable / Disguised Malware Intercept** | File inspection module validates extensions against prohibited executables (`.exe`, `.bat`, `.cmd`, `.sh`, `.vbs`, etc.). | Upload is rejected immediately, preventing malware distribution through the platform. |

---

## 5. Role and Staff Approval Workflow

Public registration always creates an **End User** account. An End User may submit a Staff access request with their organizational details; an Administrator must manually verify and approve it. Staff receive a read-only, redacted security monitor and cannot access Administrator APIs or other users' private file contents.

The optional local-only demo accounts are created only when `NODE_ENV` is not `production` and `SEED_DEMO_USERS=true`. Never use, document, or deploy demo credentials in a public environment.

---

## 6. Installation & Running Instructions

### Prerequisites
1. **Node.js** (v18.x or v20+ / v24+) installed.
2. **MongoDB** service running locally on port `27017`.

### Step 1: Install Dependencies
```powershell
npm install
```

### Step 2: Environment Configuration
Create a local `.env` file. Secrets are intentionally not committed; generate unique values for every environment:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/secure_transfer_db
JWT_SECRET=<unique-48-byte-random-hex-value>
MASTER_ENCRYPTION_KEY=<unique-32-byte-random-hex-value>
NODE_ENV=development
UPLOAD_DIR=uploads/encrypted
MAX_FILE_SIZE_MB=100
SEED_DEMO_USERS=true
```

Generate each value privately with PowerShell (run the appropriate command once per secret):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For production, set `MONGODB_URI`, `JWT_SECRET`, and `MASTER_ENCRYPTION_KEY`. The application refuses to start without them. It also requires persistent S3-compatible storage:

```env
NODE_ENV=production
STORAGE_PROVIDER=s3
S3_BUCKET=your-private-bucket
S3_REGION=ap-south-1
S3_PREFIX=cipherdrop/encrypted
# AWS_ACCESS_KEY_ID=<least-privilege-access-key>
# AWS_SECRET_ACCESS_KEY=<least-privilege-secret-key>
# Optional for S3-compatible providers such as Cloudflare R2 or MinIO
# S3_ENDPOINT=https://...
# S3_FORCE_PATH_STYLE=true
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<unique-password-of-at-least-12-characters>
```

The bootstrap administrator is created only if it does not already exist. `SEED_DEMO_USERS=true` is supported only outside production and must never be set on Render. Attach least-privilege object-storage credentials through Render environment variables; the bucket must remain private. Production startup also refuses to run if it finds any legacy `@securetransfer.local` demo accounts—remove those documents or reset them before deployment.

### Step 3: Start the Application
```powershell
npm start
```

### Step 4: Open in Web Browser
Navigate in your desktop or mobile browser to:
```
http://localhost:5000
```

---

## 7. Interactive Evaluation Lab (How to Test)

The application provides an **Interactive Threat Simulation Lab** directly on the Admin Dashboard so reviewers can trigger real-time threat detection with a single click:

1. **Step-by-Step File Transfer Demo (4-Step Wizard):**
   - Click the **"💼 Staff"** persona button at the top bar.
   - Go to **Send Files**. Select any sample PDF, text, or image file.
   - Proceed to **Recipient** and select the standard user.
   - Review the encryption details and click **Encrypt & Send File**.
   - Switch persona to **"👤 User"**, navigate to **My Transfers**, and click **"Decrypt & Download"**.

2. **Testing Threat Scenarios (Admin Threat Center):**
   - Switch persona to **"👑 Admin"** and navigate to the **Threat Center** tab.
   - Click any scenario button inside the **Interactive Threat Simulation Lab**:
     * **1. Brute Force:** Simulates 5 failed logins against an account. The account is immediately locked, and a **High Alert** appears via WebSocket in real-time.
     * **2. Cipher Tamper:** Simulates corrupted ciphertext bytes on disk. The GCM authentication tag fails verification, the file is automatically quarantined, and a **Critical Alert** is raised.
     * **3. Unauthorized Download:** Simulates an unauthorized agent attempting to download a non-shared file. REQ-15 denies access, and a **High Alert** is recorded.
     * **4. Download Spike:** Simulates rapid mass downloading. The engine flags the abnormal velocity pattern.
     * **5. Executable Intercept:** Simulates an upload of a `.exe` file. The file inspection module intercepts and blocks the upload.

---

## 8. Automated Test Suites

```powershell
npm test
```
*Executes all security and integration tests.*
