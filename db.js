/**
 * PulseLive Enterprise Database Layer
 * Built with node:sqlite (SQLite 3.53 with WAL mode, foreign keys, & ACID atomic transactions)
 */
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'pulselive.db');
const db = new DatabaseSync(DB_PATH);

// Configure database pragmas for high concurrency & safety
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
`);

function initSchema() {
  db.exec(`
    -- System Settings & Brand Customization (Live CMS)
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      dob TEXT NOT NULL,
      age INTEGER NOT NULL,
      country TEXT NOT NULL,
      country_name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      gender TEXT NOT NULL, -- 'male', 'female', 'other'
      match_preference TEXT DEFAULT 'worldwide',
      role TEXT DEFAULT 'user', -- 'user', 'moderator', 'admin', 'super_admin'
      is_verified INTEGER DEFAULT 0,
      is_free_vip INTEGER DEFAULT 0, -- When 1, user has 100% free unlimited VIP access
      is_banned INTEGER DEFAULT 0,
      ban_reason TEXT DEFAULT '',
      is_suspended INTEGER DEFAULT 0,
      suspended_until DATETIME,
      online_status INTEGER DEFAULT 0,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Wallets Table
    CREATE TABLE IF NOT EXISTS wallets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance INTEGER NOT NULL DEFAULT 200,
      free_coins INTEGER NOT NULL DEFAULT 200,
      purchased_coins INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      welcome_bonus_claimed INTEGER NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Coin Transactions Table (Strict Ledger)
    CREATE TABLE IF NOT EXISTS coin_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'welcome_bonus', 'call_deduction', 'purchase', 'promo_gift', 'refund', 'admin_adjustment'
      balance_after INTEGER NOT NULL,
      description TEXT NOT NULL,
      reference_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Subscription Plans Table
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      price_usd REAL NOT NULL,
      price_inr REAL NOT NULL,
      discount_label TEXT DEFAULT '',
      perks TEXT NOT NULL, -- JSON string
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- User Subscriptions Table
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      payment_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Coin Packages Table
    CREATE TABLE IF NOT EXISTS coin_packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      coins INTEGER NOT NULL,
      bonus_coins INTEGER NOT NULL DEFAULT 0,
      price_usd REAL NOT NULL,
      price_inr REAL NOT NULL,
      badge TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Payments Table with Screenshot Upload & UTR Verification
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL, -- 'coins', 'subscription'
      item_id TEXT NOT NULL,
      item_title TEXT DEFAULT '',
      amount REAL NOT NULL,
      currency TEXT NOT NULL, -- 'USD', 'INR'
      payment_method TEXT NOT NULL, -- 'upi', 'card', 'netbanking', 'wallet'
      status TEXT NOT NULL DEFAULT 'pending_verification', -- 'pending_verification', 'completed', 'rejected'
      transaction_ref TEXT,
      utr_number TEXT DEFAULT '',
      screenshot_url TEXT DEFAULT '',
      invoice_number TEXT NOT NULL,
      admin_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- Video Calls History & Billing
    CREATE TABLE IF NOT EXISTS video_calls (
      id TEXT PRIMARY KEY,
      caller_id TEXT NOT NULL REFERENCES users(id),
      receiver_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL, -- 'stranger', 'male', 'female'
      status TEXT NOT NULL, -- 'connecting', 'connected', 'ended', 'rejected', 'failed'
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      connected_at DATETIME,
      ended_at DATETIME,
      duration_seconds INTEGER DEFAULT 0,
      coins_deducted INTEGER DEFAULT 0,
      disconnect_reason TEXT DEFAULT ''
    );

    -- Reports Table
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      call_id TEXT,
      reason TEXT NOT NULL,
      details TEXT DEFAULT '',
      status TEXT DEFAULT 'pending', -- 'pending', 'reviewed', 'action_taken', 'dismissed'
      action_taken TEXT DEFAULT '',
      admin_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Blocks Table
    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, blocked_id)
    );

    -- Coupons Table
    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      discount_percent INTEGER NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 100,
      times_used INTEGER NOT NULL DEFAULT 0,
      expires_at DATETIME,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Notifications Table
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customer Support Tickets
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      category TEXT NOT NULL, -- 'payment', 'account', 'technical', 'safety', 'other'
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
      admin_reply TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit Logs (Owner & Admin traceability)
    CREATE TABLE IF NOT EXISTS admin_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_gender ON users(gender);
    CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);

  // Migrate existing tables if missing columns
  try {
    const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!userCols.includes('is_free_vip')) {
      db.exec('ALTER TABLE users ADD COLUMN is_free_vip INTEGER DEFAULT 0;');
    }
    const payCols = db.prepare('PRAGMA table_info(payments)').all().map(c => c.name);
    if (!payCols.includes('utr_number')) {
      db.exec('ALTER TABLE payments ADD COLUMN utr_number TEXT DEFAULT "";');
    }
    if (!payCols.includes('screenshot_url')) {
      db.exec('ALTER TABLE payments ADD COLUMN screenshot_url TEXT DEFAULT "";');
    }
    if (!payCols.includes('item_title')) {
      db.exec('ALTER TABLE payments ADD COLUMN item_title TEXT DEFAULT "";');
    }
    if (!payCols.includes('admin_notes')) {
      db.exec('ALTER TABLE payments ADD COLUMN admin_notes TEXT DEFAULT "";');
    }
    if (!payCols.includes('completed_at')) {
      db.exec('ALTER TABLE payments ADD COLUMN completed_at DATETIME;');
    }
  } catch (e) {
    console.warn('Migration note:', e.message);
  }

  // Ensure knsea00@gmail.com is Platform Owner with unlimited VIP access
  try {
    const ownerCheck = db.prepare('SELECT id FROM users WHERE email = ?').get('knsea00@gmail.com');
    if (ownerCheck) {
      db.prepare(`UPDATE users SET role = 'owner', is_free_vip = 1, is_verified = 1 WHERE email = ?`).run('knsea00@gmail.com');
      db.prepare(`UPDATE wallets SET balance = 999999, free_coins = 999999 WHERE user_id = ?`).run(ownerCheck.id);
    }
  } catch (e) {}

  seedDefaults();
}

