#!/bin/bash
# ============================================
#   TmuxCaseBot — Ishga tushirish skripti
# ============================================

echo "🚀 TmuxCaseBot ishga tushirilmoqda..."
echo ""

# Node.js tekshirish
if ! command -v node &> /dev/null; then
  echo "❌ Node.js topilmadi! https://nodejs.org dan yuklab o'rnating"
  exit 1
fi
echo "✅ Node.js: $(node -v)"
echo "✅ npm: $(npm -v)"
echo ""

# Backend deps
echo "📦 Backend dependency'lar o'rnatilmoqda..."
cd backend && npm install && cd ..
echo ""

# Frontend deps
echo "📦 Frontend dependency'lar o'rnatilmoqda..."
cd frontend && npm install && cd ..
echo ""

# Admin deps
echo "📦 Admin dependency'lar o'rnatilmoqda..."
cd admin && npm install && cd ..
echo ""

# Root deps (concurrently)
echo "📦 Root dependency'lar o'rnatilmoqda..."
npm install
echo ""

echo "✅ Barcha paketlar o'rnatildi!"
echo ""
echo "🤖 Botni ishga tushirish uchun:"
echo "   npm start        — Backend + Frontend + Admin (hammasi birga)"
echo "   npm run start:backend  — Faqat backend (bot ishlaydi)"
echo ""
echo "🌐 Portlar:"
echo "   Backend  → http://localhost:3001"
echo "   Frontend → http://localhost:3000"
echo "   Admin    → http://localhost:3002"
echo ""

read -p "Hammani birga ishga tushirasizmi? (y/n): " choice
if [ "$choice" = "y" ]; then
  npm start
fi
