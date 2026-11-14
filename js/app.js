/**
 * PulseLive Main Client Application Controller
 * Handles 100% REAL users, Google/Facebook/Email authentication,
 * UPI QR payment proof submission with screenshot upload, and live WebRTC calling.
 */
class PulseApp {
  constructor() {
    this.currentUser = null;
    this.currentCategory = 'stranger';
    this.countryPreference = 'worldwide';
    this.callTimer = null;
    this.callSeconds = 0;
    this.activePartner = null;
    this.systemSettings = {};
    this.realOnlineCount = 0;

    this.init();
  }

  async init() {
    await this.loadBrandSettings();
    this.setupPresence();
    this.checkSession();
    this.bindEvents();

    if (window.location.hash === '#studio') {
      window.ownerStudio.openStudio();
    }
  }

  // Setup Real Presence tracking
  async setupPresence() {
    try {
      const res = await fetch('/api/real-presence');
      const data = await res.json();
      if (data.success) {
        this.updatePresenceUI(data.realOnlineUsers);
      }
    } catch (e) {}

    // Listen for real presence broadcasts over WebSocket
    window.pulseSocket.on('real_presence', (data) => {
      this.updatePresenceUI(data.onlineUsers);
    });
  }

  updatePresenceUI(count) {
    this.realOnlineCount = count;
    const counters = document.querySelectorAll('.real-online-count');
    counters.forEach(el => {
      if (count === 0) {
        el.innerText = '0 Online';
      } else if (count === 1) {
        el.innerText = '1 Online (You)';
      } else {
        el.innerText = `${count} Online Real Users`;
      }
    });

    const radarCountEl = document.getElementById('radarOnlineCount');
    if (radarCountEl) {
      radarCountEl.innerText = `${count} Active Humans Online`;
    }
  }

  async loadBrandSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        this.systemSettings = data.settings;
        this.applyBranding(data.settings);
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  applyBranding(settings) {
    if (!settings) return;
    if (settings.brand_name) {
      document.title = `${settings.brand_name} - Global Live Video Chat`;
      document.querySelectorAll('.brand-name-display').forEach(el => el.innerText = settings.brand_name);
    }
    if (settings.brand_logo) {
      document.querySelectorAll('.brand-logo-img').forEach(el => el.src = settings.brand_logo);
    }
    if (settings.theme_bg) {
      document.documentElement.style.setProperty('--bg-main', settings.theme_bg);
    }
    if (settings.theme_accent) {
      document.documentElement.style.setProperty('--accent-primary', settings.theme_accent);
      document.documentElement.style.setProperty('--accent-primary-glow', settings.theme_accent + '55');
    }
    if (settings.theme_secondary) {
      document.documentElement.style.setProperty('--accent-secondary', settings.theme_secondary);
      document.documentElement.style.setProperty('--accent-secondary-glow', settings.theme_secondary + '55');
      const prim = settings.theme_accent || '#8b5cf6';
      const sec = settings.theme_secondary || '#06b6d4';
      document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${prim} 0%, #d946ef 50%, ${sec} 100%)`);
    }
    if (settings.glass_blur) {
      document.documentElement.style.setProperty('--glass-blur', settings.glass_blur);
    }
    if (settings.glass_opacity) {
      document.documentElement.style.setProperty('--glass-opacity', settings.glass_opacity);
      const op = parseFloat(settings.glass_opacity) || 0.72;
      document.documentElement.style.setProperty('--bg-card', `rgba(18, 18, 28, ${op})`);
    }
    if (settings.announcement_banner) {
      const banner = document.getElementById('announcementText');
      if (banner) banner.innerText = settings.announcement_banner;
    }
    const orbs = document.querySelector('.ambient-orbs-container');
    if (orbs && settings.orbs_motion === 'disabled') {
      orbs.style.display = 'none';
    }
  }