function hashPassword(password) {
  const salt = 'pulselive_salt_2026_';
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function seedDefaults() {
  const defaultSettings = [
    ['brand_name', 'PulseLive'],
    ['brand_tagline', 'Global Live Random Video Chat'],
    ['brand_logo', '/assets/logo.svg'],
    ['payment_qr', '/assets/payment-qr.jpg'],
    ['upi_id', 'pulselive@upi'],
    ['upi_name', 'PulseLive Official'],
    ['owner_security_pin', '7890'], // Dedicated Owner Studio Security Passcode
    ['theme_accent', '#8b5cf6'],
    ['theme_secondary', '#06b6d4'],
    ['theme_bg', '#08080d'],
    ['welcome_coins', '200'],
    ['call_cost_coins', '5'],
    ['stranger_category_enabled', '1'],
    ['male_category_enabled', '1'],
    ['female_category_enabled', '1'],
    ['stranger_free_mode', '1'],
    ['female_access_mode', 'vip_only'], // 'vip_only', 'free', 'coins_only'
    ['male_access_mode', 'vip_only'],
    ['maintenance_mode', '0'],
    ['registration_enabled', '1'],
    ['max_call_duration_seconds', '3600'],
    ['announcement_banner', '✨ Welcome to PulseLive! Real live video chat. Register now for 200 free coins!'],
    ['terms_content', 'PulseLive Terms & Conditions: Strictly 18+ platform. Inappropriate behavior or harassment leads to immediate permanent ban.'],
    ['privacy_content', 'PulseLive Privacy Policy: Video calls are peer-to-peer and never recorded. No private credentials are shared with callers.'],
    ['support_email', 'support@pulselive.io']
  ];

  const insertSetting = db.prepare(`INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of defaultSettings) {
    insertSetting.run(k, v);
  }

  // Platform Owner: knsea00@gmail.com ONLY
  try {
    db.prepare('DELETE FROM users WHERE email = ?').run('owner@pulselive.io');
  } catch (e) {}

  const checkOwner = db.prepare(`SELECT id FROM users WHERE email = ?`).get('knsea00@gmail.com');
  if (checkOwner) {
    db.prepare(`UPDATE users SET role = 'owner', is_free_vip = 1, is_verified = 1, password_hash = ? WHERE email = ?`).run(hashPassword('knsea00@123'), 'knsea00@gmail.com');
  } else {
    const ownerId = 'PL-OWNER-DK';
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, username, display_name, avatar_url, dob, age,
        country, country_name, language, gender, role, is_verified, is_free_vip, online_status
      ) VALUES (?, ?, ?, ?, ?, ?, '1995-01-01', 31, 'IN', 'India', 'en', 'male', 'owner', 1, 1, 1)
    `).run(
      ownerId,
      'knsea00@gmail.com',
      hashPassword('knsea00@123'),
      'knsea00',
      'DK (Platform Owner)',
      'https://api.dicebear.com/7.x/bottts/svg?seed=knsea00'
    );

    db.prepare(`
      INSERT INTO wallets (user_id, balance, free_coins, purchased_coins, total_spent)
      VALUES (?, 999999, 999999, 0, 0)
    `).run(ownerId);
  }

  // Seed Default Subscription Plans
  const plans = [
    {
      id: 'plan_weekly',
      name: 'Weekly Premium',
      duration_days: 7,
      price_usd: 4.99,
      price_inr: 399,
      discount_label: 'Quick Pass',
      perks: JSON.stringify(['Full access to Male & Female categories', 'Country & region matching filters', 'High-definition 1080p priority', 'VIP profile badge'])
    },
    {
      id: 'plan_monthly',
      name: 'Monthly VIP',
      duration_days: 30,
      price_usd: 14.99,
      price_inr: 1199,
      discount_label: '🔥 Most Popular',
      perks: JSON.stringify(['Full access to Male & Female categories', 'Unlimited priority matching queue', 'Up to 4K adaptive video support', 'Exclusive VIP profile badge', 'Zero ad interruption'])
    },
    {
      id: 'plan_quarterly',
      name: 'Quarterly Elite',
      duration_days: 90,
      price_usd: 34.99,
      price_inr: 2799,
      discount_label: 'Save 30%',
      perks: JSON.stringify(['All Monthly VIP perks', 'Quarterly priority matching', 'Direct language filtering', '50 Bonus Coins included'])
    },
    {
      id: 'plan_yearly',
      name: 'Yearly Unlimited',
      duration_days: 365,
      price_usd: 99.99,
      price_inr: 7999,
      discount_label: 'Best Value (Save 50%)',
      perks: JSON.stringify(['Full 365 days VIP access to all categories', 'Maximum priority server bandwidth', 'Special Crown VIP avatar frame', '250 Bonus Coins included'])
    }
  ];

  const insertPlan = db.prepare(`
    INSERT OR IGNORE INTO subscription_plans (id, name, duration_days, price_usd, price_inr, discount_label, perks, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const p of plans) {
    insertPlan.run(p.id, p.name, p.duration_days, p.price_usd, p.price_inr, p.discount_label, p.perks);
  }

  // Seed Default Coin Packages
  const packages = [
    { id: 'pkg_100', name: 'Starter Pack', coins: 100, bonus: 0, usd: 1.99, inr: 149, badge: '20 Calls' },
    { id: 'pkg_500', name: 'Popular Pack', coins: 500, bonus: 50, usd: 7.99, inr: 599, badge: '🔥 +50 Bonus' },
    { id: 'pkg_1200', name: 'Value Pack', coins: 1200, bonus: 200, usd: 14.99, inr: 1199, badge: '⚡ Best Seller' },
    { id: 'pkg_3000', name: 'Whale Pack', coins: 3000, bonus: 800, usd: 29.99, inr: 2499, badge: '💎 +800 Bonus' }
  ];

  const insertPkg = db.prepare(`
    INSERT OR IGNORE INTO coin_packages (id, name, coins, bonus_coins, price_usd, price_inr, badge, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const pkg of packages) {
    insertPkg.run(pkg.id, pkg.name, pkg.coins, pkg.bonus, pkg.usd, pkg.inr, pkg.badge);
  }

  // Clean out fake demo users so owner only sees REAL registered people!
  try {
    db.exec(`
      DELETE FROM users WHERE email IN ('alice@pulselive.io', 'raj@pulselive.io', 'elena@pulselive.io', 'kenji@pulselive.io');
    `);
  } catch (e) {}
}

// ==========================================
// BUSINESS LOGIC & ATOMIC TRANSACTIONS
// ==========================================

// Register a new user with guaranteed 200 complimentary coins
function registerUser(data) {
  const dob = new Date(data.dob);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 18 || isNaN(age)) {
    throw new Error('AGE_RESTRICTED: You must be at least 18 years of age to register.');
  }

  const userId = 'PL-' + Math.floor(100000 + Math.random() * 900000);
  const passwordHash = hashPassword(data.password);

  const emailExists = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email.toLowerCase().trim());
  if (emailExists) throw new Error('EMAIL_EXISTS: An account with this email already exists.');

  const usernameExists = db.prepare('SELECT id FROM users WHERE username = ?').get(data.username.trim());
  if (usernameExists) throw new Error('USERNAME_EXISTS: This username is already taken.');

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, username, display_name, avatar_url,
        dob, age, country, country_name, language, gender, match_preference,
        role, is_verified, is_free_vip, online_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 0, 0, 1)
    `).run(
      userId,
      data.email.toLowerCase().trim(),
      passwordHash,
      data.username.trim(),
      data.display_name || data.username,
      data.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.username)}`,
      data.dob,
      age,
      data.country || 'IN',
      data.country_name || 'India',
      data.language || 'en',
      data.gender || 'other',
      data.match_preference || 'worldwide'
    );

    const welcomeCoins = parseInt(getSetting('welcome_coins') || '200', 10);
    db.prepare(`
      INSERT INTO wallets (user_id, balance, free_coins, purchased_coins, total_spent, welcome_bonus_claimed)
      VALUES (?, ?, ?, 0, 0, 1)
    `).run(userId, welcomeCoins, welcomeCoins);

    const txId = 'TX-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO coin_transactions (id, user_id, amount, type, balance_after, description, reference_id)
      VALUES (?, ?, ?, 'welcome_bonus', ?, 'Complimentary Welcome Bonus Coins', 'SIGNUP')
    `).run(txId, userId, welcomeCoins, welcomeCoins);

    const notifId = 'NT-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Welcome to PulseLive!', 'You received free welcome coins! Start calling now.', 'coin')
    `).run(notifId, userId);

    db.exec('COMMIT;');
    return getUserById(userId);
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// Google / Facebook OAuth or One-Click Email Login
function loginOrRegisterOAuth({ email, name, avatarUrl, provider = 'google' }) {
  if (!email) throw new Error('Email is required for social login.');
  const cleanEmail = email.toLowerCase().trim();

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    if (existing.is_banned) throw new Error(`ACCOUNT_BANNED: ${existing.ban_reason || 'Terms violation'}`);
    if (cleanEmail === 'knsea00@gmail.com') {
      db.prepare("UPDATE users SET role = 'owner', is_free_vip = 1, online_status = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(existing.id);
    } else {
      db.prepare('UPDATE users SET online_status = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    }
    return getUserById(existing.id);
  }

  // Create new user automatically from Google / Facebook
  const userId = 'PL-' + Math.floor(100000 + Math.random() * 900000);
  const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + '_' + Math.floor(100 + Math.random() * 900);

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, username, display_name, avatar_url,
        dob, age, country, country_name, language, gender, role, is_verified, is_free_vip, online_status
      ) VALUES (?, ?, ?, ?, ?, ?, '2000-01-01', 26, 'IN', 'India', 'en', 'other', 'user', 1, 0, 1)
    `).run(
      userId,
      cleanEmail,
      hashPassword('OAuth_Token_' + crypto.randomUUID()),
      baseUsername,
      name || baseUsername,
      avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${baseUsername}`
    );

    const welcomeCoins = parseInt(getSetting('welcome_coins') || '200', 10);
    db.prepare(`
      INSERT INTO wallets (user_id, balance, free_coins, purchased_coins, total_spent, welcome_bonus_claimed)
      VALUES (?, ?, ?, 0, 0, 1)
    `).run(userId, welcomeCoins, welcomeCoins);

    const txId = 'TX-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO coin_transactions (id, user_id, amount, type, balance_after, description, reference_id)
      VALUES (?, ?, ?, 'welcome_bonus', ?, 'Welcome Bonus Coins via Social Login', 'OAUTH')
    `).run(txId, userId, welcomeCoins, welcomeCoins);

    db.exec('COMMIT;');
    return getUserById(userId);
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// Authenticate user
function loginUser(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) throw new Error('INVALID_CREDENTIALS: Incorrect email or password.');
  if (!verifyPassword(password, user.password_hash)) {
    throw new Error('INVALID_CREDENTIALS: Incorrect email or password.');
  }
  if (user.is_banned) {
    throw new Error(`ACCOUNT_BANNED: Your account has been permanently suspended. Reason: ${user.ban_reason || 'Terms violation'}`);
  }

  db.prepare("UPDATE users SET online_status = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  return sanitizeUser(user);
}

function sanitizeUser(user) {
  if (!user) return null;
  const isOwnerEmail = user.email && user.email.toLowerCase().trim() === 'knsea00@gmail.com';
  const role = isOwnerEmail ? 'owner' : user.role;
  const is_free_vip = isOwnerEmail ? 1 : user.is_free_vip;
  const { password_hash, ...safe } = user;
  const wallet = getWallet(user.id);
  const activeSub = getActiveSubscription(user.id);
  return {
    ...safe,
    role,
    is_owner: isOwnerEmail || role === 'owner',
    is_free_vip: !!is_free_vip,
    wallet,
    subscription: activeSub || (is_free_vip ? { id: 'PERMANENT_FREE_VIP', plan_name: 'Owner Free VIP (Permanent)', perks: '[]', expires_at: '2099-12-31' } : null)
  };
}

function getUserById(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return sanitizeUser(user);
}

function getWallet(userId) {
  return db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId) || {
    user_id: userId, balance: 0, free_coins: 0, purchased_coins: 0, total_spent: 0
  };
}

function getActiveSubscription(userId) {
  return db.prepare(`
    SELECT s.*, p.name as plan_name, p.perks
    FROM subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = ? AND s.status = 'active' AND datetime(s.expires_at) > datetime('now')
    ORDER BY s.expires_at DESC LIMIT 1
  `).get(userId);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

function updateSetting(key, value, adminId = 'PL-ADMIN-01') {
  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value));

  logAdminAction(adminId, 'UPDATE_SETTING', 'system_settings', key, `Value changed to ${value}`);
}

// CHECK CATEGORY ACCESS ACCORDING TO USER'S EXACT SPECIFICATION
function checkCategoryAccess(userId, category) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { allowed: false, reason: 'USER_NOT_FOUND', message: 'User not found' };

  // If Owner granted 100% Free VIP to this user ID, allow EVERYTHING unconditionally!
  if (user.is_free_vip === 1) {
    return {
      allowed: true,
      category: category,
      freeVip: true,
      hasCoins: true,
      balance: 999999
    };
  }

  const wallet = getWallet(userId);
  const activeSub = getActiveSubscription(userId);
  const settings = getAllSettings();
  const catLower = (category || 'stranger').toLowerCase();

  if (catLower === 'stranger' && settings.stranger_category_enabled === '0') {
    return { allowed: false, reason: 'CATEGORY_DISABLED', message: 'Stranger category is temporarily disabled.' };
  }
  if (catLower === 'male' && settings.male_category_enabled === '0') {
    return { allowed: false, reason: 'CATEGORY_DISABLED', message: 'Male category is temporarily disabled.' };
  }
  if (catLower === 'female' && settings.female_category_enabled === '0') {
    return { allowed: false, reason: 'CATEGORY_DISABLED', message: 'Female category is temporarily disabled.' };
  }

  // Stranger category: always allowed even if 0 coins
  if (catLower === 'stranger') {
    return {
      allowed: true,
      category: 'stranger',
      hasCoins: wallet.balance > 0,
      balance: wallet.balance
    };
  }

  // Male & Female category checks
  if (catLower === 'male' || catLower === 'female') {
    const callCost = parseInt(settings.call_cost_coins || '5', 10);

    // Free VIP or active VIP subscription holders have permanent unrestricted access
    if (user.is_free_vip === 1 || activeSub) {
      return {
        allowed: true,
        category: catLower,
        hasCoins: wallet.balance > 0,
        hasSub: true,
        isFreeVip: user.is_free_vip === 1,
        balance: wallet.balance
      };
    }

    // Trial / Coin-Based Access:
    // Every registered user with complimentary welcome coins (e.g. 200 coins)
    // or purchased coins is allowed to try and connect in Male & Female sections!
    if (wallet.balance >= callCost) {
      return {
        allowed: true,
        category: catLower,
        hasCoins: true,
        hasSub: false,
        trialMode: true,
        balance: wallet.balance
      };
    }

    // Only after complimentary & purchased coins are completely exhausted (< 5 coins),
    // require VIP subscription or coin recharge to continue
    return {
      allowed: false,
      reason: 'SUBSCRIPTION_OR_COINS_REQUIRED',
      category: catLower,
      message: `आपके कॉइन्स समाप्त हो गए हैं! ${catLower.toUpperCase()} सेक्शन का उपयोग जारी रखने के लिए VIP सब्सक्रिप्शन लें या कॉइन्स रीचार्ज करें। (Coins exhausted! Upgrade to VIP Subscription or recharge coins to continue chatting in ${catLower.toUpperCase()})`
    };
  }

  return { allowed: false, reason: 'INVALID_CATEGORY', message: 'Unknown category' };
}

// ATOMIC COIN DEDUCTION FOR CALL CONNECTION
function deductCallCoins(userId, callId, partnerId, category) {
  const user = db.prepare('SELECT is_free_vip FROM users WHERE id = ?').get(userId);
  if (user && user.is_free_vip === 1) {
    return { success: true, deducted: 0, freeVip: true, balance_after: 999999 };
  }

  const callCost = parseInt(getSetting('call_cost_coins') || '5', 10);
  const wallet = getWallet(userId);

  if (category === 'stranger' && wallet.balance < callCost) {
    return { success: true, deducted: 0, freeCall: true, balance_after: wallet.balance };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const current = db.prepare('SELECT balance, free_coins, purchased_coins, total_spent FROM wallets WHERE user_id = ?').get(userId);
    if (!current || current.balance < callCost) {
      db.exec('ROLLBACK;');
      return { success: false, reason: 'INSUFFICIENT_COINS', balance: current ? current.balance : 0 };
    }

    let deductFree = Math.min(current.free_coins, callCost);
    let deductPurchased = callCost - deductFree;

    const newFree = current.free_coins - deductFree;
    const newPurchased = current.purchased_coins - deductPurchased;
    const newBalance = newFree + newPurchased;
    const newTotalSpent = current.total_spent + callCost;

    db.prepare(`
      UPDATE wallets
      SET balance = ?, free_coins = ?, purchased_coins = ?, total_spent = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(newBalance, newFree, newPurchased, newTotalSpent, userId);

    const txId = 'TX-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO coin_transactions (id, user_id, amount, type, balance_after, description, reference_id)
      VALUES (?, ?, ?, 'call_deduction', ?, ?, ?)
    `).run(txId, userId, -callCost, newBalance, `Video call (${category})`, callId);

    db.prepare(`
      UPDATE video_calls
      SET coins_deducted = coins_deducted + ?, status = 'connected', connected_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(callCost, callId);

    db.exec('COMMIT;');
    return { success: true, deducted: callCost, balance_after: newBalance };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// ATOMIC COIN CREDIT
function creditCoins(userId, amount, type, description, refId = null) {
  if (amount <= 0) throw new Error('Credit amount must be positive.');

  db.exec('BEGIN IMMEDIATE;');
  try {
    const current = db.prepare('SELECT balance, purchased_coins FROM wallets WHERE user_id = ?').get(userId);
    if (!current) throw new Error('Wallet not found');

    const newPurchased = current.purchased_coins + amount;
    const newBalance = current.balance + amount;

    db.prepare(`
      UPDATE wallets
      SET balance = ?, purchased_coins = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(newBalance, newPurchased, userId);

    const txId = 'TX-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO coin_transactions (id, user_id, amount, type, balance_after, description, reference_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(txId, userId, amount, type, newBalance, description, refId);

    db.exec('COMMIT;');
    return { success: true, balance: newBalance };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// ATOMIC SUBSCRIPTION CREATION
function activateSubscription(userId, planId, paymentId) {
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId);
  if (!plan) throw new Error('Plan not found');

  db.exec('BEGIN IMMEDIATE;');
  try {
    const existing = db.prepare(`
      SELECT * FROM subscriptions
      WHERE user_id = ? AND status = 'active' AND datetime(expires_at) > datetime('now')
      ORDER BY expires_at DESC LIMIT 1
    `).get(userId);

    const subId = 'SUB-' + crypto.randomUUID().slice(0, 8);
    let startDate = new Date();
    let expireDate;

    if (existing) {
      startDate = new Date(existing.expires_at);
      expireDate = new Date(startDate.getTime() + plan.duration_days * 86400000);
      db.prepare(`UPDATE subscriptions SET status = 'extended' WHERE id = ?`).run(existing.id);
    } else {
      expireDate = new Date(Date.now() + plan.duration_days * 86400000);
    }

    const expStr = expireDate.toISOString().replace('T', ' ').slice(0, 19);

    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at, payment_id)
      VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, ?)
    `).run(subId, userId, planId, expStr, paymentId);

    let bonusCoins = 0;
    if (plan.id === 'plan_quarterly') bonusCoins = 50;
    if (plan.id === 'plan_yearly') bonusCoins = 250;
    if (bonusCoins > 0) {
      const current = db.prepare('SELECT balance, purchased_coins FROM wallets WHERE user_id = ?').get(userId);
      const newPurchased = (current ? current.purchased_coins : 0) + bonusCoins;
      const newBalance = (current ? current.balance : 0) + bonusCoins;
      db.prepare('UPDATE wallets SET balance = ?, purchased_coins = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(newBalance, newPurchased, userId);
      db.prepare(`
        INSERT INTO coin_transactions (id, user_id, amount, type, balance_after, description, reference_id)
        VALUES (?, ?, ?, 'promo_gift', ?, ?, ?)
      `).run('TX-' + crypto.randomUUID().slice(0, 8), userId, bonusCoins, newBalance, `${plan.name} Bonus Coins`, subId);
    }

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'VIP Subscription Activated! 👑', ?, 'sub')
    `).run(
      'NT-' + crypto.randomUUID().slice(0, 8),
      userId,
      `Your ${plan.name} is now active until ${expStr.split(' ')[0]}. Enjoy Male & Female category access!`
    );

    db.exec('COMMIT;');
    return getActiveSubscription(userId);
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// ==========================================
// PAYMENT SCREENSHOT SUBMISSION & VERIFICATION
// ==========================================
function submitPaymentProof({ userId, itemType, itemId, itemTitle, amount, currency, paymentMethod, utrNumber, screenshotUrl }) {
  const paymentId = 'PAY-' + crypto.randomUUID().slice(0, 8);
  const invoiceNum = 'INV-' + Date.now().toString().slice(-8);

  db.prepare(`
    INSERT INTO payments (
      id, user_id, item_type, item_id, item_title, amount, currency, payment_method,
      status, transaction_ref, utr_number, screenshot_url, invoice_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification', ?, ?, ?, ?)
  `).run(
    paymentId, userId, itemType, itemId, itemTitle || itemId, amount, currency || 'INR', paymentMethod || 'upi',
    'TXN-' + Date.now(), utrNumber || '', screenshotUrl || '', invoiceNum
  );

  // Notify user that submission was received
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type)
    VALUES (?, ?, 'Payment Proof Submitted ⏳', ?, 'payment')
  `).run(
    'NT-' + crypto.randomUUID().slice(0, 8),
    userId,
    `Your payment of ₹${amount} (UTR: ${utrNumber || 'N/A'}) has been submitted for Owner verification. Once checked, your benefits will activate automatically.`
  );

  return { paymentId, invoiceNum, status: 'pending_verification' };
}

// Get pending payment submissions for the Owner Studio desk
function getPendingPayments() {
  return db.prepare(`
    SELECT p.*, u.username, u.email, u.display_name, u.avatar_url, u.country
    FROM payments p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'pending_verification'
    ORDER BY p.created_at DESC
  `).all();
}

// Owner approves payment after checking bank receipt
function approvePayment(paymentId, adminId = 'OWNER') {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'completed') return { alreadyCompleted: true };

  db.prepare(`
    UPDATE payments
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP, admin_notes = 'Verified and approved by Owner'
    WHERE id = ?
  `).run(paymentId);

  if (payment.item_type === 'coins') {
    const pkg = db.prepare('SELECT * FROM coin_packages WHERE id = ?').get(payment.item_id);
    const totalCoins = pkg ? (pkg.coins + pkg.bonus_coins) : Math.round(payment.amount * 50);
    creditCoins(payment.user_id, totalCoins, 'purchase', `Purchased ${pkg ? pkg.name : 'Coin Package'} (Verified)`, paymentId);
  } else if (payment.item_type === 'subscription') {
    activateSubscription(payment.user_id, payment.item_id, paymentId);
  }

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type)
    VALUES (?, ?, '🎉 Payment Verified & Activated!', ?, 'payment')
  `).run(
    'NT-' + crypto.randomUUID().slice(0, 8),
    payment.user_id,
    `Your payment (Invoice: ${payment.invoice_number}) has been approved by the Owner! Your account benefits are now live.`
  );

  logAdminAction(adminId, 'APPROVE_PAYMENT', 'payments', paymentId, `Approved ₹${payment.amount} (UTR: ${payment.utr_number})`);

  return { success: true, paymentId };
}

// Owner rejects invalid payment
function rejectPayment(paymentId, reason = 'Payment not found in bank account', adminId = 'OWNER') {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) throw new Error('Payment not found');

  db.prepare(`
    UPDATE payments
    SET status = 'rejected', admin_notes = ?
    WHERE id = ?
  `).run(reason, paymentId);

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type)
    VALUES (?, ?, 'Payment Verification Failed ❌', ?, 'payment')
  `).run(
    'NT-' + crypto.randomUUID().slice(0, 8),
    payment.user_id,
    `Your payment proof (Invoice: ${payment.invoice_number}) was rejected by the Owner. Reason: ${reason}`
  );

  logAdminAction(adminId, 'REJECT_PAYMENT', 'payments', paymentId, reason);
  return { success: true };
}

