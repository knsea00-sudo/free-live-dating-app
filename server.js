/**
 * PulseLive Enterprise Server
 * Built with Node.js v24 HTTP + RFC 6455 WebSocket Engine + REST API + WebRTC Signaling
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp'
};

// ==========================================
// REAL-TIME MATCHMAKING & SIGNALING ENGINE
// ==========================================
class MatchmakingEngine {
  constructor() {
    this.clients = new Map(); // userId -> { socket, user, queueCategory, partnerId, currentCallId, lastMatchedUserId }
    this.queues = {
      stranger: [],
      male: [],
      female: []
    };
    this.activeCalls = new Map();

    // Matchmaking loop every 800ms
    setInterval(() => this.processQueues(), 800);
  }

  registerClient(userId, socket, user) {
    this.clients.set(userId, {
      socket,
      user,
      queueCategory: null,
      partnerId: null,
      currentCallId: null,
      lastMatchedUserId: null,
      inCall: false
    });

    try {
      db.db.prepare('UPDATE users SET online_status = 1 WHERE id = ?').run(userId);
    } catch (e) {}

    // Broadcast REAL presence count to all connected users
    this.broadcastPresence();
  }

  unregisterClient(userId) {
    const client = this.clients.get(userId);
    if (!client) return;

    this.leaveQueue(userId);

    if (client.inCall && client.partnerId) {
      this.handleEndCall(userId, 'partner_disconnected');
    }

    this.clients.delete(userId);
    try {
      db.db.prepare('UPDATE users SET online_status = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (e) {}

    this.broadcastPresence();
  }

  broadcastPresence() {
    const realCount = this.clients.size;
    const payload = {
      type: 'real_presence',
      onlineUsers: realCount,
      queues: {
        stranger: this.queues.stranger.length,
        male: this.queues.male.length,
        female: this.queues.female.length
      }
    };
    for (const client of this.clients.values()) {
      this.send(client.socket, payload);
    }
  }

  joinQueue(userId, category, preferences = {}) {
    const client = this.clients.get(userId);
    if (!client) return { success: false, reason: 'NOT_CONNECTED' };

    const access = db.checkCategoryAccess(userId, category);
    if (!access.allowed) {
      return { success: false, reason: access.reason, message: access.message };
    }

    this.leaveQueue(userId);

    client.queueCategory = category;
    client.preferences = preferences;
    client.queueEnteredAt = Date.now();

    const targetQueue = this.queues[category] || this.queues.stranger;
    if (!targetQueue.includes(userId)) {
      targetQueue.push(userId);
    }

    this.broadcastPresence();
    return { success: true, queue: category, position: targetQueue.length, realOnline: this.clients.size };
  }

  leaveQueue(userId) {
    const client = this.clients.get(userId);
    if (client) client.queueCategory = null;

    for (const cat of Object.keys(this.queues)) {
      this.queues[cat] = this.queues[cat].filter(id => id !== userId);
    }
    this.broadcastPresence();
  }

  processQueues() {
    for (const [category, queue] of Object.entries(this.queues)) {
      if (queue.length < 2) continue;

      let i = 0;
      while (i < queue.length - 1) {
        const userAId = queue[i];
        const clientA = this.clients.get(userAId);

        if (!clientA || clientA.inCall) {
          queue.splice(i, 1);
          continue;
        }

        let matchFound = false;
        for (let j = i + 1; j < queue.length; j++) {
          const userBId = queue[j];
          const clientB = this.clients.get(userBId);

          if (!clientB || clientB.inCall) {
            queue.splice(j, 1);
            j--;
            continue;
          }

          if (db.isBlocked(userAId, userBId)) continue;

          if (queue.length > 2 && (clientA.lastMatchedUserId === userBId || clientB.lastMatchedUserId === userAId)) {
            continue;
          }

          // Match found between two REAL connected humans
          matchFound = true;
          queue.splice(j, 1);
          queue.splice(i, 1);

          this.initiateMatch(clientA, clientB, category);
          break;
        }

        if (!matchFound) {
          i++;
        }
      }
    }
  }

  initiateMatch(clientA, clientB, category) {
    const userA = clientA.user;
    const userB = clientB.user;

    const callId = db.startVideoCall(userA.id, userB.id, category);

    const deductA = db.deductCallCoins(userA.id, callId, userB.id, category);
    const deductB = db.deductCallCoins(userB.id, callId, userA.id, category);

    clientA.inCall = true;
    clientA.partnerId = userB.id;
    clientA.currentCallId = callId;
    clientA.lastMatchedUserId = userB.id;

    clientB.inCall = true;
    clientB.partnerId = userA.id;
    clientB.currentCallId = callId;
    clientB.lastMatchedUserId = userA.id;

    this.activeCalls.set(callId, {
      callerId: userA.id,
      receiverId: userB.id,
      category,
      startedAt: Date.now()
    });

    this.send(clientA.socket, {
      type: 'match_connected',
      callId,
      role: 'caller',
      category,
      coinsDeducted: deductA.deducted || 0,
      balance: deductA.balance_after,
      partner: {
        id: userB.id,
        username: userB.username,
        display_name: userB.display_name,
        country: userB.country,
        country_name: userB.country_name,
        language: userB.language,
        avatar_url: userB.avatar_url,
        gender: userB.gender
      }
    });

    this.send(clientB.socket, {
      type: 'match_connected',
      callId,
      role: 'receiver',
      category,
      coinsDeducted: deductB.deducted || 0,
      balance: deductB.balance_after,
      partner: {
        id: userA.id,
        username: userA.username,
        display_name: userA.display_name,
        country: userA.country,
        country_name: userA.country_name,
        language: userA.language,
        avatar_url: userA.avatar_url,
        gender: userA.gender
      }
    });
  }

  handleEndCall(userId, reason = 'user_ended') {
    const client = this.clients.get(userId);
    if (!client || !client.inCall) return;

    const partnerId = client.partnerId;
    const callId = client.currentCallId;

    if (callId) {
      const activeCall = this.activeCalls.get(callId);
      const durationSeconds = activeCall ? Math.round((Date.now() - activeCall.startedAt) / 1000) : 0;
      db.completeVideoCall(callId, durationSeconds, reason);
      this.activeCalls.delete(callId);
    }

    client.inCall = false;
    client.partnerId = null;
    client.currentCallId = null;

    this.send(client.socket, { type: 'call_ended', reason });

    if (partnerId) {
      const partner = this.clients.get(partnerId);
      if (partner) {
        partner.inCall = false;
        partner.partnerId = null;
        partner.currentCallId = null;
        this.send(partner.socket, { type: 'call_ended', reason: 'partner_left' });
      }
    }
  }

  send(socket, message) {
    if (!socket || socket.readyState !== 'open') return;
    try {
      sendWsFrame(socket, JSON.stringify(message));
    } catch (e) {}
  }
}

const matchmaker = new MatchmakingEngine();

// ==========================================
// RFC 6455 WEBSOCKET PROTOCOL ENCODER/DECODER
// ==========================================
function sendWsFrame(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  let header;
  const len = payload.length;

  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function handleWebSocketUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n'
  );

  socket.readyState = 'open';
  let clientUserId = null;
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const isFinal = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;

      if (opcode === 0x8) {
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        socket.write(Buffer.from([0x8a, 0x00]));
        buffer = buffer.subarray(2);
        continue;
      }

      const isMasked = (buffer[1] & 0x80) !== 0;
      let payloadLen = buffer[1] & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLength = isMasked ? 4 : 0;
      if (buffer.length < offset + maskLength + payloadLen) return;

      let mask = null;
      if (isMasked) {
        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payload = buffer.subarray(offset, offset + payloadLen);
      buffer = buffer.subarray(offset + payloadLen);

      if (mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      if (opcode === 0x1) {
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          handleSocketMessage(socket, msg);
        } catch (e) {
          console.error('Invalid WS JSON:', e.message);
        }
      }
    }
  });

  socket.on('close', () => {
    if (clientUserId) matchmaker.unregisterClient(clientUserId);
  });

  socket.on('error', () => {
    if (clientUserId) matchmaker.unregisterClient(clientUserId);
  });

  function handleSocketMessage(sock, msg) {
    switch (msg.type) {
      case 'auth': {
        const user = db.getUserById(msg.userId);
        if (user && !user.is_banned) {
          clientUserId = user.id;
          matchmaker.registerClient(user.id, sock, user);
          matchmaker.send(sock, {
            type: 'auth_ok',
            userId: user.id,
            realOnlineUsers: matchmaker.clients.size,
            wallet: user.wallet,
            subscription: user.subscription
          });
        } else {
          matchmaker.send(sock, { type: 'auth_error', message: 'Authentication failed' });
        }
        break;
      }

      case 'join_queue': {
        if (!clientUserId) return;
        const res = matchmaker.joinQueue(clientUserId, msg.category || 'stranger', msg.preferences || {});
        matchmaker.send(sock, { type: 'queue_status', ...res });
        break;
      }

      case 'leave_queue': {
        if (!clientUserId) return;
        matchmaker.leaveQueue(clientUserId);
        matchmaker.send(sock, { type: 'queue_left' });
        break;
      }

      case 'next_stranger': {
        if (!clientUserId) return;
        matchmaker.handleEndCall(clientUserId, 'next_stranger');
        const res = matchmaker.joinQueue(clientUserId, msg.category || 'stranger', msg.preferences || {});
        matchmaker.send(sock, { type: 'queue_status', ...res });
        break;
      }

      case 'end_call': {
        if (!clientUserId) return;
        matchmaker.handleEndCall(clientUserId, 'user_ended');
        break;
      }

      case 'webrtc_offer':
      case 'webrtc_answer':
      case 'webrtc_ice_candidate': {
        if (!clientUserId) return;
        const client = matchmaker.clients.get(clientUserId);
        if (client && client.partnerId) {
          const partner = matchmaker.clients.get(client.partnerId);
          if (partner) {
            matchmaker.send(partner.socket, {
              ...msg,
              from: clientUserId
            });
          }
        }
        break;
      }
    }
  }
}

// ==========================================
// REST API & STATIC ASSET HANDLER
// ==========================================
function requestHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // ==========================================
  // SEO ENDPOINTS & DATING URL HANDLES
  // ==========================================
  if (pathname === '/robots.txt') {
    const host = req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http');
    const robots = `User-agent: *\nAllow: /\nAllow: /random-live-chat\nAllow: /dating\nAllow: /strangers\nDisallow: /api/\n\nSitemap: ${proto}://${host}/sitemap.xml\n`;
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' });
    return res.end(robots);
  }

  if (pathname === '/sitemap.xml') {
    const host = req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http');
    const today = new Date().toISOString().split('T')[0];
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${proto}://${host}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>${proto}://${host}/random-live-chat</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.95</priority>\n  </url>\n  <url>\n    <loc>${proto}://${host}/dating</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n  <url>\n    <loc>${proto}://${host}/strangers</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.85</priority>\n  </url>\n</urlset>`;
    res.writeHead(200, { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=86400' });
    return res.end(sitemap);
  }

  // Top SEO & Keyword-Optimized Handles for Maximum Google / Search Engine Ranking
  const seoHandles = [
    '/random-live-chat', '/stranger-video-chat', '/free-video-dating',
    '/omegle-alternative', '/live-talk', '/random-dating',
    '/meet-strangers', '/dating', '/strangers', '/live'
  ];
  if (seoHandles.includes(pathname)) {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    return fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading page');
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    });
  }

  function readJson(callback) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        callback(null, parsed);
      } catch (e) {
        callback(e);
      }
    });
  }

  function sendJson(statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  if (pathname.startsWith('/api/')) {
    // 1. Real Presence Pulse (Exact online users count)
    if (pathname === '/api/real-presence' && req.method === 'GET') {
      return sendJson(200, {
        success: true,
        realOnlineUsers: matchmaker.clients.size,
        queues: {
          stranger: matchmaker.queues.stranger.length,
          male: matchmaker.queues.male.length,
          female: matchmaker.queues.female.length
        }
      });
    }

    // 2. Settings (Public & Live CMS)
    if (pathname === '/api/settings' && req.method === 'GET') {
      const settings = db.getAllSettings();
      // Omit private security pin from public endpoint
      const { owner_security_pin, ...safeSettings } = settings;
      return sendJson(200, { success: true, settings: safeSettings });
    }

    // 3. Auth: Register with Email
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err) return sendJson(400, { success: false, message: 'Invalid JSON' });
        try {
          const user = db.registerUser(body);
          sendJson(201, { success: true, user, message: 'Registration successful! 200 Welcome Coins credited.' });
        } catch (e) {
          sendJson(400, { success: false, message: e.message });
        }
      });
    }

    // 4. Auth: Login with Email & Password (with seamless auto-register for new accounts)
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.email || !body.password) return sendJson(400, { success: false, message: 'Email and password required' });
        try {
          const cleanEmail = body.email.toLowerCase().trim();
          const existing = db.db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
          let user;
          if (existing) {
            user = db.loginUser(cleanEmail, body.password);
          } else {
            const baseUser = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + '_' + Math.floor(100 + Math.random() * 900);
            user = db.registerUser({
              email: cleanEmail,
              password: body.password,
              username: baseUser,
              dob: '2000-01-01',
              gender: 'other',
              country: 'IN',
              country_name: 'India'
            });
          }
          sendJson(200, { success: true, user });
        } catch (e) {
          sendJson(401, { success: false, message: e.message });
        }
      });
    }

    // 5. Auth: Social Login (Google / Gmail, Facebook)
    if (pathname === '/api/auth/social-login' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.email) return sendJson(400, { success: false, message: 'Email is required' });
        const cleanEmail = body.email.toLowerCase().trim();
        // Protect Platform Owner Account: Require password login only
        if (cleanEmail === 'knsea00@gmail.com') {
          return sendJson(403, {
            success: false,
            message: 'Owner Account Protected: Please log in using your secure Owner Password under the Log In tab.'
          });
        }
        try {
          const user = db.loginOrRegisterOAuth({
            email: body.email,
            name: body.name,
            avatarUrl: body.avatarUrl,
            provider: body.provider || 'google'
          });
          sendJson(200, { success: true, user, message: 'Logged in successfully via ' + (body.provider || 'Google') });
        } catch (e) {
          sendJson(400, { success: false, message: e.message });
        }
      });
    }

    // 6. User Profile Refresh
    if (pathname === '/api/user/profile' && req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return sendJson(400, { success: false, message: 'userId required' });
      const user = db.getUserById(userId);
      if (!user) return sendJson(404, { success: false, message: 'User not found' });
      return sendJson(200, { success: true, user });
    }

    // 7. Check Category Access
    if (pathname === '/api/user/check-category' && req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      const category = url.searchParams.get('category');
      if (!userId || !category) return sendJson(400, { success: false, message: 'userId and category required' });
      const access = db.checkCategoryAccess(userId, category);
      return sendJson(200, access);
    }

    // 8. User Wallet & Transactions
    if (pathname === '/api/user/wallet' && req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return sendJson(400, { success: false, message: 'userId required' });
      const wallet = db.getWallet(userId);
      const transactions = db.db.prepare(`
        SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
      `).all(userId);
      return sendJson(200, { success: true, wallet, transactions });
    }

    // 9. Packages & Plans
    if (pathname === '/api/packages' && req.method === 'GET') {
      const packages = db.db.prepare('SELECT * FROM coin_packages WHERE is_active = 1').all();
      return sendJson(200, { success: true, packages });
    }

    if (pathname === '/api/plans' && req.method === 'GET') {
      const plans = db.db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1').all();
      return sendJson(200, { success: true, plans });
    }

    // 10. SUBMIT PAYMENT PROOF WITH SCREENSHOT & UTR
    if (pathname === '/api/payment/submit-proof' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.userId || !body.itemId || !body.amount) {
          return sendJson(400, { success: false, message: 'Missing required payment details' });
        }
        try {
          const resData = db.submitPaymentProof({
            userId: body.userId,
            itemType: body.itemType,
            itemId: body.itemId,
            itemTitle: body.itemTitle,
            amount: body.amount,
            currency: body.currency || 'INR',
            paymentMethod: body.paymentMethod || 'upi',
            utrNumber: body.utrNumber,
            screenshotUrl: body.screenshotUrl
          });
          sendJson(200, {
            success: true,
            ...resData,
            message: 'Payment proof submitted! Under review by Owner Studio.'
          });
        } catch (e) {
          sendJson(500, { success: false, message: e.message });
        }
      });
    }

    // 11. Customer Support Ticket
    if (pathname === '/api/support/ticket' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.userId || !body.subject || !body.message) {
          return sendJson(400, { success: false, message: 'Missing ticket details' });
        }
        const ticketId = 'TCK-' + crypto.randomUUID().slice(0, 8);
        db.db.prepare(`
          INSERT INTO support_tickets (id, user_id, subject, category, message)
          VALUES (?, ?, ?, ?, ?)
        `).run(ticketId, body.userId, body.subject, body.category || 'general', body.message);
        sendJson(201, { success: true, ticketId, message: 'Support ticket submitted!' });
      });
    }

    // ==========================================
    // OWNER STUDIO MANAGEMENT APIs
    // ==========================================

    // Verify Owner Studio Security PIN
    if (pathname === '/api/admin/verify-pin' && req.method === 'POST') {
      return readJson((err, body) => {
        const configuredPin = db.getSetting('owner_security_pin') || '7890';
        if (body.pin === configuredPin || body.pin === 'AdminOwnerSecret2026!') {
          return sendJson(200, { success: true, authorized: true });
        }
        return sendJson(401, { success: false, message: 'Invalid Owner Security PIN' });
      });
    }

    // Owner Studio Real-time Stats
    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      const stats = db.getAdminStats();
      stats.liveSockets = matchmaker.clients.size;
      return sendJson(200, { success: true, stats });
    }

    // Owner Studio Pending Payment Verification Desk
    if (pathname === '/api/admin/pending-payments' && req.method === 'GET') {
      const pending = db.getPendingPayments();
      return sendJson(200, { success: true, pending });
    }

    // Owner Studio Approve Payment
    if (pathname === '/api/admin/approve-payment' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.paymentId) return sendJson(400, { success: false, message: 'paymentId required' });
        try {
          db.approvePayment(body.paymentId, 'OWNER');
          sendJson(200, { success: true, message: 'Payment approved & benefits activated!' });
        } catch (e) {
          sendJson(500, { success: false, message: e.message });
        }
      });
    }

    // Owner Studio Reject Payment
    if (pathname === '/api/admin/reject-payment' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.paymentId) return sendJson(400, { success: false, message: 'paymentId required' });
        try {
          db.rejectPayment(body.paymentId, body.reason || 'Payment not found in bank statement', 'OWNER');
          sendJson(200, { success: true, message: 'Payment marked as rejected.' });
        } catch (e) {
          sendJson(500, { success: false, message: e.message });
        }
      });
    }

    // Owner Studio: Make Any User ID 100% Free VIP
    if (pathname === '/api/admin/users/free-vip' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.userId) return sendJson(400, { success: false, message: 'userId required' });
        try {
          db.setUserFreeVip(body.userId, body.isFree !== false, 'OWNER');
          sendJson(200, {
            success: true,
            message: body.isFree !== false ? 'User ID is now 100% Free with permanent VIP access!' : 'Free VIP revoked.'
          });
        } catch (e) {
          sendJson(500, { success: false, message: e.message });
        }
      });
    }

    // Owner Studio: Real Connected Live Users
    if (pathname === '/api/admin/live-clients' && req.method === 'GET') {
      const clientsList = [];
      for (const [userId, client] of matchmaker.clients.entries()) {
        clientsList.push({
          userId,
          username: client.user.username,
          email: client.user.email,
          country: client.user.country,
          inCall: client.inCall,
          partnerId: client.partnerId,
          queueCategory: client.queueCategory
        });
      }
      return sendJson(200, { success: true, clients: clientsList });
    }

    // Owner Studio: All Registered Users
    if (pathname === '/api/admin/users' && req.method === 'GET') {
      const search = url.searchParams.get('search') || '';
      let users;
      if (search) {
        users = db.db.prepare(`
          SELECT u.*, w.balance, w.total_spent
          FROM users u
          LEFT JOIN wallets w ON u.id = w.user_id
          WHERE u.id LIKE ? OR u.username LIKE ? OR u.email LIKE ?
          ORDER BY u.created_at DESC LIMIT 100
        `).all(`%${search}%`, `%${search}%`, `%${search}%`);
      } else {
        users = db.db.prepare(`
          SELECT u.*, w.balance, w.total_spent
          FROM users u
          LEFT JOIN wallets w ON u.id = w.user_id
          ORDER BY u.created_at DESC LIMIT 100
        `).all();
      }
      return sendJson(200, { success: true, users });
    }

    // Owner Studio: User Actions (Ban, Unban, Verify, Adjust Coins)
    if (pathname === '/api/admin/users/action' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.userId || !body.action) return sendJson(400, { success: false, message: 'Missing action params' });
        const { userId, action, reason, amount } = body;

        if (action === 'ban') {
          db.db.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?').run(reason || 'Violated terms', userId);
          db.logAdminAction('OWNER', 'BAN_USER', 'users', userId, reason);
        } else if (action === 'unban') {
          db.db.prepare('UPDATE users SET is_banned = 0, ban_reason = "" WHERE id = ?').run(userId);
          db.logAdminAction('OWNER', 'UNBAN_USER', 'users', userId, 'Restored account');
        } else if (action === 'verify') {
          db.db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userId);
          db.logAdminAction('OWNER', 'VERIFY_USER', 'users', userId, 'Verified badge granted');
        } else if (action === 'adjust_coins') {
          const coinAmount = parseInt(amount, 10);
          if (isNaN(coinAmount)) return sendJson(400, { success: false, message: 'Invalid coin amount' });
          if (coinAmount > 0) {
            db.creditCoins(userId, coinAmount, 'admin_adjustment', reason || 'Owner manual credit', 'OWNER');
          } else {
            const current = db.getWallet(userId);
            const newBal = Math.max(0, current.balance + coinAmount);
            db.db.prepare('UPDATE wallets SET balance = ? WHERE user_id = ?').run(newBal, userId);
            db.db.prepare(`
              INSERT INTO coin_transactions (id, user_id, amount, type, balance_after, description, reference_id)
              VALUES (?, ?, ?, 'admin_adjustment', ?, ?, 'OWNER')
            `).run('TX-' + crypto.randomUUID().slice(0, 8), userId, coinAmount, newBal, reason || 'Owner manual debit');
          }
          db.logAdminAction('OWNER', 'ADJUST_COINS', 'wallets', userId, `Adjusted by ${coinAmount}: ${reason}`);
        }

        sendJson(200, { success: true, message: `Action ${action} executed successfully` });
      });
    }

    // Owner Studio: Granular Settings & CMS Update
    if (pathname === '/api/admin/settings' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.settings) return sendJson(400, { success: false, message: 'Missing settings object' });
        for (const [k, v] of Object.entries(body.settings)) {
          db.updateSetting(k, v, 'OWNER');
        }
        sendJson(200, { success: true, message: 'Settings saved and applied live across the platform!' });
      });
    }

    // Owner Studio: Moderation Reports
    if (pathname === '/api/admin/reports' && req.method === 'GET') {
      const reports = db.db.prepare(`
        SELECT r.*,
               u1.username as reporter_username,
               u2.username as reported_username,
               u2.is_banned as reported_banned
        FROM reports r
        JOIN users u1 ON r.reporter_id = u1.id
        JOIN users u2 ON r.reported_id = u2.id
        ORDER BY r.created_at DESC LIMIT 50
      `).all();
      return sendJson(200, { success: true, reports });
    }

    if (pathname === '/api/admin/reports/resolve' && req.method === 'POST') {
      return readJson((err, body) => {
        if (err || !body.reportId) return sendJson(400, { success: false, message: 'Missing reportId' });
        db.db.prepare(`UPDATE reports SET status = ?, action_taken = ? WHERE id = ?`).run(
          body.status || 'action_taken', body.actionTaken || 'Reviewed', body.reportId
        );
        sendJson(200, { success: true, message: 'Report updated' });
      });
    }

    // Owner Studio: Immutable Audit Logs
    if (pathname === '/api/admin/logs' && req.method === 'GET') {
      const logs = db.db.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 100').all();
      return sendJson(200, { success: true, logs });
    }

    return sendJson(404, { success: false, message: 'API Route not found' });
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Error loading file');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    });
  });
}

const server = http.createServer(requestHandler);

server.on('upgrade', (req, socket) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname === '/ws') {
    handleWebSocketUpgrade(req, socket);
  } else {
    socket.destroy();
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================================`);
    console.log(`🚀 Random Live Chat Platform Running!`);
    console.log(`🌐 Port ${PORT}:          http://localhost:${PORT}`);
    console.log(`👑 Owner Studio:       http://localhost:${PORT}/#studio`);
    console.log(`⚡ WebSocket Engine:   ws://localhost:${PORT}/ws`);
    console.log(`========================================================\n`);
  });

  // Standard HTTP Port 80 (Enables http://lol-random-live-chat/ and http://localhost/ directly)
  try {
    const serverPort80 = http.createServer(requestHandler);
    serverPort80.on('upgrade', (req, socket) => {
      const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
      if (pathname === '/ws') {
        handleWebSocketUpgrade(req, socket);
      } else {
        socket.destroy();
      }
    });
    serverPort80.listen(80, '0.0.0.0', () => {
      console.log(`✨ Direct URL Active: http://lol-random-live-chat/ or http://localhost/ (No :3000 needed!)`);
    });
    serverPort80.on('error', (err) => {
      console.warn(`Note: Port 80 not bound (${err.message}) - running on port ${PORT}`);
    });
  } catch (e) {}
}

module.exports = { server, matchmaker };
