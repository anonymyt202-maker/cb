# 🎁 TmuxCaseBot — Sozlash Yo'riqnomasi

## 📁 Fayllarni joylashtirish

Bu fayllarni **tmuxcasebot** papkasidagi tegishli joylarga ko'chiring:

```
tmuxcasebot/
├── backend/
│   ├── .env                  ← backend/.env  (shu yerga)
│   └── src/
│       └── utils/
│           └── db.js         ← backend/src/utils/db.js  (shu yerga, almashtiring)
├── frontend/
│   └── .env                  ← frontend/.env  (shu yerga)
├── admin/
│   └── .env                  ← admin/.env  (shu yerga)
└── package.json              ← root package.json  (shu yerga)
```

---

## ⚡ Ishga tushirish

### 1-usul: Bash skripti bilan (eng oson)
```bash
chmod +x start.sh
./start.sh
```

### 2-usul: Qo'lda
```bash
# Paketlarni o'rnating
npm install --prefix backend
npm install --prefix frontend
npm install --prefix admin
npm install   # concurrently uchun (root)

# Hammani birga ishga tushiring
npm start
```

### 3-usul: Faqat backend (bot uchun yetarli)
```bash
cd backend
npm install
npm start
```

---

## 🌐 Portlar

| Xizmat   | URL                      |
|----------|--------------------------|
| Backend  | http://localhost:3001    |
| Frontend | http://localhost:3000    |
| Admin    | http://localhost:3002    |

---

## ✅ Tekshirish

Backend ishga tushgandan so'ng:
```
http://localhost:3001/health
```
`{"status":"ok"}` ko'rsansa — ishlayapti ✅

---

## 🗄️ Database

**Railway MySQL** (tashqi) ishlatilmoqda:
- Host: `acela.proxy.rlwy.net:35422`
- Database: `railway`

Database schema'ni yuklash uchun:
```bash
mysql -h acela.proxy.rlwy.net -P 35422 -u root -pPWyKUfaXVeAYNjDGRRyveScDjWPguPyg railway < database/schema.sql
```

---

## 🔔 Eslatma

- `NODE_ENV=development` — bot **long polling** orqali ishlaydi (webhook shart emas)
- Frontend va Admin Telegram Mini App ichida ishlamaydi, ular build qilinib hosting'ga yuklanadi
- Faqat bot + backend uchun `npm run start:backend` yetarli