// OWNER FEATURE: MAKE ANY USER 100% FREE (VIP + Unlimited coins)
function setUserFreeVip(userId, isFree = true, adminId = 'OWNER') {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('User not found');

  const val = isFree ? 1 : 0;
  db.prepare('UPDATE users SET is_free_vip = ? WHERE id = ?').run(val, userId);

  if (isFree) {
    // Add 10,000 coins for convenience
    creditCoins(userId, 10000, 'promo_gift', 'Owner Special Benefit: Permanent Free VIP Access', 'OWNER');
    // Activate 1-year VIP sub
    activateSubscription(userId, 'plan_yearly', 'OWNER_COMPLIMENTARY');
  }

  logAdminAction(adminId, isFree ? 'GRANT_FREE_VIP' : 'REVOKE_FREE_VIP', 'users', userId, `Free VIP set to ${val}`);
  return { success: true, is_free_vip: val };
}

// Call management
function startVideoCall(callerId, receiverId, category) {
  const callId = 'CALL-' + crypto.randomUUID().slice(0, 10);
  db.prepare(`
    INSERT INTO video_calls (id, caller_id, receiver_id, category, status, started_at)
    VALUES (?, ?, ?, ?, 'connecting', CURRENT_TIMESTAMP)
  `).run(callId, callerId, receiverId, category);
  return callId;
}

