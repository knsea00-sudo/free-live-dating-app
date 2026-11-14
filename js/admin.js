/**
 * PulseLive Owner Studio Controller
 * Dedicated executive command center protected by Owner Security PIN.
 * Controls: Real connected users, payment screenshot verifications,
 * making any user ID 100% free with VIP access, granular app customization, and bans.
 */
class OwnerStudioController {
  constructor() {
    this.currentTab = 'reality';
    this.isAuthorized = false;
    this.statsTimer = null;
    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Studio Tabs Navigation
    document.querySelectorAll('.studio-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Studio User Search
    const searchInput = document.getElementById('studioUserSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.loadUsers(e.target.value);
      });
    }

    // Studio Granular Settings Form
    const settingsForm = document.getElementById('studioSettingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveGranularSettings();
      });
    }

    // Theme Customizer Event Listeners
    const syncColor = (pickerId, hexId, cssVar) => {
      const p = document.getElementById(pickerId);
      const h = document.getElementById(hexId);
      if (p && h) {
        p.addEventListener('input', (e) => {
          h.value = e.target.value;
          this.previewLiveCss();
        });
        h.addEventListener('input', (e) => {
          p.value = e.target.value;
          this.previewLiveCss();
        });
      }
    };
    syncColor('themeBgColor', 'themeBgColorHex');
    syncColor('themeAccentColor', 'themeAccentColorHex');
    syncColor('themeSecondaryColor', 'themeSecondaryColorHex');

    const blurSlider = document.getElementById('sliderGlassBlur');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        const lbl = document.getElementById('labelGlassBlur');
        if (lbl) lbl.innerText = `${e.target.value}px`;
        this.previewLiveCss();
      });
    }

    const opSlider = document.getElementById('sliderGlassOpacity');
    if (opSlider) {
      opSlider.addEventListener('input', (e) => {
        const lbl = document.getElementById('labelGlassOpacity');
        if (lbl) lbl.innerText = `${e.target.value}%`;
        this.previewLiveCss();
      });
    }

    const orbsSel = document.getElementById('selectOrbsMotion');
    if (orbsSel) {
      orbsSel.addEventListener('change', () => this.previewLiveCss());
    }

    const btnSaveGlass = document.getElementById('btnSaveGlassTheme');
    if (btnSaveGlass) btnSaveGlass.addEventListener('click', () => this.saveGlassTheme());

    const btnSaveGlassBottom = document.getElementById('btnSaveGlassThemeBottom');
    if (btnSaveGlassBottom) btnSaveGlassBottom.addEventListener('click', () => this.saveGlassTheme());

    const btnPreview = document.getElementById('btnPreviewTheme');
    if (btnPreview) btnPreview.addEventListener('click', () => this.previewLiveCss());
  }

  // Open Studio: Direct 1-Click for Owner knsea00@gmail.com or PIN check
  openStudio() {
    const u = window.pulseApp && window.pulseApp.currentUser;
    const isOwner = u && (u.is_owner || u.role === 'owner' || (u.email && u.email.toLowerCase().trim() === 'knsea00@gmail.com'));

    if (isOwner) {
      this.isAuthorized = true;
      document.getElementById('mainView').style.display = 'none';
      document.getElementById('studioView').style.display = 'block';
      this.switchTab('reality');
      return;
    }

    const pin = prompt('🔐 Enter Owner Studio Security Passcode / PIN (Default: 7890):');
    if (!pin) return;

    fetch('/api/admin/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success && res.authorized) {
          this.isAuthorized = true;
          document.getElementById('mainView').style.display = 'none';
          document.getElementById('studioView').style.display = 'block';
          this.switchTab('reality');
        } else {
          alert('⛔ Access Denied: Incorrect Owner Security PIN.');
        }
      })
      .catch(e => alert('Error checking PIN: ' + e.message));
  }

  closeStudio() {
    document.getElementById('studioView').style.display = 'none';
    document.getElementById('mainView').style.display = 'block';
    if (this.statsTimer) clearInterval(this.statsTimer);
  }

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.studio-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });

    document.querySelectorAll('.studio-tab-content').forEach((c) => {
      c.classList.remove('active');
    });

    const activeContent = document.getElementById(`studio-tab-${tabId}`);
    if (activeContent) activeContent.classList.add('active');

    if (tabId === 'reality') {
      this.loadRealityPulse();
      if (!this.statsTimer) {
        this.statsTimer = setInterval(() => this.loadRealityPulse(), 3000);
      }
    } else {
      if (this.statsTimer) {
        clearInterval(this.statsTimer);
        this.statsTimer = null;
      }
    }

    if (tabId === 'payments') this.loadPendingPayments();
    if (tabId === 'users') this.loadUsers();
    if (tabId === 'coins') this.loadCoinStoreSettings();
    if (tabId === 'theme') this.loadThemeConfig();
    if (tabId === 'config') this.loadGranularConfig();
    if (tabId === 'reports') this.loadReports();
    if (tabId === 'logs') this.loadAuditLogs();
  }

  // 1. Reality Pulse: REAL Live Online Users & Sockets
  async loadRealityPulse() {
    try {
      const [resStats, resClients] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/live-clients')
      ]);
      const dataStats = await resStats.json();
      const dataClients = await resClients.json();

      if (dataStats.success) {
        const s = dataStats.stats;
        document.getElementById('studioLiveUsers').innerText = `${s.liveSockets} Real Connected`;
        document.getElementById('studioTotalUsers').innerText = s.totalUsers;
        document.getElementById('studioRevenue').innerText = `₹${s.totalRevenue.toFixed(0)}`;
        document.getElementById('studioPendingPayments').innerText = s.pendingPayments;
        document.getElementById('studioActiveCalls').innerText = s.activeCalls;
        document.getElementById('studioFreeVipUsers').innerText = s.freeVipUsers || 0;

        // Update badge counter on payments tab
        const payBadge = document.getElementById('pendingPayBadge');
        if (payBadge) {
          payBadge.innerText = s.pendingPayments;
          payBadge.style.display = s.pendingPayments > 0 ? 'inline-block' : 'none';
        }
      }

      // Render Table of REAL currently connected humans
      const tbody = document.getElementById('studioLiveClientsTbody');
      if (tbody && dataClients.success) {
        if (dataClients.clients.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:1.5rem;">No other users connected right now. Open another tab or browser to test live multi-user video calling!</td></tr>`;
        } else {
          tbody.innerHTML = dataClients.clients.map(c => `
            <tr>
              <td><strong>${c.username}</strong></td>
              <td>${c.email}</td>
              <td>${c.country}</td>
              <td>
                <span class="badge ${c.inCall ? 'badge-vip' : (c.queueCategory ? 'badge-pending' : 'badge-active')}">
                  ${c.inCall ? 'In Live Call' : (c.queueCategory ? `Queue: ${c.queueCategory}` : 'Online Idle')}
                </span>
              </td>
              <td>
                <button class="btn-sm btn-danger-sm" onclick="ownerStudio.userAction('${c.userId}', 'ban', 'Disconnected by Owner')">Kick/Ban</button>
              </td>
            </tr>
          `).join('');
        }
      }
    } catch (e) {
      console.error('Error fetching reality stats:', e);
    }
  }

  // 2. Pending Payment Verifications with Screenshot Proof
  async loadPendingPayments() {
    try {
      const res = await fetch('/api/admin/pending-payments');
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('studioPendingPaymentsTbody');
      if (!tbody) return;

      if (data.pending.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:2rem;">🎉 No pending payments waiting for approval! All verified.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.pending.map(p => `
        <tr>
          <td>
            <strong>${p.username}</strong>
            <div style="font-size:0.75rem; color:var(--text-dim);">${p.email}</div>
          </td>
          <td>${p.item_title || p.item_id}</td>
          <td><strong style="color:#10b981;">₹${p.amount}</strong> (${p.payment_method.toUpperCase()})</td>
          <td><code style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; font-weight:700;">${p.utr_number || 'N/A'}</code></td>
          <td>
            ${p.screenshot_url ? `
              <div style="position:relative; display:inline-block; cursor:pointer;" onclick="ownerStudio.viewScreenshot('${p.screenshot_url}', '${p.username}')">
                <img src="${p.screenshot_url}" style="width:48px; height:48px; object-fit:cover; border-radius:6px; border:1px solid var(--accent-primary);" />
                <span style="display:block; font-size:10px; color:var(--accent-primary); text-align:center;">🔍 View</span>
              </div>
            ` : '<span style="color:var(--text-dim);">No file</span>'}
          </td>
          <td><div style="font-size:0.75rem; color:var(--text-muted);">${p.created_at}</div></td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-sm btn-success-sm" style="padding:6px 14px; font-weight:800;" onclick="ownerStudio.approvePayment('${p.id}')">
                ✓ Approve &amp; Activate
              </button>
              <button class="btn-sm btn-danger-sm" onclick="ownerStudio.rejectPayment('${p.id}')">
                ✕ Reject
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Error loading pending payments:', e);
    }
  }

  viewScreenshot(url, username) {
    const modal = document.getElementById('screenshotModal');
    document.getElementById('screenshotModalImg').src = url;
    document.getElementById('screenshotModalUser').innerText = `Payment Proof from ${username}`;
    modal.classList.add('active');
  }

  async approvePayment(paymentId) {
    if (!confirm('Confirm: Have you checked your bank account/UPI and received this payment?')) return;

    try {
      const res = await fetch('/api/admin/approve-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 Payment Approved! User benefits (Coins/VIP Subscription) are now ACTIVE!');
        this.loadPendingPayments();
        this.loadRealityPulse();
      } else {
        alert('Error: ' + data.message);
      }
    } catch (e) {
      alert('Error approving payment: ' + e.message);
    }
  }

  async rejectPayment(paymentId) {
    const reason = prompt('Enter rejection reason for user notification:', 'Payment not received in bank account / Invalid UTR');
    if (!reason) return;

    try {
      const res = await fetch('/api/admin/reject-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, reason })
      });
      const data = await res.json();
      if (data.success) {
        alert('Payment marked as rejected.');
        this.loadPendingPayments();
        this.loadRealityPulse();
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // 3. User Management & Making Any User 100% Free
  async loadUsers(searchTerm = '') {
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('studioUsersTableBody');
      if (!tbody) return;

      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${u.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.username}" style="width:34px; height:34px; border-radius:50%;" />
              <div>
                <strong>${u.username}</strong>
                <div style="font-size:0.75rem; color:var(--text-dim);">${u.id}</div>
              </div>
            </div>
          </td>
          <td>${u.email}</td>
          <td>${u.country} (${u.gender})</td>
          <td>
            <span class="badge ${u.balance > 0 ? 'badge-active' : 'badge-pending'}">${u.balance || 0} 🪙</span>
          </td>
          <td>
            ${u.is_free_vip
              ? `<span class="badge badge-vip" style="border:1px solid #fbbf24;">🌟 100% FREE VIP</span>`
              : (u.role === 'super_admin' ? `<span class="badge badge-vip">Owner</span>` : `<span class="badge">Standard</span>`)
            }
          </td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <!-- 1-Click Make Free / Revoke Free VIP -->
              <button class="btn-sm" style="background:${u.is_free_vip ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)'}; color:${u.is_free_vip ? '#ef4444' : '#fbbf24'}; font-weight:800;" onclick="ownerStudio.toggleFreeVip('${u.id}', ${!u.is_free_vip})">
                ${u.is_free_vip ? 'Revoke Free' : '🌟 Make Free VIP'}
              </button>

              <!-- Custom Coins Grant -->
              <button class="btn-sm" style="background:rgba(139,92,246,0.2); color:#a78bfa;" onclick="ownerStudio.promptCoinAdjustment('${u.id}', '${u.username}')">
                + Coins
              </button>

              <!-- Ban / Unban -->
              ${u.is_banned
                ? `<button class="btn-sm btn-success-sm" onclick="ownerStudio.userAction('${u.id}', 'unban')">Unban</button>`
                : `<button class="btn-sm btn-danger-sm" onclick="ownerStudio.userAction('${u.id}', 'ban')">Ban</button>`
              }
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Error loading users:', e);
    }
  }

  async toggleFreeVip(userId, shouldBeFree) {
    try {
      const res = await fetch('/api/admin/users/free-vip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isFree: shouldBeFree })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        this.loadUsers();
      } else {
        alert('Failed: ' + data.message);
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async userAction(userId, action, reason = '', amount = 0) {
    if (action === 'ban' && !confirm('Are you sure you want to ban this user?')) return;

    try {
      const res = await fetch('/api/admin/users/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, reason, amount })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        this.loadUsers();
        this.loadRealityPulse();
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  promptCoinAdjustment(userId, username) {
    const amountStr = prompt(`Enter coins to add/subtract for ${username} (e.g. 100 or -50):`);
    if (!amountStr) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount)) return alert('Invalid number');
    const reason = prompt('Reason for this adjustment:') || 'Owner discretionary benefit';
    this.userAction(userId, 'adjust_coins', reason, amount);
  }

  // 4. Coin & Store Settings
  async loadCoinStoreSettings() {
    try {
      const [resSet, resPkg] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/packages')
      ]);
      const dataSet = await resSet.json();
      const dataPkg = await resPkg.json();

      if (dataSet.success) {
        document.getElementById('studioWelcomeCoins').value = dataSet.settings.welcome_coins || 200;
        document.getElementById('studioCallCost').value = dataSet.settings.call_cost_coins || 5;
      }

      const pkgBody = document.getElementById('studioPackagesTbody');
      if (pkgBody && dataPkg.success) {
        pkgBody.innerHTML = dataPkg.packages.map(p => `
          <tr>
            <td><strong>${p.name}</strong></td>
            <td>${p.coins} + ${p.bonus_coins}</td>
            <td>₹${p.price_inr} / $${p.price_usd}</td>
            <td><span class="badge badge-vip">${p.badge}</span></td>
            <td>
              <button class="btn-sm btn-success-sm" onclick="ownerStudio.editPackage('${p.id}', '${p.name}', ${p.coins}, ${p.price_inr}, ${p.price_usd})">Edit</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }

  editPackage(id, name, coins, priceInr, priceUsd) {
    const newPriceInr = prompt(`Enter new price in ₹ (INR) for ${name}:`, priceInr);
    if (!newPriceInr) return;
    const newPriceUsd = prompt(`Enter new price in $ (USD) for ${name}:`, priceUsd);
    if (!newPriceUsd) return;

    fetch('/api/admin/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name,
        coins,
        bonus_coins: 50,
        price_inr: parseFloat(newPriceInr),
        price_usd: parseFloat(newPriceUsd),
        badge: 'Special Offer',
        is_active: 1
      })
    }).then(r => r.json()).then(res => {
      alert(res.message);
      this.loadCoinStoreSettings();
    });
  }

  // 5. Granular App Configurator (Barik-se-barik control)
  async loadGranularConfig() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (!data.success) return;

      const s = data.settings;
      document.getElementById('cfgBrandName').value = s.brand_name || 'PulseLive';
      document.getElementById('cfgBrandTagline').value = s.brand_tagline || '';
      document.getElementById('cfgLogoUrl').value = s.brand_logo || '/assets/logo.svg';
      document.getElementById('cfgPaymentQr').value = s.payment_qr || '/assets/payment-qr.jpg';
      document.getElementById('cfgUpiId').value = s.upi_id || 'pulselive@upi';
      document.getElementById('cfgUpiName').value = s.upi_name || 'PulseLive Official';
      document.getElementById('cfgThemeAccent').value = s.theme_accent || '#8b5cf6';
      document.getElementById('cfgAnnouncement').value = s.announcement_banner || '';
      document.getElementById('cfgSupportEmail').value = s.support_email || 'support@pulselive.io';
      document.getElementById('cfgTerms').value = s.terms_content || '';

      document.getElementById('cfgStrangerCat').checked = s.stranger_category_enabled === '1';
      document.getElementById('cfgMaleCat').checked = s.male_category_enabled === '1';
      document.getElementById('cfgFemaleCat').checked = s.female_category_enabled === '1';

      if (document.getElementById('cfgSecurityPin')) {
        document.getElementById('cfgSecurityPin').value = '';
      }
    } catch (e) {
      console.error(e);
    }
  }

  async saveGranularSettings() {
    const settings = {
      brand_name: document.getElementById('cfgBrandName').value,
      brand_tagline: document.getElementById('cfgBrandTagline').value,
      brand_logo: document.getElementById('cfgLogoUrl').value,
      payment_qr: document.getElementById('cfgPaymentQr').value,
      upi_id: document.getElementById('cfgUpiId').value,
      upi_name: document.getElementById('cfgUpiName').value,
      theme_accent: document.getElementById('cfgThemeAccent').value,
      announcement_banner: document.getElementById('cfgAnnouncement').value,
      support_email: document.getElementById('cfgSupportEmail').value,
      terms_content: document.getElementById('cfgTerms').value,
      welcome_coins: document.getElementById('studioWelcomeCoins').value,
      call_cost_coins: document.getElementById('studioCallCost').value,
      stranger_category_enabled: document.getElementById('cfgStrangerCat').checked ? '1' : '0',
      male_category_enabled: document.getElementById('cfgMaleCat').checked ? '1' : '0',
      female_category_enabled: document.getElementById('cfgFemaleCat').checked ? '1' : '0'
    };

    const newPin = document.getElementById('cfgSecurityPin').value.trim();
    if (newPin) {
      settings.owner_security_pin = newPin;
    }

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      const data = await res.json();
      if (data.success) {
        alert('✨ All settings saved and applied LIVE across the application!');
        if (window.pulseApp) window.pulseApp.loadBrandSettings();
      } else {
        alert('Error: ' + data.message);
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async loadReports() {
    try {
      const res = await fetch('/api/admin/reports');
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('studioReportsTbody');
      if (!tbody) return;

      tbody.innerHTML = data.reports.map(r => `
        <tr>
          <td>#${r.id}</td>
          <td><strong>${r.reporter_username}</strong></td>
          <td><strong style="color:var(--danger);">${r.reported_username}</strong></td>
          <td><span class="badge badge-banned">${r.reason}</span></td>
          <td>${r.details || 'No details'}</td>
          <td><span class="badge">${r.status}</span></td>
          <td>
            <button class="btn-sm btn-danger-sm" onclick="ownerStudio.userAction('${r.reported_id}', 'ban', 'Report upheld')">Ban User</button>
          </td>
        </tr>
      `).join('');
    } catch (e) {}
  }

  async loadAuditLogs() {
    try {
      const res = await fetch('/api/admin/logs');
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('studioLogsTbody');
      if (!tbody) return;

      tbody.innerHTML = data.logs.map(l => `
        <tr>
          <td>${l.created_at}</td>
          <td><span class="badge badge-vip">${l.action}</span></td>
          <td>${l.target_type}: ${l.target_id}</td>
          <td>${l.details || ''}</td>
          <td>${l.ip_address}</td>
        </tr>
      `).join('');
    } catch (e) {}
  }

  // ==========================================
  // REALTIME GLASS THEME & VISUALS DIRECTOR
  // ==========================================
  themePresets = {
    cyber_violet: {
      bg: '#08080d',
      accent: '#8b5cf6',
      secondary: '#06b6d4',
      blur: '24px',
      opacity: '0.72',
      orbs: 'smooth'
    },
    aurora_ice: {
      bg: '#040d1a',
      accent: '#00f2fe',
      secondary: '#4facfe',
      blur: '28px',
      opacity: '0.65',
      orbs: 'smooth'
    },
    amethyst_glow: {
      bg: '#0c0517',
      accent: '#d946ef',
      secondary: '#ec4899',
      blur: '24px',
      opacity: '0.75',
      orbs: 'energetic'
    },
    royal_gold: {
      bg: '#090909',
      accent: '#fbbf24',
      secondary: '#f59e0b',
      blur: '26px',
      opacity: '0.78',
      orbs: 'calm'
    },
    amoled_stealth: {
      bg: '#000000',
      accent: '#a855f7',
      secondary: '#3b82f6',
      blur: '14px',
      opacity: '0.85',
      orbs: 'disabled'
    },
    midnight_ocean: {
      bg: '#061121',
      accent: '#06b6d4',
      secondary: '#3b82f6',
      blur: '26px',
      opacity: '0.70',
      orbs: 'smooth'
    }
  };

  applyThemePreset(presetKey) {
    const preset = this.themePresets[presetKey];
    if (!preset) return;
    this.currentPreset = presetKey;

    document.querySelectorAll('.theme-preset-card').forEach(card => {
      card.classList.toggle('active', card.dataset.preset === presetKey);
    });

    const bg = document.getElementById('themeBgColor');
    const bgHex = document.getElementById('themeBgColorHex');
    if (bg) bg.value = preset.bg;
    if (bgHex) bgHex.value = preset.bg;

    const acc = document.getElementById('themeAccentColor');
    const accHex = document.getElementById('themeAccentColorHex');
    if (acc) acc.value = preset.accent;
    if (accHex) accHex.value = preset.accent;

    const sec = document.getElementById('themeSecondaryColor');
    const secHex = document.getElementById('themeSecondaryColorHex');
    if (sec) sec.value = preset.secondary;
    if (secHex) secHex.value = preset.secondary;

    const blurNum = parseInt(preset.blur, 10) || 24;
    const blurSlider = document.getElementById('sliderGlassBlur');
    if (blurSlider) blurSlider.value = blurNum;
    const lblBlur = document.getElementById('labelGlassBlur');
    if (lblBlur) lblBlur.innerText = `${blurNum}px`;

    const opNum = Math.round(parseFloat(preset.opacity) * 100) || 72;
    const opSlider = document.getElementById('sliderGlassOpacity');
    if (opSlider) opSlider.value = opNum;
    const lblOp = document.getElementById('labelGlassOpacity');
    if (lblOp) lblOp.innerText = `${opNum}%`;

    const orbsSel = document.getElementById('selectOrbsMotion');
    if (orbsSel) orbsSel.value = preset.orbs || 'smooth';

    this.previewLiveCss();
  }

  previewLiveCss() {
    const bg = document.getElementById('themeBgColorHex') ? document.getElementById('themeBgColorHex').value : '#08080d';
    const accent = document.getElementById('themeAccentColorHex') ? document.getElementById('themeAccentColorHex').value : '#8b5cf6';
    const secondary = document.getElementById('themeSecondaryColorHex') ? document.getElementById('themeSecondaryColorHex').value : '#06b6d4';
    const blur = (document.getElementById('sliderGlassBlur') ? document.getElementById('sliderGlassBlur').value : '24') + 'px';
    const opacity = (parseInt(document.getElementById('sliderGlassOpacity') ? document.getElementById('sliderGlassOpacity').value : '72', 10) / 100).toString();
    const orbs = document.getElementById('selectOrbsMotion') ? document.getElementById('selectOrbsMotion').value : 'smooth';

    document.documentElement.style.setProperty('--bg-main', bg);
    document.documentElement.style.setProperty('--accent-primary', accent);
    document.documentElement.style.setProperty('--accent-primary-glow', accent + '55');
    document.documentElement.style.setProperty('--accent-secondary', secondary);
    document.documentElement.style.setProperty('--accent-secondary-glow', secondary + '55');
    document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${accent} 0%, #d946ef 50%, ${secondary} 100%)`);
    document.documentElement.style.setProperty('--glass-blur', blur);
    document.documentElement.style.setProperty('--glass-opacity', opacity);
    document.documentElement.style.setProperty('--bg-card', `rgba(18, 18, 28, ${opacity})`);

    const orbContainer = document.querySelector('.ambient-orbs-container');
    if (orbContainer) {
      if (orbs === 'disabled') {
        orbContainer.style.display = 'none';
      } else {
        orbContainer.style.display = 'block';
      }
    }
  }

  async saveGlassTheme() {
    const bg = document.getElementById('themeBgColorHex') ? document.getElementById('themeBgColorHex').value : '#08080d';
    const accent = document.getElementById('themeAccentColorHex') ? document.getElementById('themeAccentColorHex').value : '#8b5cf6';
    const secondary = document.getElementById('themeSecondaryColorHex') ? document.getElementById('themeSecondaryColorHex').value : '#06b6d4';
    const blur = (document.getElementById('sliderGlassBlur') ? document.getElementById('sliderGlassBlur').value : '24') + 'px';
    const opacity = (parseInt(document.getElementById('sliderGlassOpacity') ? document.getElementById('sliderGlassOpacity').value : '72', 10) / 100).toString();
    const orbs = document.getElementById('selectOrbsMotion') ? document.getElementById('selectOrbsMotion').value : 'smooth';

    const settings = {
      theme_bg: bg,
      theme_accent: accent,
      theme_secondary: secondary,
      glass_blur: blur,
      glass_opacity: opacity,
      orbs_motion: orbs,
      theme_preset: this.currentPreset || 'custom'
    };

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      const data = await res.json();
      if (data.success) {
        alert('✨ Glass Theme & Colors saved! The new design is now live across the platform.');
      } else {
        alert('Error: ' + data.message);
      }
    } catch (e) {
      alert('Error saving glass theme: ' + e.message);
    }
  }

  async loadThemeConfig() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (!data.success) return;
      const s = data.settings;

      const bg = s.theme_bg || '#08080d';
      const acc = s.theme_accent || '#8b5cf6';
      const sec = s.theme_secondary || '#06b6d4';
      const blur = s.glass_blur || '24px';
      const op = s.glass_opacity || '0.72';
      const orbs = s.orbs_motion || 'smooth';

      if (document.getElementById('themeBgColor')) document.getElementById('themeBgColor').value = bg;
      if (document.getElementById('themeBgColorHex')) document.getElementById('themeBgColorHex').value = bg;
      if (document.getElementById('themeAccentColor')) document.getElementById('themeAccentColor').value = acc;
      if (document.getElementById('themeAccentColorHex')) document.getElementById('themeAccentColorHex').value = acc;
      if (document.getElementById('themeSecondaryColor')) document.getElementById('themeSecondaryColor').value = sec;
      if (document.getElementById('themeSecondaryColorHex')) document.getElementById('themeSecondaryColorHex').value = sec;

      const blurVal = parseInt(blur, 10) || 24;
      if (document.getElementById('sliderGlassBlur')) document.getElementById('sliderGlassBlur').value = blurVal;
      if (document.getElementById('labelGlassBlur')) document.getElementById('labelGlassBlur').innerText = `${blurVal}px`;

      const opVal = Math.round(parseFloat(op) * 100) || 72;
      if (document.getElementById('sliderGlassOpacity')) document.getElementById('sliderGlassOpacity').value = opVal;
      if (document.getElementById('labelGlassOpacity')) document.getElementById('labelGlassOpacity').innerText = `${opVal}%`;

      if (document.getElementById('selectOrbsMotion')) document.getElementById('selectOrbsMotion').value = orbs;
    } catch (e) {
      console.error(e);
    }
  }

}

window.ownerStudio = new OwnerStudioController();
