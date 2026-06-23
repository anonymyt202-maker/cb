#!/bin/bash
set -e

echo "🎁 TMUX Case Bot - Installation"
echo "================================"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Create .env files if they don't exist
echo ""
echo "📝 Creating .env files..."

if [ ! -f "backend/.env" ]; then
    cat > backend/.env << 'ENV'
PORT=3001
NODE_ENV=development
BOT_TOKEN=your_telegram_bot_token_here
BOT_USERNAME=YourBotUsername
ADMIN_ID=your_admin_id
WEBAPP_URL=https://your-domain.com
ADMIN_WEBAPP_URL=https://your-domain.com/admin
DB_PATH=./data/tmuxcasebot.db
ENV
    echo "✅ Created backend/.env (edit with your settings)"
else
    echo "✅ backend/.env already exists"
fi

if [ ! -f "frontend/.env" ]; then
    cat > frontend/.env << 'ENV'
REACT_APP_API_URL=https://your-domain.com/api
REACT_APP_BOT_USERNAME=YourBotUsername
ENV
    echo "✅ Created frontend/.env"
else
    echo "✅ frontend/.env already exists"
fi

if [ ! -f "admin/.env" ]; then
    cat > admin/.env << 'ENV'
REACT_APP_API_URL=https://your-domain.com/api
ENV
    echo "✅ Created admin/.env"
else
    echo "✅ admin/.env already exists"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
echo "  Installing root packages..."
npm install --legacy-peer-deps > /dev/null 2>&1 || npm install

echo "  Installing backend..."
cd backend && npm install --legacy-peer-deps > /dev/null 2>&1 || npm install
cd ..

echo "  Installing frontend..."
cd frontend && npm install --legacy-peer-deps > /dev/null 2>&1 || npm install
cd ..

echo "  Installing admin..."
cd admin && npm install --legacy-peer-deps > /dev/null 2>&1 || npm install
cd ..

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Edit backend/.env with your Telegram bot token"
echo "  2. Run: npm start"
echo "  3. Visit http://localhost:3000"
echo ""