function completeVideoCall(callId, durationSeconds, reason = 'user_ended') {
  db.prepare(`
    UPDATE video_calls
    SET status = 'ended', ended_at = CURRENT_TIMESTAMP, duration_seconds = ?, disconnect_reason = ?
    WHERE id = ?
  `).run(durationSeconds, reason, callId);
}

// Block & Report
function blockUser(userId, blockedId) {
  db.prepare(`INSERT OR IGNORE INTO blocks (id, user_id, blocked_id) VALUES (?, ?, ?)`).run(
    'BLK-' + crypto.randomUUID().slice(0, 8), userId, blockedId
  );
}

function unblockUser(userId, blockedId) {
  db.prepare(`DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?`).run(userId, blockedId);
}

function isBlocked(userA, userB) {
  const row = db.prepare(`
    SELECT id FROM blocks
    WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)
  `).get(userA, userB, userB, userA);
  return !!row;
}

function reportUser(reporterId, reportedId, callId, reason, details) {
  const repId = 'REP-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO reports (id, reporter_id, reported_id, call_id, reason, details, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(repId, reporterId, reportedId, callId, reason, details || '');
  return repId;
}

function logAdminAction(adminId, action, targetType, targetId, details, ip = '127.0.0.1') {
  db.prepare(`
    INSERT INTO admin_logs (id, admin_id, action, target_type, target_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('LOG-' + crypto.randomUUID().slice(0, 8), adminId, action, targetType, targetId, details, ip);
}

function getAdminStats() {
  const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role != 'super_admin'").get().count;
  const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE online_status = 1 AND role != 'super_admin'").get().count;
  const maleUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE gender = 'male'").get().count;
  const femaleUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE gender = 'female'").get().count;
  const freeVipUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_free_vip = 1").get().count;
  const activeSubs = db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active' AND datetime(expires_at) > datetime('now')").get().count;
  const totalCalls = db.prepare("SELECT COUNT(*) as count FROM video_calls").get().count;
  const activeCalls = db.prepare("SELECT COUNT(*) as count FROM video_calls WHERE status = 'connected'").get().count;
  const bannedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_banned = 1").get().count;
  const pendingReports = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'").get().count;
  const pendingPayments = db.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'pending_verification'").get().count;

  const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as sum FROM payments WHERE status = 'completed'").get().sum;
  const todayRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as sum FROM payments WHERE status = 'completed' AND date(created_at) = date('now')").get().sum;

  const coinsPurchased = db.prepare("SELECT COALESCE(SUM(purchased_coins), 0) as sum FROM wallets").get().sum;
  const coinsDistributed = db.prepare("SELECT COALESCE(SUM(amount), 0) as sum FROM coin_transactions WHERE amount > 0").get().sum;

  return {
    totalUsers,
    activeUsers,
    maleUsers,
    femaleUsers,
    freeVipUsers,
    activeSubs,
    totalCalls,
    activeCalls,
    bannedUsers,
    pendingReports,
    pendingPayments,
    totalRevenue,
    todayRevenue,
    coinsPurchased,
    coinsDistributed
  };
}

initSchema();

module.exports = {
  db,
  registerUser,
  loginOrRegisterOAuth,
  loginUser,
  getUserById,
  getWallet,
  getActiveSubscription,
  getSetting,
  getAllSettings,
  updateSetting,
  checkCategoryAccess,
  deductCallCoins,
  creditCoins,
  activateSubscription,
  submitPaymentProof,
  getPendingPayments,
  approvePayment,
  rejectPayment,
  setUserFreeVip,
  startVideoCall,
  completeVideoCall,
  blockUser,
  unblockUser,
  isBlocked,
  reportUser,
  logAdminAction,
  getAdminStats,
  hashPassword,
  verifyPassword
};
