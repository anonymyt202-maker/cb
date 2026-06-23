# 🚀 Railway Deploy Yo'riqnomasi

Railway'da **3 ta alohida service** yaratiladi:
1. `backend`  → Bot + API
2. `frontend` → Telegram Mini App (WebApp)
3. `admin`    → Admin Panel

---

## 📋 Bosqichlar

### 1) GitHub'ga yuklang
```
tmuxcasebot_final/ papkasini GitHub repo qiling
```

### 2) Railway'da Backend service
- New Project → Deploy from GitHub repo
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`

**Environment Variables (backend):**
```
PORT=3001
NODE_ENV=production
DB_HOST=acela.proxy.rlwy.net
DB_PORT=35422
DB_NAME=railway
DB_USER=root
DB_PASS=PWyKUfaXVeAYNjDGRRyveScDjWPguPyg
BOT_TOKEN=8662290225:AAHI2ZAtd4hrWmZTlJU3ZjHy9bx2vsX1n1k
BOT_USERNAME=TmuxCaseBot
ADMIN_IDS=8512512542
JWT_SECRET=efd08bb63e43df04bdb320e0a3385be2661c52bb5c940d23a5d9b8088849ad3654af005c84d1f8e5fb05f5506a999a45bcc0fe3a9a8103ff21811f02c6095f12
TON_WALLET_ADDRESS=UQCqVzce3_hF0U455VVzTliL28dVOOytQsxTKAT0sVDyhPuJ
WEBAPP_URL=https://FRONTEND_URL_KEYIN_YANGILANG.railway.app
ADMIN_URL=https://ADMIN_URL_KEYIN_YANGILANG.railway.app
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```
> ⚠️ WEBAPP_URL va ADMIN_URL ni frontend/admin deploy bo'lgandan keyin yangilang!

---

### 3) Railway'da Frontend service
- New Service → same repo
- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run serve`

**Environment Variables (frontend):**
```
REACT_APP_API_URL=https://BACKEND_URL.railway.app/api
REACT_APP_TON_WALLET=UQCqVzce3_hF0U455VVzTliL28dVOOytQsxTKAT0sVDyhPuJ
```

---

### 4) Railway'da Admin service
- New Service → same repo
- **Root Directory:** `admin`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run serve`

**Environment Variables (admin):**
```
REACT_APP_API_URL=https://BACKEND_URL.railway.app/api
```

---

### 5) URL larni yangilang
Deploy tugagach Railway har bir service uchun URL beradi:
```
backend  → https://tmuxcasebot-backend.railway.app
frontend → https://tmuxcasebot-frontend.railway.app
admin    → https://tmuxcasebot-admin.railway.app
```

Backend service → Variables ga kiring:
- `WEBAPP_URL` = frontend Railway URL
- `ADMIN_URL`  = admin Railway URL

---

### 6) BotFather sozlamalari
BotFather'ga yozing:
```
/setmenubutton
→ botni tanlang
→ URL: https://tmuxcasebot-frontend.railway.app
→ Text: 🎰 TmuxCase
```

---

### 7) Database schema
```bash
mysql -h acela.proxy.rlwy.net -P 35422 -u root -pPWyKUfaXVeAYNjDGRRyveScDjWPguPyg railway < database/schema.sql
```

---

## ✅ Webapp ishlashi uchun shart
- [x] Frontend HTTPS — Railway avtomatik beradi
- [x] Backend CORS — WEBAPP_URL to'g'ri bo'lsa ishlaydi
- [x] BotFather'da WebApp URL sozlangan
- [x] REACT_APP_API_URL backend URL ga ko'rsatilgan
