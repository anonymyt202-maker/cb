# ⚡ Quick Start - 3 Steps

## Step 1: Install
```bash
cd cb-main
chmod +x INSTALL.sh
./INSTALL.sh
```

Or manually:
```bash
npm install:all
```

## Step 2: Configure
Edit `backend/.env`:
```
BOT_TOKEN=your_token_from_botfather
BOT_USERNAME=YourBotName
ADMIN_ID=your_telegram_id
WEBAPP_URL=https://your-domain.com
```

## Step 3: Start
```bash
npm start
```

Opens:
- 📱 Frontend: http://localhost:3000
- 🖥️ Backend: http://localhost:3001
- ⚙️ Admin: http://localhost:3002

---

## 🎯 Admin First Steps

1. Go to http://localhost:3002/admin
2. Create a **Case** (Cases tab)
3. Add **Rewards** to that case (Rewards tab)
4. Create promotional codes (Promo tab)
5. Or add NFTs (NFT tab)

## 🎟️ Promo Code Example

```
Code: WELCOME2024
Case: Your case
Stars Required: 10
Max Uses: 100
```

Users enter code in app → 🎟️ Promo Kod button → Opens case

## 🌍 GMT+5 Reset

Daily cases reset at **00:00 GMT+5** (same as Tashkent time zone)

## 🎮 Demo Mode

Open cases without cost:
- Click "🎮 Demo" button
- Items don't save to inventory
- Better drop rates for testing

## ⚙️ Full Setup Guide

See `SETUP.md` for:
- Telegram bot configuration
- Production deployment
- Docker/Railway setup
- Battle bot integration
- Complete API reference
