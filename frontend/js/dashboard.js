/**
 * Admin Security Threat Center & Analytics Dashboard
 */
const adminDashboard = {
  socket: null,
  alerts: [],
  logs: [],
  users: [],
  staffRequests: [],

  init() {
    this.connectWebSocket();
  },

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = api.getToken() || '';
    const wsUrl = `${protocol}//${window.location.host}/ws/alerts?token=${encodeURIComponent(token)}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        const statusEl = document.getElementById('liveMonitorStatus');
        if (statusEl) statusEl.classList.remove('hidden');
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleSocketEvent(payload);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      this.socket.onclose = () => {
        // Reconnect after 4s
        setTimeout(() => this.connectWebSocket(), 4000);
      };

      this.socket.onerror = () => {
        if (this.socket) this.socket.close();
      };
    } catch (err) {
      console.warn('WebSocket connection not initialized:', err.message);
    }
  },

  handleSocketEvent(payload) {
    if (payload.type === 'SECURITY_ALERT') {
      const alert = payload.data;
      app.showToast(`🚨 [${alert.severity}] ${alert.message}`, alert.severity === 'Critical' ? 'error' : 'warning');
      
      // Prepend alert to live list if admin view is open
      this.alerts.unshift(alert);
      this.renderAlerts(this.alerts);
      this.loadMetrics();
    } else if (payload.type === 'ACTIVITY_LOG') {
      // Append to live logs if admin view is open
      this.logs.unshift(payload.data);
      if (this.logs.length > 100) this.logs.pop();
      this.renderLogs(this.logs);
      this.loadMetrics();
    }
  },

  async refreshAll() {
    if (!api.getToken()) return;
    const user = api.getUser();
    if (!user || user.role !== 'Administrator') return;

    await Promise.all([
      this.loadMetrics(),
      this.loadAlerts(),
      this.loadLogs(),
      this.loadUsers(),
      this.loadPolicy(),
      this.loadStaffRequests()
    ]);
  },

  async loadMetrics() {
    try {
      const res = await api.getMetrics();
      const m = res.metrics;

      document.getElementById('kpi-totalFiles').textContent = m.totalFiles;
      document.getElementById('kpi-activeThreats').textContent = m.activeAlerts;
      document.getElementById('kpi-criticalCount').textContent = `${m.severityCounts.critical} Critical`;
      document.getElementById('kpi-totalUsers').textContent = m.totalUsers;
      document.getElementById('kpi-lockedUsers').textContent = `${m.lockedUsers} Locked`;
      document.getElementById('kpi-totalLogs').textContent = m.totalLogs;
      document.getElementById('alertsCountBadge').textContent = `${m.activeAlerts} Active`;
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  },

  async loadAlerts() {
    const container = document.getElementById('alertsFeedContainer');
    const status = document.getElementById('alertStatusFilter').value;
    const severity = document.getElementById('alertSeverityFilter').value;

    try {
      const res = await api.getAlerts(status, severity);
      this.alerts = res.alerts || [];
      this.renderAlerts(this.alerts);
    } catch (err) {
      container.innerHTML = `<p class="text-xs text-rose-600 py-4">Error loading alerts: ${err.message}</p>`;
    }
  },

  renderAlerts(alerts) {
    const container = document.getElementById('alertsFeedContainer');

    if (alerts.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-slate-400">
          <svg class="w-8 h-8 mx-auto text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-xs mt-2 font-medium text-slate-600">All clear! No security alerts matching this filter.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = alerts.map(a => {
      let badgeClass = 'badge-medium';
      if (a.severity === 'Critical') badgeClass = 'badge-critical';
      else if (a.severity === 'High') badgeClass = 'badge-high';
      else if (a.severity === 'Low') badgeClass = 'badge-low';

      const timeAgo = this.formatTimeAgo(new Date(a.createdAt));

      return `
        <div class="pt-3 first:pt-0 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeClass}">
                ${a.severity}
              </span>
              <span class="font-mono text-xs font-semibold text-slate-800">${a.type}</span>
            </div>
            <span class="text-[11px] text-slate-400 whitespace-nowrap">${timeAgo}</span>
          </div>

          <p class="text-xs text-slate-700 leading-relaxed font-sans">${a.message}</p>

          <div class="flex items-center justify-between pt-1 text-[11px] text-slate-500">
            <div class="flex items-center space-x-3 font-mono text-[10px]">
              ${a.targetUser ? `<span>User: <strong class="text-slate-700">${a.targetUser}</strong></span>` : ''}
              ${a.ipAddress ? `<span>IP: ${a.ipAddress}</span>` : ''}
              <span>Status: <strong class="${a.status === 'Active' ? 'text-rose-600' : 'text-emerald-600'}">${a.status}</strong></span>
            </div>

            <div class="flex items-center space-x-2">
              ${a.status === 'Active' ? `
                <button onclick="adminDashboard.updateAlertStatus('${a.alertId}', 'Reviewed')" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition">
                  Mark Reviewed
                </button>
                <button onclick="adminDashboard.updateAlertStatus('${a.alertId}', 'Resolved')" class="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium border border-emerald-200 transition">
                  Resolve
                </button>
              ` : a.status === 'Reviewed' ? `
                <button onclick="adminDashboard.updateAlertStatus('${a.alertId}', 'Resolved')" class="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium border border-emerald-200 transition">
                  Resolve
                </button>
              ` : `
                <span class="text-[10px] text-slate-400">Resolved by ${a.reviewedBy || 'Admin'}</span>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async updateAlertStatus(alertId, status) {
    try {
      await api.updateAlertStatus(alertId, status);
      app.showToast(`Alert updated to ${status}.`, 'success');
      this.loadAlerts();
      this.loadMetrics();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadLogs() {
    const tbody = document.getElementById('auditLogsTableBody');
    const action = document.getElementById('logActionFilter').value;

    try {
      const res = await api.getLogs(action, 'all');
      this.logs = res.logs || [];
      this.renderLogs(this.logs);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-rose-600 text-center">Failed to load logs: ${err.message}</td></tr>`;
    }
  },

  renderLogs(logs) {
    const tbody = document.getElementById('auditLogsTableBody');

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">No activity logs recorded.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let severityClass = 'text-slate-600';
      if (l.severity === 'critical') severityClass = 'text-rose-600 font-bold';
      else if (l.severity === 'high') severityClass = 'text-amber-700 font-semibold';
      else if (l.severity === 'warning') severityClass = 'text-amber-600';

      const timeStr = new Date(l.timestamp).toLocaleTimeString();

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="px-4 py-2 text-slate-500 whitespace-nowrap">${timeStr}</td>
          <td class="px-4 py-2 text-slate-800 font-medium truncate max-w-[150px]">${l.userEmail || 'system'}</td>
          <td class="px-4 py-2 ${severityClass}">${l.action}</td>
          <td class="px-4 py-2 text-slate-400">${l.ipAddress || '127.0.0.1'}</td>
          <td class="px-4 py-2 text-slate-600 truncate max-w-[130px]">${l.targetFileName || l.targetFileId || '-'}</td>
          <td class="px-4 py-2 text-slate-500 truncate max-w-[200px]" title='${JSON.stringify(l.details)}'>
            ${JSON.stringify(l.details || {})}
          </td>
        </tr>
      `;
    }).join('');
  },

  async loadUsers() {
    const tbody = document.getElementById('userManagementTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-slate-400">Loading users...</td></tr>';

    try {
      const res = await api.getAdminUsers();
      this.users = res.users || [];

      tbody.innerHTML = this.users.map(u => {
        const isLocked = u.isLocked;
        const statusBadge = isLocked
          ? `<span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-bold">Locked Out</span>`
          : `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-medium">Active (${u.failedAttempts || 0} failed)</span>`;

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="px-6 py-3 font-semibold text-slate-900">${u.name}</td>
            <td class="px-6 py-3 text-slate-600 font-mono text-[11px]">${u.email}</td>
            <td class="px-6 py-3"><span class="font-medium">${u.role}</span></td>
            <td class="px-6 py-3">${statusBadge}</td>
            <td class="px-6 py-3 text-right">
              ${u.role === 'Staff' ? `
                <button onclick="adminDashboard.changeRole('${u.id}', 'End User')" class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded transition shadow-sm">Revoke Staff</button>
              ` : isLocked ? `
                <button onclick="adminDashboard.unlockUser('${u.id}')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded transition shadow-sm">
                  Unlock Account
                </button>
              ` : `
                <span class="text-slate-400 text-xs">—</span>
              `}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-rose-600">Failed to load users: ${err.message}</td></tr>`;
    }
  },

  async unlockUser(userId) {
    try {
      await api.unlockUser(userId);
      app.showToast('Account unlocked successfully.', 'success');
      this.loadUsers();
      this.loadMetrics();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async changeRole(userId, newRole) {
    try {
      await api.changeUserRole(userId, newRole);
      app.showToast(`User role updated to ${newRole}.`, 'success');
      this.loadUsers();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async loadStaffRequests() {
    const tbody = document.getElementById('staffRequestsTableBody');
    if (!tbody) return;
    try {
      const res = await api.getStaffRequests('Pending');
      this.staffRequests = res.requests || [];
      if (!this.staffRequests.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-6 text-center text-slate-400">No pending Staff access requests.</td></tr>';
        return;
      }
      tbody.innerHTML = this.staffRequests.map(r => `
        <tr class="border-t border-slate-100 align-top">
          <td class="px-5 py-3 font-semibold">${this.escapeHtml(r.fullName)}<div class="text-[10px] font-normal text-slate-500">${this.escapeHtml(r.email)}</div></td>
          <td class="px-5 py-3">${this.escapeHtml(r.employeeId)}</td>
          <td class="px-5 py-3">${this.escapeHtml(r.department)}</td>
          <td class="px-5 py-3">${this.escapeHtml(r.designation)}</td>
          <td class="px-5 py-3 max-w-xs whitespace-normal">${this.escapeHtml(r.reason)}</td>
          <td class="px-5 py-3 text-slate-500">${new Date(r.createdAt).toLocaleDateString()}</td>
          <td class="px-5 py-3 whitespace-nowrap space-x-1"><button onclick="adminDashboard.decideStaffRequest('${r.requestId}', 'Approved')" class="px-2 py-1 bg-emerald-600 text-white rounded">Approve</button><button onclick="adminDashboard.decideStaffRequest('${r.requestId}', 'Rejected')" class="px-2 py-1 bg-rose-600 text-white rounded">Reject</button></td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-6 text-center text-rose-600">${this.escapeHtml(err.message)}</td></tr>`;
    }
  },

  async decideStaffRequest(requestId, decision) {
    const reviewNote = window.prompt(`Optional note for this ${decision.toLowerCase()} decision:`) || '';
    try {
      await api.decideStaffRequest(requestId, decision, reviewNote);
      app.showToast(`Staff request ${decision.toLowerCase()}.`, 'success');
      this.loadStaffRequests();
      this.loadUsers();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
  },

  async loadPolicy() {
    try {
      const res = await api.getPolicy();
      const p = res.policy;
      document.getElementById('polMaxLogins').value = p.maxFailedLogins;
      document.getElementById('polLockoutMins').value = p.lockoutDurationMinutes;
      document.getElementById('polMaxDecrypts').value = p.maxFailedDecrypts;
      document.getElementById('polMaxDownloads').value = p.maxDownloadsPerWindow;
    } catch (err) {
      console.error('Error loading policy:', err);
    }
  },

  async savePolicy(e) {
    e.preventDefault();
    try {
      const payload = {
        maxFailedLogins: Number(document.getElementById('polMaxLogins').value),
        lockoutDurationMinutes: Number(document.getElementById('polLockoutMins').value),
        maxFailedDecrypts: Number(document.getElementById('polMaxDecrypts').value),
        maxDownloadsPerWindow: Number(document.getElementById('polMaxDownloads').value)
      };

      await api.savePolicy(payload);
      app.showToast('Security thresholds updated successfully.', 'success');
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async purge(target) {
    if (!confirm(`Are you sure you want to purge ${target}? This cannot be undone.`)) return;
    try {
      await api.purge(target);
      app.showToast(`Purged ${target} successfully.`, 'info');
      this.refreshAll();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async runSimulation(scenario) {
    app.showToast(`Executing threat scenario: ${scenario}...`, 'info');
    try {
      const res = await api.runSimulation(scenario);
      app.showToast(res.message, 'warning');
      this.refreshAll();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }
};
