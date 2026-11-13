/**
 * API Client & Network Communications
 */
const api = {
  getToken() {
    return localStorage.getItem('cipherdrop_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('cipherdrop_token', token);
    } else {
      localStorage.removeItem('cipherdrop_token');
    }
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('cipherdrop_user'));
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('cipherdrop_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('cipherdrop_user');
    }
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers
    };

    const response = await fetch(endpoint, config);

    // If binary download stream
    if (response.headers.get('content-disposition')) {
      return response;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Network request failed');
    }
    return data;
  },

  // Auth Endpoints
  login(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  register(name, email, password, role) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });
  },

  quickDemoLogin(role) {
    return this.request('/api/auth/quick-demo-login', {
      method: 'POST',
      body: JSON.stringify({ role })
    });
  },

  getProfile() {
    return this.request('/api/auth/me');
  },

  getUsers() {
    return this.request('/api/auth/users');
  },

  // File Endpoints
  uploadFile(formData) {
    return this.request('/api/files/upload', {
      method: 'POST',
      body: formData
    });
  },

  getReceivedFiles() {
    return this.request('/api/files/received');
  },

  getSentFiles() {
    return this.request('/api/files/sent');
  },

  async downloadFile(fileUuid, fileName) {
    const token = this.getToken();
    const url = `/api/files/download/${fileUuid}?token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || 'Decryption failed or access was denied');
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);
  },

  toggleQuarantine(fileUuid, action, reason) {
    return this.request(`/api/files/quarantine/${fileUuid}`, {
      method: 'POST',
      body: JSON.stringify({ action, reason })
    });
  },

  // Admin Endpoints
  getMetrics() {
    return this.request('/api/admin/metrics');
  },

  getAlerts(status = 'Active', severity = 'all') {
    return this.request(`/api/admin/alerts?status=${status}&severity=${severity}`);
  },

  updateAlertStatus(alertId, status) {
    return this.request(`/api/admin/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  getLogs(action = 'all', severity = 'all') {
    return this.request(`/api/admin/logs?action=${action}&severity=${severity}`);
  },

  purge(target) {
    return this.request('/api/admin/purge', {
      method: 'DELETE',
      body: JSON.stringify({ target })
    });
  },

  getAdminUsers() {
    return this.request('/api/admin/users');
  },

  unlockUser(userId) {
    return this.request(`/api/admin/users/unlock/${userId}`, {
      method: 'POST'
    });
  },

  changeUserRole(userId, role) {
    return this.request(`/api/admin/users/role/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ role })
    });
  },

  runSimulation(scenario) {
    return this.request('/api/admin/simulator', {
      method: 'POST',
      body: JSON.stringify({ scenario })
    });
  },

  getPolicy() {
    return this.request('/api/config/policy');
  },

  savePolicy(policy) {
    return this.request('/api/config/policy', {
      method: 'PUT',
      body: JSON.stringify(policy)
    });
  }
};
