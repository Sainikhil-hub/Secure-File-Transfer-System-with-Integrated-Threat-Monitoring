/**
 * Transfers Manager: Received (Inbox) & Sent (Outbox)
 */
const transfersManager = {
  currentTab: 'received',
  files: [],

  async setTab(tab) {
    this.currentTab = tab;

    const tabRec = document.getElementById('tab-received');
    const tabSent = document.getElementById('tab-sent');
    const userCol = document.getElementById('th-user-col');

    if (tab === 'received') {
      tabRec.className = 'px-4 py-1.5 rounded-md text-sm font-semibold bg-blue-600 text-white transition';
      tabSent.className = 'px-4 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 transition';
      userCol.textContent = 'Sender';
    } else {
      tabSent.className = 'px-4 py-1.5 rounded-md text-sm font-semibold bg-blue-600 text-white transition';
      tabRec.className = 'px-4 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 transition';
      userCol.textContent = 'Recipient';
    }

    await this.load();
  },

  async load() {
    const tbody = document.getElementById('transfersTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400">Loading transfers...</td></tr>';

    if (!api.getToken()) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-slate-500">Please sign in to view your transfers.</td></tr>';
      return;
    }

    try {
      const res = this.currentTab === 'received' 
        ? await api.getReceivedFiles() 
        : await api.getSentFiles();

      this.files = res.files || [];
      this.renderTable(this.files);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-rose-600">Failed to load files: ${err.message}</td></tr>`;
    }
  },

  renderTable(files) {
    const tbody = document.getElementById('transfersTableBody');

    if (files.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-400">
            <div class="flex flex-col items-center justify-center space-y-2">
              <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
              </svg>
              <span>No ${this.currentTab === 'received' ? 'received' : 'sent'} files found.</span>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = files.map(f => {
      const isQuarantined = f.status === 'quarantined';
      const userDisplay = this.currentTab === 'received'
        ? `<div><span class="font-semibold text-slate-900">${f.senderName}</span><br><span class="text-slate-400 text-[10px]">${f.senderEmail}</span></div>`
        : `<div><span class="font-semibold text-slate-900">${f.recipientName}</span><br><span class="text-slate-400 text-[10px]">${f.recipientEmail}</span></div>`;

      const statusBadge = isQuarantined
        ? `<span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-semibold">Quarantined</span>`
        : `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-medium">AES-256 Encrypted</span>`;

      const dateStr = new Date(f.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      let actionBtn = '';
      if (this.currentTab === 'received') {
        if (isQuarantined) {
          actionBtn = `<span class="text-[11px] text-rose-600 font-medium">Access Blocked</span>`;
        } else {
          actionBtn = `
            <button onclick="transfersManager.download('${f.fileUuid}', '${f.fileName}')" class="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition shadow-sm inline-flex items-center space-x-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              <span>Decrypt &amp; Download</span>
            </button>
          `;
        }
      } else {
        // Sent tab
        actionBtn = `
          <div class="flex items-center justify-end space-x-2">
            <span class="text-[11px] text-slate-500">${f.downloadCount || 0} downloads</span>
            ${!isQuarantined ? `
              <button onclick="transfersManager.quarantine('${f.fileUuid}')" class="text-[10px] text-rose-600 hover:underline">
                Lock/Quarantine
              </button>
            ` : `
              <button onclick="transfersManager.release('${f.fileUuid}')" class="text-[10px] text-blue-600 hover:underline">
                Release
              </button>
            `}
          </div>
        `;
      }

      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="px-6 py-3.5 font-medium text-slate-900">
            <div class="flex items-center space-x-2">
              <span class="text-blue-600 font-mono text-xs">📄</span>
              <span class="truncate max-w-[200px]" title="${f.fileName}">${f.fileName}</span>
            </div>
            <div class="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-[250px]" title="SHA-256: ${f.checksum}">
              Hash: ${f.checksum ? f.checksum.substring(0, 16) + '...' : ''}
            </div>
          </td>
          <td class="px-6 py-3.5">${userDisplay}</td>
          <td class="px-6 py-3.5 text-slate-500">${this.formatBytes(f.fileSize)}</td>
          <td class="px-6 py-3.5">${statusBadge}</td>
          <td class="px-6 py-3.5 text-slate-500">${dateStr}</td>
          <td class="px-6 py-3.5 text-right">${actionBtn}</td>
        </tr>
      `;
    }).join('');
  },

  filterTable() {
    const term = (document.getElementById('transferSearchInput').value || '').toLowerCase().trim();
    if (!term) {
      this.renderTable(this.files);
      return;
    }

    const filtered = this.files.filter(f => {
      return (
        (f.fileName && f.fileName.toLowerCase().includes(term)) ||
        (f.senderName && f.senderName.toLowerCase().includes(term)) ||
        (f.senderEmail && f.senderEmail.toLowerCase().includes(term)) ||
        (f.recipientName && f.recipientName.toLowerCase().includes(term)) ||
        (f.recipientEmail && f.recipientEmail.toLowerCase().includes(term))
      );
    });

    this.renderTable(filtered);
  },

  async download(fileUuid, fileName) {
    app.showToast('Authenticating & decrypting stream...', 'info');
    try {
      await api.downloadFile(fileUuid, fileName);
      app.showToast(`Decrypted "${fileName}" successfully!`, 'success');
      this.load(); // Refresh download counter
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async quarantine(fileUuid) {
    if (!confirm('Are you sure you want to quarantine this file? Access will be blocked immediately.')) return;
    try {
      await api.toggleQuarantine(fileUuid, 'quarantine', 'Quarantined by owner');
      app.showToast('File has been placed in security quarantine.', 'warning');
      this.load();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async release(fileUuid) {
    try {
      await api.toggleQuarantine(fileUuid, 'release');
      app.showToast('File released from quarantine.', 'success');
      this.load();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};
