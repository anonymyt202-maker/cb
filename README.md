# 🎁 TmuxCaseBot

A production-ready Telegram Mini App + Bot for opening cases, winning Telegram Gifts & NFTs, upgrading items, and more.

---

## ✨ Features

- 🎰 **Case Opening** — Normal, Roulette, Daily Free, Referral cases
- ⭐ **Telegram Stars** — Deposit and spend Stars
- 💎 **TON Deposits** — Admin-reviewed TON payments
- 🎁 **Gifts & NFTs** — Win, sell, or withdraw items
- ⚡ **Gift Upgrade** — Sacrifice items for a chance at better ones
- 👥 **Referral System** — Earn Stars per invite
- 🆓 **Daily Free Cases** — Channel sub or referral tasks to unlock
- 📋 **Admin Panel** — Full management dashboard

---

## 🗂 Project Structure

```
tmuxcasebot/
├── backend/          # Node.js + Express API + Telegram Bot
├── frontend/         # React Mini App (Telegram WebApp)
├── admin/            # React Admin Dashboard
├── database/         # MySQL schema
└── docker-compose.yml
```

---

## 🚀 Quick Start (Docker)

### 1. Clone & configure

```bash
git clone <your-repo>
cd tmuxcasebot
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

### 2. Required .env values

```env
BOT_TOKEN=         # From @BotFather
ADMIN_IDS=         # Your Telegram user ID(s), comma-separated
JWT_SECRET=        # Random 64-char string
WEBAPP_URL=        # https://your-frontend.com
ADMIN_URL=         # https://your-admin.com
DB_USER=tmuxcasebot
DB_PASS=your_db_password
DB_ROOT_PASS=your_root_password
WEBHOOK_URL=       # https://your-backend.com (for production webhook)
TON_WALLET_ADDRESS= # Your TON wallet for deposits
```

### 3. Build & run

```bash
docker-compose up -d --build
```

Services:
- Frontend: `http://localhost:3000`
- Admin: `http://localhost:3002`
- Backend: `http://localhost:3001`
- MySQL: `localhost:3306`

---

## ⚙️ Manual Setup (without Docker)

### Backend

```bash
cd backend
cp .env.example .env
# Fill in .env values
npm install
# Import database schema
mysql -u root -p < ../database/schema.sql
npm start
```

### Frontend

```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:3001/api npm start
```

### Admin

```bash
cd admin
npm install
REACT_APP_API_URL=http://localhost:3001/api npm start
# Runs on port 3002
```

---

## 🤖 Bot Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set `BOT_TOKEN` in `.env`
3. Set bot commands:
   ```
   start - Start the bot
   admin - Admin panel
   ```
4. Enable **Inline Mode** if needed
5. Set your Mini App URL via BotFather → Bot Settings → Menu Button

---

## 📋 Admin Panel

Access at `http://your-admin-domain.com`

**Login:** Use your Telegram WebApp `initData` string. Your user ID must be in `ADMIN_IDS`.

To get your initData for admin login:
1. Open your Mini App in Telegram
2. In browser console: `window.Telegram.WebApp.initData`
3. Copy and paste into admin login

### Admin Capabilities
- 📊 Dashboard with live stats
- 👥 User management (ban/unban, balance adjust, profile view)
- 🎁 Case management (create/edit/delete cases with reward pools)
- 💰 Reward management (Stars, Gifts with emoji, NFTs with images)
- 📤 Withdrawal approvals (approve → user receives item; reject → returned to inventory)
- 💎 TON deposit approvals
- 📢 Broadcast messages to all users (text + image + button)
- ⚙️ System settings (referral rewards, upgrade limits, TON rate)
- 📜 Logs (admin actions, case opens, upgrades)

---

## 🎰 Case Types

| Type | Description |
|------|-------------|
| **Normal** | Multiple rewards, weighted probability |
| **Roulette** | Single reward with set win % chance |
| **Daily Free** | Opens once per day; optional task (channel sub or referrals) |
| **Referral** | Requires N referrals; resets every 24h |

---

## 🎁 Reward Types

| Type | Fields |
|------|--------|
| **Stars** | Amount, chance, rarity |
| **Gift** | Emoji picker (🧸💝🎁🌹🎂💐🍾🚀💎🏆), name, value, chance, rarity |
| **NFT** | Image URL, name, value, chance, rarity |

### Rarities
- Common (gray glow)
- Rare (blue glow)
- Epic (purple glow)
- Legendary (gold glow)

---

## ⚡ Upgrade Formula

```
chance = (source_value / target_value) * 100
```

Clamped between `min_upgrade_chance` and `max_upgrade_chance` settings.

Examples:
- 100 ⭐ → 200 ⭐ = 50%
- 100 ⭐ → 500 ⭐ = 20%
- 100 ⭐ → 1000 ⭐ = 10%

---

## 🔐 Security

- Server-side reward generation (crypto.randomInt)
- Telegram `initData` HMAC-SHA256 verification
- 24-hour auth expiry
- Rate limiting on all endpoints
- Anti-cheat: client cannot influence outcomes
- Input validation on all routes
- SQL injection protection (parameterized queries)

---

## 🌐 Production Deployment (Railway / VPS)

### Railway
1. Create separate Railway projects for backend, frontend, admin
2. Add MySQL plugin to backend project
3. Set all environment variables
4. Deploy from GitHub

### VPS (Ubuntu)
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Setup SSL (recommended)
apt install certbot nginx

# Run
docker-compose up -d --build

# Setup nginx reverse proxy for SSL termination
```

### Nginx Reverse Proxy (SSL)
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / { proxy_pass http://localhost:3000; }
    location /api/ { proxy_pass http://localhost:3001/api/; }
}
```

---

## 📦 Database Tables

| Table | Purpose |
|-------|---------|
| users | Telegram user accounts |
| balances | Stars balance per user |
| cases | Case definitions |
| case_rewards | Rewards inside each case |
| inventory | User's won items |
| inventory_history | Item transaction log |
| withdrawals | Withdrawal requests |
| deposits | Deposit records |
| referrals | Referral relationships |
| upgrades | Upgrade game history |
| transactions | Balance change log |
| settings | System configuration |
| admin_logs | Admin action audit trail |
| broadcasts | Broadcast history |
| case_opens | Case open log |
| daily_free_claims | Daily free case cooldowns |
| referral_case_claims | Referral case cooldowns |

---

## 📄 License

MIT — use freely for your own projects.
