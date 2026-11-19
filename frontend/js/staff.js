const staffPortal = {
  async loadRequestStatus() {
    const card = document.getElementById('staffRequestStatus');
    if (!card) return;
    try {
      const res = await api.getMyStaffRequests();
      const latest = res.requests[0];
      if (!latest) {
        card.innerHTML = '<p class="text-sm text-slate-500">You have not submitted a request yet.</p>';
        return;
      }
      const tone = latest.status === 'Approved' ? 'emerald' : latest.status === 'Rejected' ? 'rose' : 'amber';
      card.innerHTML = `<div class="rounded-xl border border-${tone}-200 bg-${tone}-50 p-4 text-sm text-${tone}-900"><strong>${latest.status}</strong><p class="mt-1">Submitted ${new Date(latest.createdAt).toLocaleString()}.</p>${latest.reviewNote ? `<p class="mt-1">Administrator note: ${this.escape(latest.reviewNote)}</p>` : ''}</div>`;
    } catch (err) {
      card.innerHTML = `<p class="text-sm text-rose-600">${this.escape(err.message)}</p>`;
    }
  },

  async submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api.requestStaffAccess({
        employeeId: form.employeeId.value,
        department: form.department.value,
        designation: form.designation.value,
        reason: form.reason.value
      });
      form.reset();
      app.showToast('Staff access request submitted for review.', 'success');
      this.loadRequestStatus();
    } catch (err) {
      app.showToast(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  },

  async loadMonitor() {
    const alerts = document.getElementById('staffMonitorAlerts');
    const logs = document.getElementById('staffMonitorLogs');
    if (!alerts || !logs) return;
    try {
      const res = await api.getStaffMonitor();
      alerts.innerHTML = res.alerts.length
        ? res.alerts.map(a => `<tr><td class="px-4 py-2 font-semibold">${this.escape(a.type)}</td><td class="px-4 py-2">${this.escape(a.severity)}</td><td class="px-4 py-2">${this.escape(a.status)}</td><td class="px-4 py-2">${new Date(a.createdAt).toLocaleString()}</td></tr>`).join('')
        : '<tr><td colspan="4" class="px-4 py-5 text-center text-slate-400">No alerts recorded.</td></tr>';
      logs.innerHTML = res.logs.length
        ? res.logs.map(l => `<tr><td class="px-4 py-2">${new Date(l.timestamp).toLocaleString()}</td><td class="px-4 py-2 font-semibold">${this.escape(l.action)}</td><td class="px-4 py-2">${this.escape(l.severity)}</td></tr>`).join('')
        : '<tr><td colspan="3" class="px-4 py-5 text-center text-slate-400">No activity recorded.</td></tr>';
    } catch (err) {
      alerts.innerHTML = `<tr><td colspan="4" class="px-4 py-5 text-center text-rose-600">${this.escape(err.message)}</td></tr>`;
    }
  },

  escape(value) {
    const element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
  }
};