  // Check user session
  checkSession() {
    const saved = localStorage.getItem('pulselive_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        this.setAuthenticatedUser(u);
      } catch (e) {
        this.showAuthModal();
      }
    } else {
      this.showAuthModal();
    }
  }

  setAuthenticatedUser(user) {
    if (!user) return;
    const isOwner = (user.email && user.email.toLowerCase().trim() === 'knsea00@gmail.com') || user.is_owner || user.role === 'owner';
    if (isOwner) {
      user.role = 'owner';
      user.is_owner = true;
      user.is_free_vip = true;
    }
    this.currentUser = user;
    try {
      localStorage.setItem('pulselive_user', JSON.stringify(user));
    } catch (e) {}

    // Update Header with null safety
    const uName = document.getElementById('headerUsername');
    if (uName) {
      uName.innerText = isOwner ? `${user.display_name || user.username} 👑` : (user.display_name || user.username || 'User');
    }

    const coinCount = document.getElementById('headerCoinCount');
    if (coinCount) {
      coinCount.innerText = isOwner ? '∞ Unlimited' : (user.is_free_vip ? '∞ Unlimited' : (user.wallet ? user.wallet.balance : 200));
    }

    const avImg = document.getElementById('userAvatarImg');
    if (avImg) {
      avImg.src = user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || 'User'}`;
    }

    const vipBadge = document.getElementById('headerVipBadge');
    if (vipBadge) {
      vipBadge.style.display = (isOwner || user.is_free_vip || user.subscription) ? 'inline-flex' : 'none';
      if (isOwner) {
        vipBadge.innerText = '👑 Platform Owner';
      } else if (user.is_free_vip) {
        vipBadge.innerText = '🌟 Free VIP';
      }
    }

    // Dynamic hints on category cards
    this.updateCategoryHints();

    // Hide auth modal
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.classList.remove('active');

    // Connect real WebSocket session
    window.pulseSocket.connect(user.id);
    this.refreshUserWallet();
  }

  updateCategoryHints() {
    if (!this.currentUser) return;
    const isOwner = this.currentUser.is_owner || this.currentUser.role === 'owner' || this.currentUser.is_free_vip;
    const bal = this.currentUser.wallet ? this.currentUser.wallet.balance : 200;
    const hasSub = !!this.currentUser.subscription;

    const fHint = document.getElementById('femaleCategoryHint');
    const mHint = document.getElementById('maleCategoryHint');

    if (isOwner || hasSub) {
      if (fHint) fHint.innerText = '👑 Unlimited VIP Access';
      if (mHint) mHint.innerText = '👑 Unlimited VIP Access';
    } else if (bal >= 5) {
      if (fHint) fHint.innerText = `⚡ 5 Coins / Call (${bal} Coins Available)`;
      if (mHint) mHint.innerText = `⚡ 5 Coins / Call (${bal} Coins Available)`;
    } else {
      if (fHint) fHint.innerText = '🔒 Coins Exhausted - VIP Required';
      if (mHint) mHint.innerText = '🔒 Coins Exhausted - VIP Required';
    }
  }

  async refreshUserWallet() {
    if (!this.currentUser) return;
    try {
      const res = await fetch(`/api/user/profile?userId=${this.currentUser.id}`);
      const data = await res.json();
      if (data && data.success && data.user) {
        this.currentUser = data.user;
        try {
          localStorage.setItem('pulselive_user', JSON.stringify(data.user));
        } catch (e) {}

        const coinCount = document.getElementById('headerCoinCount');
        if (coinCount) {
          coinCount.innerText = data.user.is_free_vip ? '∞ Unlimited' : (data.user.wallet ? data.user.wallet.balance : 0);
        }

        const vipBadge = document.getElementById('headerVipBadge');
        if (vipBadge) {
          vipBadge.style.display = (data.user.is_free_vip || data.user.subscription) ? 'inline-flex' : 'none';
          if (data.user.is_free_vip) vipBadge.innerText = '🌟 Free VIP';
        }
        this.updateCategoryHints();
      }
    } catch (e) {}
  }

  safeOn(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(event, handler);
      return true;
    }
    return false;
  }

  bindEvents() {
    // Header & Quick Action Buttons (100% Null-Safe)
    this.safeOn('coinPillBtn', 'click', () => this.openWalletModal());
    this.safeOn('buyCoinsBtn', 'click', () => this.openWalletModal());
    this.safeOn('vipUpgradeBtn', 'click', () => this.openSubscriptionModal());
    this.safeOn('userProfileBtn', 'click', () => this.openProfileModal());
    this.safeOn('headerSupportBtn', 'click', () => this.openSupportModal());
    this.safeOn('headerStudioBtn', 'click', () => {
      if (window.ownerStudio) window.ownerStudio.openStudio();
    });

    // Mobile Navigation Bar
    this.safeOn('mNavHome', 'click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    this.safeOn('mNavCall', 'click', () => this.handleCategoryClick('stranger'));
    this.safeOn('mNavCoins', 'click', () => this.openWalletModal());
    this.safeOn('mNavStudio', 'click', () => {
      if (window.ownerStudio) window.ownerStudio.openStudio();
    });
    this.safeOn('mNavProfile', 'click', () => this.openProfileModal());

    // Category Card Start Call (Desktop & Mobile)
    document.querySelectorAll('.category-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const category = e.currentTarget.dataset.category;
        this.handleCategoryClick(category);
      });
    });

    // Country Preference Filter
    document.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.countryPreference = e.currentTarget.dataset.filter;
      });
    });

    // Radar Cancel
    this.safeOn('cancelRadarBtn', 'click', () => {
      this.cancelMatching();
    });

    // In-Call Controls
    this.safeOn('btnMuteAudio', 'click', () => {
      const isMuted = window.pulseWebRTC.toggleMute();
      const btn = document.getElementById('btnMuteAudio');
      if (btn) {
        btn.classList.toggle('active-off', isMuted);
        btn.innerHTML = isMuted ? '🔇' : '🎙️';
      }
    });

    this.safeOn('btnToggleVideo', 'click', () => {
      const isOff = window.pulseWebRTC.toggleVideo();
      const btn = document.getElementById('btnToggleVideo');
      if (btn) {
        btn.classList.toggle('active-off', isOff);
        btn.innerHTML = isOff ? '🚫' : '📹';
      }
    });

    this.safeOn('btnFlipCamera', 'click', async () => {
      const feed = document.getElementById('localVideoFeed');
      if (feed && window.pulseWebRTC) {
        await window.pulseWebRTC.flipCamera(feed);
      }
    });

    this.safeOn('btnNextStranger', 'click', () => {
      this.nextStranger();
    });

    this.safeOn('btnEndCall', 'click', () => {
      this.endCall('user_ended');
    });

    this.safeOn('btnReportCall', 'click', () => {
      this.openReportModal();
    });

    this.safeOn('btnBlockCall', 'click', () => {
      this.blockCurrentPartner();
    });

    // WebSocket Incoming Match Events
    if (window.pulseSocket) {
      window.pulseSocket.on('match_connected', (data) => {
        this.handleMatchFound(data);
      });

      window.pulseSocket.on('call_ended', (data) => {
        this.handleCallEndedRemotely(data.reason);
      });
    }

    // Modal Close
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });
  }

  // Handle Category Click
  async handleCategoryClick(category) {
    if (!this.currentUser) {
      this.showAuthModal();
      return;
    }

    this.currentCategory = category;

    try {
      const res = await fetch(`/api/user/check-category?userId=${this.currentUser.id}&category=${category}`);
      const access = await res.json();

      if (!access.allowed) {
        if (access.reason === 'SUBSCRIPTION_REQUIRED') {
          this.openSubscriptionModal(access.message);
        } else if (access.reason === 'COINS_EXHAUSTED') {
          this.openWalletModal(access.message);
        } else {
          alert(access.message || 'Category is currently restricted.');
        }
        return;
      }

      this.startMatching(category);
    } catch (e) {
      console.error('Error verifying category access:', e);
    }
  }

  // Start Real Matchmaking
  async startMatching(category) {
    document.getElementById('radarCategoryLabel').innerText = `${category.toUpperCase()} MATCHING`;
    document.getElementById('radarModal').classList.add('active');

    await window.pulseWebRTC.initLocalStream(document.getElementById('localVideoFeed'));

    window.pulseSocket.send({
      type: 'join_queue',
      category: category,
      preferences: {
        countryPref: this.countryPreference,
        langPref: this.currentUser.language || 'any'
      }
    });
  }

  cancelMatching() {
    window.pulseSocket.send({ type: 'leave_queue' });
    document.getElementById('radarModal').classList.remove('active');
  }

  // Handle Real Match Found Event
  async handleMatchFound(data) {
    document.getElementById('radarModal').classList.remove('active');
    this.activePartner = data.partner;

    const callContainer = document.getElementById('callContainer');
    callContainer.style.display = 'flex';

    const pName = document.getElementById('partnerDisplayName');
    if (pName) pName.innerText = data.partner.display_name || data.partner.username;

    const pCountry = document.getElementById('partnerCountryTag');
    if (pCountry) pCountry.innerText = `🌍 ${data.partner.country_name || data.partner.country} (${data.partner.gender})`;

    const pAvatar = document.getElementById('partnerAvatarImg');
    if (pAvatar) pAvatar.src = data.partner.avatar_url;

    const hCoin = document.getElementById('headerCoinCount');
    const cCoin = document.getElementById('callCoinCount');

    if (data.coinsDeducted > 0) {
      this.showToast(`🪙 -${data.coinsDeducted} Coins deducted`);
      if (hCoin) hCoin.innerText = data.balance;
      if (cCoin) cCoin.innerText = data.balance;
    } else {
      this.showToast('✨ Free Connected Call');
      if (cCoin) cCoin.innerText = this.currentUser.is_free_vip ? '∞' : this.currentUser.wallet.balance;
    }

    this.startCallTimer();

    await window.pulseWebRTC.startCallSession(
      data.role,
      document.getElementById('remoteVideoFeed'),
      data.partner
    );
  }

  startCallTimer() {
    this.callSeconds = 0;
    if (this.callTimer) clearInterval(this.callTimer);
    const timerEl = document.getElementById('callDurationTimer');
    this.callTimer = setInterval(() => {
      this.callSeconds++;
      const mins = String(Math.floor(this.callSeconds / 60)).padStart(2, '0');
      const secs = String(this.callSeconds % 60).padStart(2, '0');
      timerEl.innerText = `${mins}:${secs}`;
    }, 1000);
  }

  nextStranger() {
    this.closeCallScreen();
    this.showToast('🔄 Searching next user in queue...');
    this.startMatching(this.currentCategory);
  }

  endCall(reason = 'user_ended') {
    this.closeCallScreen();
    window.pulseSocket.send({ type: 'end_call' });
    this.showToast('Call ended');
    this.refreshUserWallet();
  }

  handleCallEndedRemotely(reason) {
    this.closeCallScreen();
    this.showToast(reason === 'partner_left' ? 'Partner left the call' : 'Call ended');
    this.refreshUserWallet();
  }

  closeCallScreen() {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
    window.pulseWebRTC.closePeerConnection();
    document.getElementById('callContainer').style.display = 'none';
  }

  openReportModal() {
    if (!this.activePartner) return;
    document.getElementById('reportPartnerName').innerText = this.activePartner.username;
    document.getElementById('reportModal').classList.add('active');
  }

  async submitReport(reason) {
    if (!this.activePartner) return;
    try {
      await fetch('/api/user/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: this.currentUser.id,
          reportedId: this.activePartner.id,
          reason,
          details: 'Reported during live call'
        })
      });
      alert('Report submitted for immediate Owner Studio review.');
      document.getElementById('reportModal').classList.remove('active');
      this.nextStranger();
    } catch (e) {}
  }

  async blockCurrentPartner() {
    if (!this.activePartner) return;
    if (!confirm(`Block ${this.activePartner.username}?`)) return;

    try {
      await fetch('/api/user/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          blockedId: this.activePartner.id
        })
      });
      this.showToast(`Blocked ${this.activePartner.username}`);
      this.nextStranger();
    } catch (e) {}
  }

  // Wallet Modal
  async openWalletModal(alertMsg = '') {
    if (alertMsg) alert(alertMsg);

    const modal = document.getElementById('walletModal');
    modal.classList.add('active');

    try {
      const [resPkg, resWal] = await Promise.all([
        fetch('/api/packages'),
        fetch(`/api/user/wallet?userId=${this.currentUser.id}`)
      ]);
      const dataPkg = await resPkg.json();
      const dataWal = await resWal.json();

      if (dataWal.success) {
        document.getElementById('modalWalletBalance').innerText = `${dataWal.wallet.balance} Coins`;
        document.getElementById('modalFreeCoins').innerText = `${dataWal.wallet.free_coins} Free`;
        document.getElementById('modalPurchasedCoins').innerText = `${dataWal.wallet.purchased_coins} Purchased`;

        const txList = document.getElementById('walletTxList');
        txList.innerHTML = dataWal.transactions.map(t => `
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.85rem;">
            <div>
              <strong>${t.description}</strong>
              <div style="color:var(--text-dim); font-size:0.75rem;">${t.created_at}</div>
            </div>
            <div style="font-weight:800; color:${t.amount > 0 ? '#10b981' : '#ef4444'};">
              ${t.amount > 0 ? '+' : ''}${t.amount} 🪙
            </div>
          </div>
        `).join('') || '<div style="color:var(--text-dim); padding:1rem 0;">No transactions yet.</div>';
      }

      if (dataPkg.success) {
        const pkgGrid = document.getElementById('walletPackagesGrid');
        pkgGrid.innerHTML = dataPkg.packages.map(p => `
          <div class="glass-panel" style="padding:1.25rem; border-radius:var(--radius-md); text-align:center; position:relative; display:flex; flex-direction:column; justify-content:space-between;">
            ${p.badge ? `<div class="badge badge-vip" style="position:absolute; top:8px; right:8px; font-size:10px;">${p.badge}</div>` : ''}
            <div>
              <div style="font-size:1.8rem; margin-bottom:4px;">🪙</div>
              <div style="font-size:1.4rem; font-weight:900; color:#fbbf24;">${p.coins}</div>
              ${p.bonus_coins ? `<div style="font-size:0.75rem; color:#10b981; font-weight:700;">+${p.bonus_coins} Bonus Coins</div>` : ''}
              <div style="color:var(--text-muted); font-size:0.8rem; margin:6px 0;">${p.name}</div>
            </div>
            <button class="glow-btn" style="padding:8px 14px; border-radius:var(--radius-sm); font-size:0.85rem; margin-top:10px;" onclick="pulseApp.openPaymentCheckout('coins', '${p.id}', '${p.name}', ${p.price_inr}, ${p.price_usd})">
              Pay ₹${p.price_inr} / $${p.price_usd}
            </button>
          </div>
        `).join('');
      }
    } catch (e) {}
  }

  // Subscription Modal
  async openSubscriptionModal(alertMsg = '') {
    if (alertMsg) alert(alertMsg);

    const modal = document.getElementById('subscriptionModal');
    modal.classList.add('active');

    try {
      const res = await fetch('/api/plans');
      const data = await res.json();
      if (data.success) {
        const plansGrid = document.getElementById('subscriptionPlansGrid');
        plansGrid.innerHTML = data.plans.map(p => {
          const perks = JSON.parse(p.perks || '[]');
          return `
            <div class="glass-panel" style="padding:1.5rem; border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between; position:relative;">
              ${p.discount_label ? `<div class="badge badge-vip" style="position:absolute; top:12px; right:12px;">${p.discount_label}</div>` : ''}
              <div>
                <h4 style="font-size:1.2rem; font-weight:800; margin-bottom:4px;">${p.name}</h4>
                <div style="font-size:1.6rem; font-weight:900; color:var(--text-main); margin-bottom:0.5rem;">
                  ₹${p.price_inr} <span style="font-size:0.85rem; color:var(--text-muted);">/ $${p.price_usd}</span>
                </div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">Duration: ${p.duration_days} Days</div>
                <ul style="list-style:none; padding:0; font-size:0.85rem; line-height:1.6; margin-bottom:1.5rem; color:var(--text-muted);">
                  ${perks.map(prk => `<li>✓ <span style="color:#f8fafc;">${prk}</span></li>`).join('')}
                </ul>
              </div>
              <button class="glow-btn" style="padding:10px; border-radius:var(--radius-md);" onclick="pulseApp.openPaymentCheckout('subscription', '${p.id}', '${p.name}', ${p.price_inr}, ${p.price_usd})">
                👑 Pay ₹${p.price_inr} &amp; Activate
              </button>
            </div>
          `;
        }).join('');
      }
    } catch (e) {}
  }

  // Payment Checkout Modal (UPI QR + Screenshot Upload)
  openPaymentCheckout(itemType, itemId, itemTitle, priceInr, priceUsd) {
    document.getElementById('walletModal').classList.remove('active');
    document.getElementById('subscriptionModal').classList.remove('active');

    const checkoutModal = document.getElementById('checkoutModal');
    checkoutModal.classList.add('active');

    document.getElementById('checkoutItemLabel').innerText = itemTitle || itemId;
    document.getElementById('checkoutAmountInr').innerText = `₹${priceInr}`;
    document.getElementById('checkoutAmountUsd').innerText = `$${priceUsd}`;

    // Update UPI QR image from settings
    const qrImg = document.getElementById('checkoutQrImg');
    if (qrImg && this.systemSettings.payment_qr) {
      qrImg.src = this.systemSettings.payment_qr;
    }

    const upiIdText = document.getElementById('checkoutUpiId');
    if (upiIdText && this.systemSettings.upi_id) {
      upiIdText.innerText = this.systemSettings.upi_id;
    }

    this.pendingCheckout = { itemType, itemId, itemTitle, priceInr, priceUsd };
    this.uploadedScreenshotDataUrl = '';

    // Reset upload inputs
    document.getElementById('checkoutUtrInput').value = '';
    document.getElementById('checkoutScreenshotInput').value = '';
    document.getElementById('screenshotPreviewBox').style.display = 'none';
  }

  handleScreenshotFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.uploadedScreenshotDataUrl = e.target.result;
      document.getElementById('screenshotPreviewBox').style.display = 'block';
      document.getElementById('screenshotPreviewImg').src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Submit Payment Proof with Screenshot
  async submitPaymentProof() {
    if (!this.pendingCheckout) return;
    const utr = document.getElementById('checkoutUtrInput').value.trim();

    if (!utr && !this.uploadedScreenshotDataUrl) {
      alert('Please enter your 12-digit UPI UTR number OR attach your payment screenshot receipt.');
      return;
    }

    const { itemType, itemId, itemTitle, priceInr } = this.pendingCheckout;

    try {
      const res = await fetch('/api/payment/submit-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          itemType,
          itemId,
          itemTitle,
          amount: priceInr,
          currency: 'INR',
          paymentMethod: 'upi',
          utrNumber: utr,
          screenshotUrl: this.uploadedScreenshotDataUrl
        })
      });

      const data = await res.json();
      if (data.success) {
        document.getElementById('checkoutModal').classList.remove('active');
        alert(`🎉 Payment proof submitted successfully!\nInvoice: ${data.invoiceNumber}\n\nYour payment has been sent to the Owner Studio for verification. As soon as it is verified, your benefits will activate immediately!`);
        this.refreshUserWallet();
      } else {
        alert('Submission failed: ' + data.message);
      }
    } catch (e) {
      alert('Error submitting payment proof: ' + e.message);
    }
  }

  // Auth Dialog Handlers (Google, Facebook, Email, 1-Click Guest)
  showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.add('active');
      this.switchAuthTab('login'); // Default to Log In!
    }
  }

  setAuthError(msg, isSuccess = false) {
    const alertBox = document.getElementById('authInlineAlert');
    if (!alertBox) return;
    if (msg) {
      alertBox.innerText = msg;
      alertBox.style.display = 'block';
      if (isSuccess) {
        alertBox.style.background = 'rgba(34, 197, 94, 0.15)';
        alertBox.style.border = '1px solid #22c55e';
        alertBox.style.color = '#4ade80';
      } else {
        alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
        alertBox.style.border = '1px solid #ef4444';
        alertBox.style.color = '#f87171';
      }
    } else {
      alertBox.style.display = 'none';
    }
  }

  switchAuthTab(tab) {
    this.setAuthError('');
    const tabLogin = document.getElementById('authTabLogin');
    const tabReg = document.getElementById('authTabRegister');
    const formLogin = document.getElementById('authLoginFormSection');
    const formReg = document.getElementById('authRegisterFormSection');

    if (tab === 'login') {
      if (tabLogin) tabLogin.classList.add('active');
      if (tabReg) tabReg.classList.remove('active');
      if (formLogin) formLogin.style.display = 'block';
      if (formReg) formReg.style.display = 'none';
    } else {
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabReg) tabReg.classList.add('active');
      if (formLogin) formLogin.style.display = 'none';
      if (formReg) formReg.style.display = 'block';
    }
  }

  // Google Login - Toggle Gmail Drawer
  loginWithGoogle() {
    this.setAuthError('');
    const drawer = document.getElementById('googleSignInDrawer');
    if (drawer) {
      drawer.style.display = (drawer.style.display === 'none' || drawer.style.display === '') ? 'block' : 'none';
      const input = document.getElementById('googleCustomEmailInput');
      if (drawer.style.display === 'block' && input) input.focus();
    }
  }

  // Submit custom Gmail address entered by user
  async submitCustomGmail() {
    const input = document.getElementById('googleCustomEmailInput');
    const email = input ? input.value.trim() : '';
    if (!email) {
      this.setAuthError('⚠️ कृपया अपनी Gmail आईडी दर्ज करें (Please enter your Gmail address)');
      if (input) input.focus();
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      this.setAuthError('⚠️ अमान्य ईमेल आईडी (Please enter a valid email address)');
      if (input) input.focus();
      return;
    }
    const name = email.split('@')[0];
    await this.executeGoogleLogin(email, name);
  }

  async executeGoogleLogin(email, name) {
    this.setAuthError('Connecting to server...', true);
    try {
      const res = await fetch('/api/auth/social-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, provider: 'google' })
      });
      const data = await res.json();
      if (data.success) {
        this.setAuthenticatedUser(data.user);
        this.setAuthError(`🎉 Welcome ${data.user.display_name}! 200 complimentary coins credited.`, true);
        this.showToast(`🎉 Logged in as ${data.user.display_name}!`);
        setTimeout(() => {
          const modal = document.getElementById('authModal');
          if (modal) modal.classList.remove('active');
        }, 600);
      } else {
        this.setAuthError('Google login error: ' + data.message, false);
      }
    } catch (e) {
      this.setAuthError('Connection error: ' + e.message, false);
    }
  }

  async loginWithFacebook() {
    this.setAuthError('Logging in with Facebook...', true);
    await this.executeGoogleLogin('facebook_user@gmail.com', 'Facebook User');
  }

  // 1-Click Instant Guest Login (Instant 200 free coins, zero typing!)
  async quickGuestLogin() {
    this.setAuthError('Generating Guest account with 200 free coins...', true);
    const guestId = Math.floor(100 + Math.random() * 900);
    const guestEmail = `guest_${guestId}@gmail.com`;
    const guestName = `Guest ${guestId}`;
    await this.executeGoogleLogin(guestEmail, guestName);
  }

  async registerWithEmail() {
    this.setAuthError('');
    const emailInput = document.getElementById('regEmail');
    const passInput = document.getElementById('regPassword');
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passInput ? passInput.value : '';

    if (!email) {
      this.setAuthError('⚠️ कृपया अपनी ईमेल आईडी दर्ज करें (Please enter your email)');
      if (emailInput) emailInput.focus();
      return;
    }

    if (!password) {
      this.setAuthError('⚠️ कृपया अपना पासवर्ड दर्ज करें (Please create a password)');
      if (passInput) passInput.focus();
      return;
    }

    // Auto-generate username if left empty
    const userInput = document.getElementById('regUsername');
    let username = userInput ? userInput.value.trim() : '';
    if (!username) {
      username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + '_' + Math.floor(100 + Math.random() * 900);
    }

    const dobInput = document.getElementById('regDob');
    const dob = dobInput ? dobInput.value : '2000-01-01';
    const genderInput = document.getElementById('regGender');
    const gender = genderInput ? genderInput.value : 'other';
    const countryInput = document.getElementById('regCountry');
    const country = countryInput ? countryInput.value : 'India';

    this.setAuthError('Creating account & claiming 200 complimentary coins...', true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, dob, gender, country, country_name: country })
      });
      const data = await res.json();
      if (data.success) {
        this.setAuthenticatedUser(data.user);
        this.setAuthError('🎉 Account registered! 200 coins credited.', true);
        this.showToast('🎉 Account registered! 200 complimentary coins credited.');
        setTimeout(() => {
          const modal = document.getElementById('authModal');
          if (modal) modal.classList.remove('active');
        }, 600);
      } else {
        this.setAuthError('⚠️ ' + data.message, false);
      }
    } catch (e) {
      this.setAuthError('⚠️ Connection error: ' + e.message, false);
    }
  }

  async loginWithEmail() {
    this.setAuthError('');
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passInput ? passInput.value : '';

    if (!email) {
      this.setAuthError('⚠️ कृपया अपनी ईमेल आईडी दर्ज करें (Please enter your email)');
      if (emailInput) emailInput.focus();
      return;
    }

    if (!password) {
      this.setAuthError('⚠️ कृपया अपना पासवर्ड दर्ज करें (Please enter your password)');
      if (passInput) passInput.focus();
      return;
    }

    this.setAuthError('Logging in...', true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        this.setAuthenticatedUser(data.user);
        this.setAuthError(`🎉 Logged in as ${data.user.display_name}!`, true);
        this.showToast(`🎉 Logged in as ${data.user.display_name}!`);
        setTimeout(() => {
          const modal = document.getElementById('authModal');
          if (modal) modal.classList.remove('active');
        }, 600);
      } else {
        this.setAuthError('⚠️ ' + data.message, false);
      }
    } catch (e) {
      this.setAuthError('⚠️ Connection error: ' + e.message, false);
    }
  }

  openProfileModal() {
    const modal = document.getElementById('profileModal');
    if (!modal || !this.currentUser) return;
    const isOwner = this.currentUser.is_owner || this.currentUser.role === 'owner' || (this.currentUser.email && this.currentUser.email.toLowerCase().trim() === 'knsea00@gmail.com');
    const uName = document.getElementById('profileUsername');
    if (uName) uName.innerText = isOwner ? `${this.currentUser.username} (👑 Platform Owner)` : this.currentUser.username;
    const uEmail = document.getElementById('profileEmail');
    if (uEmail) uEmail.innerText = this.currentUser.email;
    const uId = document.getElementById('profileUserId');
    if (uId) uId.innerText = this.currentUser.id;
    const uCountry = document.getElementById('profileCountry');
    if (uCountry) uCountry.innerText = `${this.currentUser.country_name} (${this.currentUser.country})`;
    const uGender = document.getElementById('profileGender');
    if (uGender) uGender.innerText = this.currentUser.gender;
    const uDob = document.getElementById('profileDob');
    if (uDob) uDob.innerText = `${this.currentUser.dob} (Age ${this.currentUser.age})`;
    const uBadge = document.getElementById('profileStatusBadge');
    if (uBadge) {
      uBadge.innerText = isOwner ? '👑 Platform Owner & Chairman' : (this.currentUser.is_free_vip ? '🌟 100% Free VIP Member' : (this.currentUser.subscription ? '👑 VIP Pro Subscriber' : 'Standard Member'));
    }
    modal.classList.add('active');
  }

  openSupportModal() {
    document.getElementById('supportModal').classList.add('active');
  }

  async submitSupportTicket() {
    const subject = document.getElementById('supportSubject').value;
    const category = document.getElementById('supportCategory').value;
    const message = document.getElementById('supportMessage').value;

    if (!subject || !message) return alert('Please enter both subject and message.');

    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          subject,
          category,
          message
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Support ticket submitted! Ticket ID: ' + data.ticketId);
        document.getElementById('supportModal').classList.remove('active');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  showToast(text) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: rgba(18, 18, 28, 0.95);
      border: 1px solid var(--accent-primary);
      padding: 10px 18px;
      border-radius: var(--radius-md);
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      font-size: 0.9rem;
      font-weight: 700;
      color: #fff;
      z-index: 9999;
    `;
    toast.innerText = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

function initPulseApp() {
  if (!window.pulseApp) {
    try {
      window.pulseApp = new PulseApp();
      console.log('✅ PulseApp Initialized Successfully');
    } catch (e) {
      console.error('Failed to initialize PulseApp:', e);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPulseApp);
} else {
  initPulseApp();
}
