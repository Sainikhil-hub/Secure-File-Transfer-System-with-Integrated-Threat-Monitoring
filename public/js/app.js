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
      if (window.innerWidth >= 768 && this.mobileMenuOpen) {
        this.closeMobileMenu();
      }
    });
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
    if (viewId === 'transfers') {
      transfersManager.setTab('received');
    } else if (viewId === 'admin') {
      adminDashboard.refreshAll();
    }
  },

  updateUserUI(user) {
    const mainNav = document.getElementById('mainNav');
    const desktopRightBar = document.getElementById('desktopRightBar');
    const desktopPersonaSwitcher = document.getElementById('desktopPersonaSwitcher');
    const userSection = document.getElementById('userSection');
    const navAdmin = document.getElementById('nav-admin');
    const mobileNavLinks = document.getElementById('mobileNavLinks');
    const mobileNavAdmin = document.getElementById('mobile-nav-admin');
    const mobileUserInfo = document.getElementById('mobileUserInfo');
    const mobileAuthBtn = document.getElementById('mobileAuthBtn');

    if (user) {
      // Authenticated: show navigation tabs & user controls
      if (mainNav) {
        mainNav.classList.remove('hidden');
        mainNav.classList.add('flex');
      }
      if (desktopRightBar) {
        desktopRightBar.classList.remove('hidden');
        desktopRightBar.classList.add('md:flex');
      }
      if (mobileNavLinks) {
        mobileNavLinks.classList.remove('hidden');
        mobileNavLinks.classList.add('grid');
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

      // Desktop User Info & Logout Button
      if (userSection) {
        const avatarLetter = (user.name || 'U').charAt(0).toUpperCase();
        let roleBadgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
        if (user.role === 'Administrator') roleBadgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
        else if (user.role === 'Staff') roleBadgeColor = 'bg-indigo-100 text-indigo-800 border-indigo-200';

        userSection.innerHTML = `
          <div class="flex items-center space-x-2 flex-shrink-0">
            <div class="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100/90 px-2.5 py-1 rounded-full border border-slate-200/90 transition shadow-sm">
              <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white flex items-center justify-center font-bold text-[11px] shadow-sm flex-shrink-0">
                ${avatarLetter}
              </div>
              <div class="flex flex-col text-left leading-none max-w-[90px]">
                <span class="text-xs font-bold text-slate-800 truncate whitespace-nowrap" title="${user.name}">${user.name}</span>
                <span class="text-[9px] text-slate-400 font-medium whitespace-nowrap mt-0.5">${user.role}</span>
              </div>
            </div>
            <button onclick="app.logout()" class="px-3 py-1 rounded-full border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-xs font-medium text-slate-600 transition shadow-sm whitespace-nowrap" title="Sign out">
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
        mobileAuthBtn.className = 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition';
        mobileAuthBtn.onclick = () => { app.logout(); app.closeMobileMenu(); };
      }

    } else {
      // Unauthenticated: hide all internal navigation
      if (mainNav) {
        mainNav.classList.add('hidden');
        mainNav.classList.remove('flex');
      }
      if (desktopRightBar) {
        desktopRightBar.classList.add('hidden');
        desktopRightBar.classList.remove('md:flex');
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

      if (userSection) {
        userSection.innerHTML = `
          <div class="flex items-center space-x-1.5 text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span>Authentication Gateway</span>
          </div>
        `;
      }

      if (mobileUserInfo && mobileAuthBtn) {
        mobileUserInfo.innerHTML = `<span class="text-slate-500 text-xs">Please sign in to transfer files</span>`;
        mobileAuthBtn.textContent = 'Sign In';
        mobileAuthBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white shadow-sm';
        mobileAuthBtn.onclick = () => { app.navigate('landing-login'); app.closeMobileMenu(); };
      }
    }
  },

  toggleLandingAuthMode() {
    this.landingAuthMode = this.landingAuthMode === 'login' ? 'register' : 'login';
    const title = document.getElementById('landingAuthTitle');
    const subtitle = document.getElementById('landingAuthSubtitle');
    const nameGroup = document.getElementById('landingNameGroup');
    const roleGroup = document.getElementById('landingRoleGroup');
    const submitBtn = document.getElementById('landingSubmitBtn');
    const toggleLabel = document.getElementById('landingToggleLabel');
    const toggleBtn = document.getElementById('landingToggleBtn');
    const errorAlert = document.getElementById('landingAuthError');

    if (errorAlert) errorAlert.classList.add('hidden');

    if (this.landingAuthMode === 'register') {
      title.textContent = 'Create a Secure Account';
      subtitle.textContent = 'Register to start transferring encrypted files';
      nameGroup.classList.remove('hidden');
      roleGroup.classList.remove('hidden');
      submitBtn.innerHTML = `<span>Create Free Account</span> <span>→</span>`;
      toggleLabel.textContent = 'Already have an account?';
      toggleBtn.textContent = 'Sign in instead';
    } else {
      title.textContent = 'Sign in to CipherDrop';
      subtitle.textContent = 'Log in to upload, share, or decrypt your files';
      nameGroup.classList.add('hidden');
      roleGroup.classList.add('hidden');
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
        const role = document.getElementById('landingRole').value;
        res = await api.register(name, email, password, role);
      } else {
        res = await api.login(email, password);
      }

      api.setToken(res.token);
      api.setUser(res.user);
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

  async quickLogin(role) {
    try {
      const res = await api.quickDemoLogin(role);
      api.setToken(res.token);
      api.setUser(res.user);
      this.updateUserUI(res.user);
      this.showToast(`Logged in as ${res.user.name} (${role})`, 'success');

      if (role === 'Administrator') {
        this.navigate('admin');
      } else {
        this.navigate('upload');
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async quickSwitch(role) {
    await this.quickLogin(role);
  },

  logout() {
    api.setToken(null);
    api.setUser(null);
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
