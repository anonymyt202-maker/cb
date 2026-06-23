# 🎁 TMUX Case Bot - Setup Guide

## ✨ New Features in v3.0

- ✅ **NFT Management**: Admin panel NFT section for managing NFT rewards
- ✅ **Promo Codes**: Create promotional codes with case access control, star requirements, daily reset (GMT+5 00:00)
- ✅ **Referral Case**: New case type that resets daily based on GMT+5 timezone
- ✅ **Demo Mode**: Open cases without spending stars, boosted drop rates, items don't go to inventory
- ✅ **Demo Case**: Special case type for testing
- ✅ **Broadcast Stars**: Admin can give stars to all users at once with custom reason
- ✅ **Fixed Animations**: Upgrade wheel shows correct outcome, mines display properly
- ✅ **Roulette Fix**: Roulette now works correctly - win chance shows green, loss shows red
- ✅ **24-Hour Reset (GMT+5)**: Daily free cases, referral cases, and promo codes reset at GMT+5 00:00
- ✅ **No Chance Display**: Case rewards don't show win percentages to users
- ✅ **Battle Bot Integration**: Full battle bot included in backend

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ with npm
- SQLite (included with better-sqlite3)

### 2. Installation

```bash
# Clone/extract the project
cd cb-main

# Install all dependencies (frontend, backend, admin)
npm install:all

# Or install manually:
npm install
cd frontend && npm install
cd ../backend && npm install
cd ../admin && npm install
```

### 3. Configuration

#### Backend (.env)
Create `backend/.env`:
```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_PATH=./data/tmuxcasebot.db

# Telegram Bot
BOT_TOKEN=your_telegram_bot_token_here
BOT_USERNAME=YourBotUsername
ADMIN_ID=your_admin_id

# Mini App
WEBAPP_URL=https://your-domain.com
ADMIN_WEBAPP_URL=https://your-domain.com/admin

# TON Wallet (optional)
TON_WALLET_ADDRESS=your_wallet_address

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

#### Frontend (.env)
Create `frontend/.env`:
```env
REACT_APP_API_URL=https://your-domain.com/api
REACT_APP_BOT_USERNAME=YourBotUsername
```

#### Admin (.env)
Create `admin/.env`:
```env
REACT_APP_API_URL=https://your-domain.com/api
```

### 4. Run the Application

**Development Mode (All services in one terminal):**
```bash
npm start
```

This will start:
- 📱 Frontend (usually port 3000)
- 🖥️ Backend API (port 3001)
- ⚙️ Admin Panel (port 3002)

**Individual Services:**
```bash
# Terminal 1 - Backend
npm run start:backend

# Terminal 2 - Frontend
npm run start:frontend

# Terminal 3 - Admin
npm run start:admin
```

## 📚 Admin Panel Features

### Cases Management
- Create/Edit/Delete cases
- Support for case types:
  - **Normal**: Regular paid cases
  - **Roulette**: Win/lose cases with win chance percentage
  - **Daily Free**: Free daily claims with optional task requirements
  - **Referral**: Cases that reset daily, require X referrals
  - **Promo**: Cases opened with promotional codes

### Rewards Management
- Add rewards to cases (gifts, NFTs, stars)
- Set rarity levels (common, rare, epic, legendary)
- Configure drop chances
- Manage images/icons

### NFT Management
- Create NFT rewards
- Set NFT metadata
- Upload NFT images
- Assign NFTs to cases

### Promo Codes
- Generate promotional codes
- Link to specific cases
- Set star requirements per code
- Set usage limits
- Auto-expire codes
- View usage statistics

### Broadcast Stars
- Send stars to all users at once
- Custom reason/notes shown in transactions
- Track delivery count

### User Management
- View user profiles
- Ban/Unban users
- Adjust user balance
- View referral stats
- Check transaction history

### Withdrawals & Deposits
- Approve/Reject withdrawal requests
- Add notes to transactions
- View deposit history
- Manage TON & Stars deposits

## 🌍 Timezone Settings

**Important**: All daily resets happen at **GMT+5 00:00**

Affected features:
- Daily free cases
- Referral cases
- Promo code daily limits

To change timezone, modify in `backend/src/controllers/cases.js`:
```javascript
// Change the GMT offset here (currently +5)
const gmt5Ms = utcMs + 5 * 60 * 60 * 1000;
```

## 🤖 Battle Bot Integration

Battle bot code is included in `backend/src/services/battleBot.js`

To activate battle commands in your main bot, add to your Telegram bot code:
```javascript
const battleBot = require('./services/battleBot');

// When user starts bot or uses /battle
bot.onText(/\/battle/, (msg) => {
  battleBot.handleBattleCommand(msg);
});
```

## 📦 Deployment

### Docker
```bash
docker-compose up -d
```

### Railway/Render/Heroku
1. Set environment variables in platform dashboard
2. Set build/start commands:
   - **Build**: `npm install:all && npm run build`
   - **Start**: `npm start`

### VPS (Ubuntu)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone <your-repo> tmuxcasebot
cd tmuxcasebot
npm install:all

# Run with PM2
npm install -g pm2
pm2 start npm --name "tmuxcase" -- start
pm2 save
pm2 startup
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find and kill process on port 3001
lsof -i :3001
kill -9 <PID>
```

### Database Lock
Delete/rename `backend/data/tmuxcasebot.db` and restart

### CORS Errors
Check `REACT_APP_API_URL` in frontend/.env matches backend URL

### Telegram Auth Issues
- Verify `BOT_TOKEN` is correct
- Check bot is in private mode
- Ensure `WEBAPP_URL` is whitelisted in Bot settings

## 🎮 Game Features

### Case Opening
- Weighted random selection based on drop chances
- Inventory management
- Price deductions from balance

### Upgrade Game
- Select item from inventory
- Choose upgrade target
- Win chance calculation based on rarity difference
- Confetti animation on win
- Transaction logging

### Daily & Referral Cases
- 24-hour cooldown per user (GMT+5)
- Task requirements (referrals, channel subscription)
- Reset at GMT+5 00:00

### Promo Codes
- Daily usage limit per user
- Star entry requirements
- Expiration dates
- Case-specific assignments

## 📝 API Endpoints

### Public
- `GET /api/cases` - List all cases
- `GET /api/cases/:id` - Case details
- `POST /api/cases/:id/open` - Open a case
- `POST /api/cases/:id/demo` - Demo case open
- `GET /api/promo/:code/validate` - Check promo code
- `POST /api/promo/open` - Open promo case

### Admin Only
- `POST /admin/cases` - Create case
- `PUT /admin/cases/:id` - Update case
- `DELETE /admin/cases/:id` - Delete case
- `POST /admin/promo` - Create promo code
- `GET /admin/promo` - List promo codes
- `DELETE /admin/promo/:id` - Delete promo code
- `POST /admin/broadcast/stars` - Broadcast stars to all users

## 📞 Support

For issues or feature requests, check:
1. Environment variables are set correctly
2. Database permissions
3. Telegram bot settings
4. Network/firewall rules

## 📄 License

Private project - All rights reserved
