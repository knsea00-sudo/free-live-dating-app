# 🌐 Random Live Chat — Global Live Video Dating Platform

A complete, production-grade, worldwide random video calling and dating platform connecting strangers across borders through live WebRTC video communication, virtual coin wallet mechanics, VIP category subscription gating, and an Owner-controlled Super Admin Panel.

---

## 🚀 Key Highlights & Architecture

- **Multiplatform Responsive Design**: Works seamlessly across Windows desktop browsers, Android mobile, iOS mobile, tablets, and desktop PWA (`standalone`).
- **Live Video Infrastructure**: Built on peer-to-peer WebRTC (`RTCPeerConnection`, STUN/TURN, trickle ICE over WebSocket) supporting up to 1080p and adaptive 4K where supported.
- **Strict 18+ Age Verification**: Underage registrations are blocked at both client and database levels based on Date of Birth calculations.
- **Complimentary 200 Welcome Coins**: Every new verified user is automatically credited 200 complimentary coins on signup with duplicate prevention.
- **Strict Ledger Coin Wallet**: Each successfully connected call atomically costs 5 coins (`BEGIN IMMEDIATE ... COMMIT`). Client-side balances are strictly read-only and server-verified.
- **Subscription Category Control**:
  - **Stranger Category**: Always accessible (even with zero coins).
  - **Male & Female Categories**: Strictly requires both coins AND an active VIP Subscription.
- **Owner Super Admin Command Center**: Separate portal at `/#admin` allowing real-time metrics monitoring, user bans, coin adjustments, pricing configuration, and live CMS brand customization (app name, logo, payment QR code, colors, announcement ticker) without code edits or server restarts.
- **Dual Payment Processing**:
  - **Indian Users**: Instant UPI QR Code scanner (featuring embedded QR code with automated verification), Cards, Netbanking.
  - **International Users**: International Visa / Mastercard / Amex cards.

---

## 🛠️ Architecture Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v24 (`agy-node`) |
| **Database** | SQLite 3.53 via `node:sqlite` in WAL mode with Foreign Keys & ACID atomic transactions |
| **Realtime Engine** | RFC 6455 compliant zero-dependency WebSocket Server + WebRTC Signaling |
| **Frontend** | Modern Vanilla ES6+ SPA, Glassmorphism, CSS Variables, PWA Service Worker |
| **Media Stream** | WebRTC MediaStream API + Canvas / Web Audio fallback generator |

---

## 🔑 Default Credentials

### Platform Owner & Chairman:
- **URL**: `http://localhost:3000/#studio` (or `http://lol-random-live-chat/`)
- **Email**: `knsea00@gmail.com`
- **Role**: `owner` (Full exclusive platform ownership, permanent VIP, unlimited coins)
- **Studio Security PIN**: `7890` (Direct 1-click access when logged in)

### Test Demo Accounts:
- `alice@pulselive.io` / `DemoPass2026!` (Female, USA, 350 Coins, VIP Active)
- `raj@pulselive.io` / `DemoPass2026!` (Male, India, 500 Coins, VIP Active)
- `elena@pulselive.io` / `DemoPass2026!` (Female, Spain, 200 Coins, Free)
- `kenji@pulselive.io` / `DemoPass2026!` (Male, Japan, 200 Coins, Free)

---

## 🧪 Automated Test Suite

Run the automated test suite verifying 18+ age verification, atomic coin deductions, subscription category gating, and admin settings:

```bash
npm test
# or
agy-node test/unit_tests.js
```

---

## 🚢 Starting the Production Server

To run the live server:

```bash
agy-node server.js
```

The application will be accessible at:
- **Web / Desktop User UI**: `http://localhost:3000`
- **Owner Super Admin Portal**: `http://localhost:3000/#admin`
- **WebSocket Signaling**: `ws://localhost:3000/ws`

---

## 🛡️ Security & Privacy Disclosures

- Video calls are strictly peer-to-peer and **never recorded**.
- No sensitive user credentials or personal identity documents are exposed to other callers.
- Inappropriate behavior or harassment triggers instant 1-click reporting and immediate account suspension from the Super Admin Panel.
