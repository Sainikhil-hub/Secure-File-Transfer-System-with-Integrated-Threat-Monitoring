/**
 * Main Application Orchestrator & Authentication Gateway Controller
 */
const app = {
  currentView: 'landing-login',
  landingAuthMode: 'login', // 'login' or 'register'
  mobileMenuOpen: false,

  async init() {
    uploadWizard.init();
    adminDashboard.init();

    // Check existing auth token
    const token = api.getToken();
    if (token) {
      try {
        const res = await api.getProfile();
        api.setUser(res.user);
        this.updateUserUI(res.user);
        // Navigate to authenticated workspace
        if (res.user.role === 'Administrator') {
          this.navigate('admin');
        } else {
          this.navigate('upload');
        }
      } catch (err) {
        // Token expired or invalid
        api.setToken(null);
        api.setUser(null);
        this.updateUserUI(null);
        this.navigate('landing-login');
      }
    } else {
      // Unauthenticated: gate access and show landing login screen
      this.updateUserUI(null);
      this.navigate('landing-login');
    }

    // Window resize handler to auto-close mobile drawer if expanded
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024 && this.mobileMenuOpen) {
        this.closeMobileMenu();
      }
    });

    // Close persona dropdown on outside click
    document.addEventListener('click', (e) => {
      const container = document.getElementById('personaDropdownContainer');
      if (container && !container.contains(e.target)) {
        this.closePersonaDropdown();
      }
    });
  },

  // Toggle Persona Dropdown menu with Downward Arrow
  togglePersonaDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('personaDropdownMenu');
    const chevron = document.getElementById('personaChevron');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      menu.classList.remove('hidden');
      if (chevron) chevron.classList.add('rotate-180');
    } else {
      menu.classList.add('hidden');
      if (chevron) chevron.classList.remove('rotate-180');
    }
  },

  closePersonaDropdown() {
    const menu = document.getElementById('personaDropdownMenu');
    const chevron = document.getElementById('personaChevron');
    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
  },

  // Google Sign-In Modal Management
  showGoogleSignInModal() {
    const modal = document.getElementById('googleSignInModal');
    if (modal) modal.classList.remove('hidden');
  },

  closeGoogleSignInModal() {
    const modal = document.getElementById('googleSignInModal');
    if (modal) modal.classList.add('hidden');
  },

  async authenticateWithGoogle(email, name) {
    this.closeGoogleSignInModal();
    try {
      const res = await api.loginWithGoogle(email, name);
      api.setToken(res.token);
      api.setUser(res.user);
      if (typeof uploadWizard !== 'undefined') uploadWizard.reset();
      this.updateUserUI(res.user);
      this.showToast(`Signed in with Google as ${res.user.name}`, 'success');

      if (res.user.role === 'Administrator') {
        this.navigate('admin');
      } else {
        this.navigate('upload');
      }
    } catch (err) {
      this.showToast(err.message || 'Google sign-in failed', 'error');
    }
  },

  async handleCustomGoogleAuth(e) {
    e.preventDefault();
    const emailInput = document.getElementById('customGoogleEmail');
    const email = (emailInput ? emailInput.value : '').trim();
    if (!email) return;
    const name = email.split('@')[0];
    await this.authenticateWithGoogle(email, name);
  },

  handleLogoClick() {
    const user = api.getUser();
    if (user) {
      if (user.role === 'Administrator') this.navigate('admin');
      else this.navigate('upload');
    } else {
      this.navigate('landing-login');
    }
  },

  // Toggle mobile navigation panel
  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    const panel = document.getElementById('mobileNavPanel');
    const hamburger = document.getElementById('hamburgerIcon');
    const closeIcon = document.getElementById('closeMenuIcon');

    if (this.mobileMenuOpen) {
      panel.classList.remove('hidden');
      hamburger.classList.add('hidden');
      closeIcon.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
      hamburger.classList.remove('hidden');
      closeIcon.classList.add('hidden');
    }
  },

  closeMobileMenu() {
    this.mobileMenuOpen = false;
    const panel = document.getElementById('mobileNavPanel');
    const hamburger = document.getElementById('hamburgerIcon');
    const closeIcon = document.getElementById('closeMenuIcon');
    if (panel) panel.classList.add('hidden');
    if (hamburger) hamburger.classList.remove('hidden');
    if (closeIcon) closeIcon.classList.add('hidden');
  },

  navigate(viewId) {
    const user = api.getUser();

    // If NOT logged in, restrict access to landing-login only
    if (!user) {
      viewId = 'landing-login';
    } else if (viewId === 'landing-login') {
      // If already logged in, redirect away from landing to main workspace
      viewId = user.role === 'Administrator' ? 'admin' : 'upload';
    }

    // If trying to navigate to admin view without Admin role
    if (viewId === 'admin') {
      if (!user || user.role !== 'Administrator') {
        this.showToast('Access restricted: Administrator role required.', 'error');
        this.navigate('upload');
        return;
      }
    }
    if (viewId === 'staff-request' && user.role !== 'End User') {
      this.showToast('Staff access requests are available to End User accounts only.', 'error');
      return this.navigate('upload');
    }
    if (viewId === 'monitor' && user.role !== 'Staff') {
      this.showToast('Access restricted: Staff role required.', 'error');
      return this.navigate('upload');
    }

    this.currentView = viewId;

    // Toggle desktop nav active styles
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.className = 'nav-tab px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white/60 transition';
    });

    const activeNav = document.getElementById(`nav-${viewId}`);
    if (activeNav) {
      activeNav.className = 'nav-tab px-4 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-white shadow-sm transition';
    }

    // Toggle view visibility
    document.querySelectorAll('.view-content').forEach(view => {
      view.classList.add('hidden');
    });

    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
      targetView.classList.remove('hidden');
    }

    // Trigger view-specific loads
    if (viewId === 'upload') {
      uploadWizard.reset();
    } else if (viewId === 'transfers') {
      transfersManager.setTab('received');
    } else if (viewId === 'admin') {
      adminDashboard.refreshAll();
    } else if (viewId === 'staff-request') {
      staffPortal.loadRequestStatus();
    } else if (viewId === 'monitor') {
      staffPortal.loadMonitor();
    }
  },

  updateUserUI(user) {
    const mainNav = document.getElementById('mainNav');
    const desktopRightBar = document.getElementById('desktopRightBar');
    const userSection = document.getElementById('userSection');
    const mobileHeaderUserChip = document.getElementById('mobileHeaderUserChip');
    const navAdmin = document.getElementById('nav-admin');
    const menuMonitor = document.getElementById('menu-monitor');
    const menuStaffRequest = document.getElementById('menu-staff-request');
    const mobileNavLinks = document.getElementById('mobileNavLinks');
    const mobileNavAdmin = document.getElementById('mobile-nav-admin');
    const mobileNavMonitor = document.getElementById('mobile-nav-monitor');
    const mobileNavStaffRequest = document.getElementById('mobile-nav-staff-request');
    const mobileUserInfo = document.getElementById('mobileUserInfo');
    const mobileAuthBtn = document.getElementById('mobileAuthBtn');
    const currentRoleIcon = document.getElementById('currentRoleIcon');
    const currentRoleName = document.getElementById('currentRoleName');

    // Close any open persona dropdown
    this.closePersonaDropdown();

    if (user) {
      // ── Authenticated: show navigation tabs & user controls ──
      if (mainNav) {
        mainNav.className = 'hidden lg:flex items-center space-x-1 bg-slate-100/90 p-1 rounded-full border border-slate-200/80 flex-shrink-0 min-w-0';
      }
      if (desktopRightBar) {
        desktopRightBar.className = 'hidden lg:flex items-center space-x-2 flex-shrink-0';
      }
      if (mobileNavLinks) {
        mobileNavLinks.classList.remove('hidden');
        mobileNavLinks.classList.add('grid');
      }

      // Compact user chip on top bar for small/minimized screens (< lg)
      if (mobileHeaderUserChip) {
        const avatarLetter = (user.name || 'U').charAt(0).toUpperCase();
        mobileHeaderUserChip.innerHTML = `
          <div class="flex items-center space-x-1.5 bg-slate-100/90 px-2 py-1 rounded-full border border-slate-200 shadow-sm">
            <div class="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shadow-sm flex-shrink-0">
              ${avatarLetter}
            </div>
            <span class="text-[11px] font-bold text-slate-800 truncate max-w-[60px] sm:max-w-[80px]">${(user.name || '').split(' ')[0]}</span>
          </div>
        `;
        mobileHeaderUserChip.classList.remove('hidden');
        mobileHeaderUserChip.classList.add('flex');
      }

      // Update Persona Dropdown Label & Icon
      if (currentRoleIcon && currentRoleName) {
        if (user.role === 'Administrator') {
          currentRoleIcon.textContent = '👑';
          currentRoleName.textContent = 'Admin';
        } else if (user.role === 'Staff') {
          currentRoleIcon.textContent = '💼';
          currentRoleName.textContent = 'Staff';
        } else {
          currentRoleIcon.textContent = '👤';
          currentRoleName.textContent = 'User';
        }
      }

      // Admin tab visibility
      if (user.role === 'Administrator') {
        if (navAdmin) {
          navAdmin.classList.remove('hidden');
          navAdmin.classList.add('flex');
        }
        if (mobileNavAdmin) {
          mobileNavAdmin.classList.remove('hidden');
          mobileNavAdmin.classList.add('flex');
        }
      } else {
        if (navAdmin) {
          navAdmin.classList.add('hidden');
          navAdmin.classList.remove('flex');
        }
        if (mobileNavAdmin) {
          mobileNavAdmin.classList.add('hidden');
          mobileNavAdmin.classList.remove('flex');
        }
      }

      const isStaff = user.role === 'Staff';
      const isEndUser = user.role === 'End User';
      if (menuMonitor) menuMonitor.classList.toggle('hidden', !isStaff);
      if (mobileNavMonitor) mobileNavMonitor.classList.toggle('hidden', !isStaff);
      if (menuStaffRequest) menuStaffRequest.classList.toggle('hidden', !isEndUser);
      if (mobileNavStaffRequest) mobileNavStaffRequest.classList.toggle('hidden', !isEndUser);

      // Desktop User Info & Logout Button (Compact, within the curved island boundary)
      if (userSection) {
        const avatarLetter = (user.name || 'U').charAt(0).toUpperCase();

        userSection.innerHTML = `
          <div class="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
            <div class="flex items-center space-x-1.5 sm:space-x-2 bg-slate-50 hover:bg-slate-100/90 px-2 sm:px-2.5 py-1 rounded-full border border-slate-200 transition shadow-sm">
              <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white flex items-center justify-center font-bold text-[11px] shadow-sm flex-shrink-0">
                ${avatarLetter}
              </div>
              <div class="flex flex-col text-left leading-none max-w-[70px] sm:max-w-[95px]">
                <span class="text-xs font-bold text-slate-800 truncate whitespace-nowrap" title="${user.name}">${user.name}</span>
                <span class="text-[9px] text-slate-400 font-medium whitespace-nowrap mt-0.5">${user.role}</span>
              </div>
            </div>
            <button onclick="app.logout()" class="px-2.5 sm:px-3 py-1 rounded-full border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-xs font-semibold text-slate-600 transition shadow-sm whitespace-nowrap flex-shrink-0 cursor-pointer" title="Sign out of CipherDrop">
              Sign Out
            </button>
          </div>
        `;
      }

      // Mobile User Info
      if (mobileUserInfo && mobileAuthBtn) {
        const avatarLetter = (user.name || 'U').charAt(0).toUpperCase();
        mobileUserInfo.innerHTML = `
          <div class="flex items-center space-x-2">
            <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              ${avatarLetter}
            </div>
            <div class="leading-tight">
              <div class="font-bold text-slate-800 text-xs truncate max-w-[140px]">${user.name}</div>
              <div class="text-[10px] text-slate-400 font-mono">${user.email} (${user.role})</div>
            </div>
          </div>
        `;
        mobileAuthBtn.textContent = 'Sign Out';
        mobileAuthBtn.className = 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer';
        mobileAuthBtn.onclick = () => { app.logout(); app.closeMobileMenu(); };
      }

    } else {
      // ── Unauthenticated: hide internal tabs & controls ──
      if (mainNav) {
        mainNav.className = 'hidden items-center space-x-1 bg-slate-100/90 p-1 rounded-full border border-slate-200/80 flex-shrink-0 min-w-0';
      }
      if (desktopRightBar) {
        desktopRightBar.className = 'hidden items-center space-x-2 flex-shrink-0';
      }
      if (mobileHeaderUserChip) {
        mobileHeaderUserChip.innerHTML = '';
        mobileHeaderUserChip.classList.add('hidden');
        mobileHeaderUserChip.classList.remove('flex');
      }
      if (mobileNavLinks) {
        mobileNavLinks.classList.add('hidden');
        mobileNavLinks.classList.remove('grid');
      }
      if (navAdmin) {
        navAdmin.classList.add('hidden');
        navAdmin.classList.remove('flex');
      }
      if (mobileNavAdmin) {
        mobileNavAdmin.classList.add('hidden');
        mobileNavAdmin.classList.remove('flex');
      }
      if (menuMonitor) menuMonitor.classList.add('hidden');
      if (mobileNavMonitor) mobileNavMonitor.classList.add('hidden');
      if (menuStaffRequest) menuStaffRequest.classList.add('hidden');
      if (mobileNavStaffRequest) mobileNavStaffRequest.classList.add('hidden');

      if (userSection) {
        userSection.innerHTML = '';
      }

      if (mobileUserInfo && mobileAuthBtn) {
        mobileUserInfo.innerHTML = `<span class="text-slate-500 text-xs">Please sign in to transfer files</span>`;
        mobileAuthBtn.textContent = 'Sign In';
        mobileAuthBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white shadow-sm cursor-pointer';
        mobileAuthBtn.onclick = () => { app.navigate('landing-login'); app.closeMobileMenu(); };
      }
    }
  },

  toggleLandingAuthMode() {
    this.landingAuthMode = this.landingAuthMode === 'login' ? 'register' : 'login';
    const title = document.getElementById('landingAuthTitle');
    const subtitle = document.getElementById('landingAuthSubtitle');
    const nameGroup = document.getElementById('landingNameGroup');
    const submitBtn = document.getElementById('landingSubmitBtn');
    const toggleLabel = document.getElementById('landingToggleLabel');
    const toggleBtn = document.getElementById('landingToggleBtn');
    const errorAlert = document.getElementById('landingAuthError');

    if (errorAlert) errorAlert.classList.add('hidden');

    if (this.landingAuthMode === 'register') {
      title.textContent = 'Create a Secure Account';
      subtitle.textContent = 'Register to start transferring encrypted files';
      nameGroup.classList.remove('hidden');
      submitBtn.innerHTML = `<span>Create Free Account</span> <span>→</span>`;
      toggleLabel.textContent = 'Already have an account?';
      toggleBtn.textContent = 'Sign in instead';
    } else {
      title.textContent = 'Sign in to CipherDrop';
      subtitle.textContent = 'Log in to upload, share, or decrypt your files';
      nameGroup.classList.add('hidden');
      submitBtn.innerHTML = `<span>Sign In to CipherDrop</span> <span>→</span>`;
      toggleLabel.textContent = "Don't have an account yet?";
      toggleBtn.textContent = 'Create an account';
    }
  },

  async handleLandingAuthSubmit(e) {
    e.preventDefault();
    const errorAlert = document.getElementById('landingAuthError');
    const errorText = document.getElementById('landingAuthErrorText');
    const submitBtn = document.getElementById('landingSubmitBtn');
    if (errorAlert) errorAlert.classList.add('hidden');

    const email = document.getElementById('landingEmail').value;
    const password = document.getElementById('landingPassword').value;

    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <span>Authenticating...</span>
    `;

    try {
      let res;
      if (this.landingAuthMode === 'register') {
        const name = document.getElementById('landingName').value;
        res = await api.register(name, email, password);
      } else {
        res = await api.login(email, password);
      }

      api.setToken(res.token);
      api.setUser(res.user);
      if (typeof uploadWizard !== 'undefined') uploadWizard.reset();
      this.updateUserUI(res.user);
      this.showToast(`Welcome, ${res.user.name}!`, 'success');

      // Navigate to internal app
      if (res.user.role === 'Administrator') {
        this.navigate('admin');
      } else {
        this.navigate('upload');
      }
    } catch (err) {
      if (errorAlert && errorText) {
        errorText.textContent = err.message;
        errorAlert.classList.remove('hidden');
      }
      this.showToast(err.message, 'error');
    } finally {
      submitBtn.removeAttribute('disabled');
      submitBtn.innerHTML = originalBtnContent;
    }
  },

  // Open Switch Account Modal. Credentials are never pre-filled in the client.
  openSwitchAccountModal() {
    const modal = document.getElementById('switchAccountModal');
    const emailInput = document.getElementById('switchAccountEmail');
    const passInput = document.getElementById('switchAccountPassword');
    const hintPass = document.getElementById('switchAccountHintPass');
    const errAlert = document.getElementById('switchAccountError');

    if (errAlert) errAlert.classList.add('hidden');
    if (passInput) passInput.value = '';

    if (emailInput) emailInput.value = '';
    if (hintPass) hintPass.textContent = 'Enter password';

    if (modal) modal.classList.remove('hidden');
    if (passInput) passInput.focus();
  },

  closeSwitchAccountModal() {
    const modal = document.getElementById('switchAccountModal');
    if (modal) modal.classList.add('hidden');
  },

  fillSwitchAccountPassword() {
    const hint = document.getElementById('switchAccountHintPass');
    const passInput = document.getElementById('switchAccountPassword');
    if (hint && passInput && hint.textContent !== 'Enter password') {
      passInput.value = hint.textContent;
      passInput.focus();
    }
  },

  async handleSwitchAccountSubmit(e) {
    e.preventDefault();
    const errAlert = document.getElementById('switchAccountError');
    const errText = document.getElementById('switchAccountErrorText');
    const submitBtn = document.getElementById('switchAccountSubmitBtn');
    const emailInput = document.getElementById('switchAccountEmail');
    const passInput = document.getElementById('switchAccountPassword');

    if (errAlert) errAlert.classList.add('hidden');

    const email = (emailInput ? emailInput.value : '').trim();
    const password = passInput ? passInput.value : '';

    if (!email || !password) return;

    const originalText = submitBtn.innerHTML;
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = `<span>Verifying credentials...</span>`;

    try {
      const res = await api.login(email, password);
      api.setToken(res.token);
      api.setUser(res.user);
      
      // Clean reset upload state on user switch
      if (typeof uploadWizard !== 'undefined') {
        uploadWizard.reset();
      }

      this.updateUserUI(res.user);
      this.closeSwitchAccountModal();
      this.showToast(`Switched account: ${res.user.name} (${res.user.role})`, 'success');

      if (res.user.role === 'Administrator') {
        this.navigate('admin');
      } else {
        this.navigate('upload');
      }
    } catch (err) {
      if (errAlert && errText) {
        errText.textContent = err.message || 'Authentication failed. Please check credentials.';
        errAlert.classList.remove('hidden');
      }
      this.showToast(err.message, 'error');
    } finally {
      submitBtn.removeAttribute('disabled');
      submitBtn.innerHTML = originalText;
    }
  },

  logout() {
    api.setToken(null);
    api.setUser(null);
    
    // Always reset upload wizard on sign out
    if (typeof uploadWizard !== 'undefined') {
      uploadWizard.reset();
    }

    this.updateUserUI(null);
    this.navigate('landing-login');
    this.showToast('You have been signed out.', 'info');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-3.5 rounded-xl shadow-xl text-xs font-medium border flex items-center justify-between transition-all transform duration-300 pointer-events-auto backdrop-blur-md ${
      type === 'error' ? 'bg-rose-50/95 border-rose-200 text-rose-900 shadow-rose-500/10' :
      type === 'warning' ? 'bg-amber-50/95 border-amber-200 text-amber-900 shadow-amber-500/10' :
      type === 'success' ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-500/10' :
      'bg-slate-900/95 text-white border-slate-800 shadow-slate-900/20'
    }`;

    toast.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="text-sm">${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span>
        <span class="leading-snug">${message}</span>
      </div>
      <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 ml-3 p-1">✕</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
};

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
