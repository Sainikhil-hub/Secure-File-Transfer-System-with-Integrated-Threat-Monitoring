/**
 * 4-Step Guided Upload & Encryption Wizard (SRS 5.4 Usability Requirement)
 */
const uploadWizard = {
  currentStep: 1,
  selectedFile: null,
  selectedRecipientId: null,
  selectedRecipientName: null,
  selectedRecipientEmail: null,

  init() {
    this.setupDragAndDrop();
  },

  setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dropzone-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dropzone-active');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileSelected(files[0]);
      }
    });
  },

  handleFileSelected(file) {
    if (!file) return;

    // Check size (100MB limit)
    if (file.size > 100 * 1024 * 1024) {
      app.showToast('File size exceeds the 100MB limit.', 'error');
      return;
    }

    this.selectedFile = file;

    // Update UI Preview
    const preview = document.getElementById('filePreview');
    const nameEl = document.getElementById('fileNamePreview');
    const sizeEl = document.getElementById('fileSizePreview');
    const extTag = document.getElementById('fileExtTag');
    const nextBtn = document.getElementById('btn-next-1');

    nameEl.textContent = file.name;
    sizeEl.textContent = this.formatBytes(file.size);

    const ext = file.name.split('.').pop().toUpperCase().slice(0, 4) || 'FILE';
    extTag.textContent = ext;

    preview.classList.remove('hidden');
    nextBtn.removeAttribute('disabled');
  },

  clearFile() {
    this.selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').classList.add('hidden');
    document.getElementById('btn-next-1').setAttribute('disabled', 'true');
  },

  async setStep(step) {
    if (step === 2 && !this.selectedFile) return;
    if (step === 3 && (!this.selectedFile || !this.selectedRecipientId)) return;
    if (step === 4 && this.currentStep !== 3) return;

    this.currentStep = step;

    // Update Step Indicators
    for (let i = 1; i <= 4; i++) {
      const ind = document.getElementById(`step-ind-${i}`);
      const pane = document.getElementById(`wizard-step-${i}`);

      if (i < step) {
        ind.className = 'step-circle step-completed';
        ind.textContent = '✓';
      } else if (i === step) {
        ind.className = 'step-circle step-active';
        ind.textContent = i;
      } else {
        ind.className = 'step-circle step-pending';
        ind.textContent = i;
      }

      if (pane) {
        if (i === step) pane.classList.remove('hidden');
        else pane.classList.add('hidden');
      }
    }

    // Update Curved Step Connector Tracks
    for (let i = 1; i <= 3; i++) {
      const line = document.getElementById(`step-line-${i}`);
      if (line) {
        if (i < step) {
          line.className = 'curved-step-track flex-1 mx-1.5 sm:mx-3 active-fill';
        } else {
          line.className = 'curved-step-track flex-1 mx-1.5 sm:mx-3';
        }
      }
    }

    // Step-specific initializations
    if (step === 2) {
      await this.loadRecipients();
    } else if (step === 3) {
      this.populateReview();
    }
  },

  async loadRecipients() {
    const container = document.getElementById('recipientListContainer');
    container.innerHTML = '<p class="text-xs text-slate-400 py-3">Fetching authorized recipients...</p>';

    try {
      const res = await api.getUsers();
      const currentUser = api.getUser();

      // Filter out self
      const recipients = res.users.filter(u => !currentUser || u.id !== currentUser.id);

      if (recipients.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 py-4">No other registered users available to share with.</p>';
        return;
      }

      container.innerHTML = recipients.map(u => `
        <label class="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition">
          <div class="flex items-center space-x-3">
            <input type="radio" name="recipientRadio" value="${u.id}" onchange="uploadWizard.onRecipientSelect('${u.id}', '${u.name}', '${u.email}')" class="text-blue-600 focus:ring-blue-500" ${this.selectedRecipientId === u.id ? 'checked' : ''}>
            <div>
              <p class="text-xs font-semibold text-slate-900">${u.name}</p>
              <p class="text-[11px] text-slate-500">${u.email}</p>
            </div>
          </div>
          <span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${u.role === 'Administrator' ? 'bg-amber-100 text-amber-800' : u.role === 'Staff' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}">
            ${u.role}
          </span>
        </label>
      `).join('');

      // Enable next if one already selected
      if (this.selectedRecipientId) {
        document.getElementById('btn-next-2').removeAttribute('disabled');
      }
    } catch (err) {
      container.innerHTML = `<p class="text-xs text-rose-600 py-2">Error loading recipients: ${err.message}</p>`;
    }
  },

  onRecipientSelect(id, name, email) {
    this.selectedRecipientId = id;
    this.selectedRecipientName = name;
    this.selectedRecipientEmail = email;
    document.getElementById('btn-next-2').removeAttribute('disabled');
  },

  populateReview() {
    document.getElementById('reviewFileName').textContent = this.selectedFile ? this.selectedFile.name : '-';
    document.getElementById('reviewFileSize').textContent = this.selectedFile ? this.formatBytes(this.selectedFile.size) : '-';
    document.getElementById('reviewRecipient').textContent = `${this.selectedRecipientName} (${this.selectedRecipientEmail})`;
  },

  async executeUpload() {
    if (!this.selectedFile || !this.selectedRecipientId) return;

    if (!api.getToken()) {
      app.showToast('Please sign in first to transfer files.', 'warning');
      app.openAuthModal('login');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-upload');
    const originalText = submitBtn.innerHTML;
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <span>Encrypting with AES-256...</span>
    `;

    try {
      const formData = new FormData();
      formData.append('file', this.selectedFile);
      formData.append('recipientId', this.selectedRecipientId);

      const res = await api.uploadFile(formData);

      document.getElementById('doneFileId').textContent = res.file.fileId;
      document.getElementById('doneChecksum').textContent = res.file.checksum;

      app.showToast('File encrypted & transferred successfully!', 'success');
      this.setStep(4);
    } catch (err) {
      app.showToast(err.message, 'error');
    } finally {
      submitBtn.removeAttribute('disabled');
      submitBtn.innerHTML = originalText;
    }
  },

  reset() {
    this.clearFile();
    this.selectedRecipientId = null;
    this.selectedRecipientName = null;
    this.selectedRecipientEmail = null;
    const btnNext2 = document.getElementById('btn-next-2');
    if (btnNext2) btnNext2.setAttribute('disabled', 'true');
    this.setStep(1);
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};
