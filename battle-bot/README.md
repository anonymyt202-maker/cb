# TmuxCase — Battle Bot (qo'shimcha modul)

Bu papka — Voice/Vote Battle Telegram boti, TmuxCaseBot ekotizimining qo'shimcha
qismi sifatida qo'shildi.

## MUHIM: alohida bot token kerak

Bu bot **TmuxCaseBot'dan boshqa, alohida Telegram bot** bo'lishi shart. Bir xil
BOT_TOKEN'ni ikki joyda (backend va bu battle-bot) ishlatish bo'lmaydi — Telegram
bitta tokenga faqat bitta `getUpdates`/webhook ulanishini ruxsat beradi, aks holda
"409 Conflict" xatosi chiqadi.

1. @BotFather'da yangi bot yarating (masalan `@TmuxBattleBot`)
2. Olingan tokenni `.env` faylidagi `BOT_TOKEN`ga qo'ying
3. `TMUXCASE_WEBAPP_URL` ga asosiy TmuxCaseBot Mini App domeningizni yozing
   (masalan `https://tmuxcase.up.railway.app`)

## O'rnatish

```bash
cd battle-bot
npm install
cp .env.example .env
# .env faylini to'ldiring
npm start
```

## Railway/Render'ga deploy qilish

Bu bot asosiy backend'dan **mustaqil** process. Railway/Render'da alohida
"service" sifatida deploy qiling:

- Root directory: `battle-bot`
- Build command: `npm install`
- Start command: `npm start`
- Environment variables: `.env.example` dagi barcha qiymatlarni kiriting

## /start xabari

Foydalanuvchi botga `/start` bosganda, ikkita tugma ko'rsatiladi:
- **📱 Open App** — TmuxCaseBot Mini App'ni ochadi (web_app tugmasi)
- **🆕 Create Battle** — to'g'ridan-to'g'ri battle yaratish oqimini boshlaydi

Pastda esa odatdagi menyu (🏆 Battle yaratish, 📋 Battlelarim, 📊 Statistika,
ℹ️ Yordam) davom etadi.

## ⚠️ Ma'lumotlar saqlash haqida

Bu bot foydalanuvchi/battle ma'lumotlarini local JSON fayllarda saqlaydi.
Railway/Render kabi platformalarda **persistent disk** ulanmagan bo'lsa, har
redeploy/restart'da bu fayllar o'chib ketadi. Agar bu muhim bo'lsa:
- Railway: "Volumes" qo'shib, bot ishlайдиган papkaga mount qiling
- Render: "Disks" qo'shing va shu papkaga ulang
TmuxCaseBot asosiy backend'ida ham xuddi shunday SQLite fayl persistence
muammosi bor edi — shu sababli bir xil yechimni qo'llash tavsiya etiladi.
