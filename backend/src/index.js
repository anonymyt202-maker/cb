require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { setupBot, getBot } = require('./services/bot');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: [
    process.env.WEBAPP_URL || 'http://localhost:3000',
    process.env.ADMIN_URL || 'http://localhost:3002',
    'https://web.telegram.org',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Init-Data'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
}));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Bot webhook (optional, for production)
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
  const WEBHOOK_PATH = `/webhook/${process.env.BOT_TOKEN}`;
  
  setupBot().then(bot => {
    app.use(WEBHOOK_PATH, (req, res) => {
      bot.handleUpdate(req.body, res);
    });
    
    bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`).then(() => {
      console.log('Webhook set successfully');
    });
  });
} else {
  // Long polling for development
  setupBot().then(bot => {
    bot.launch().then(() => {
      console.log('Bot started with long polling');
    });
  });
}

// Serve frontend React build (static files)
app.use(express.static(path.join(__dirname, '../public')));

// Admin panel
if (process.env.ADMIN_URL) {
  app.get(['/admin', '/admin/*'], (req, res) => {
    return res.redirect(process.env.ADMIN_URL);
  });
} else {
  // If ADMIN_URL is not set, try serving an admin build bundled with the backend
  app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
  });
}

// Frontend SPA fallback (catch-all — must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TmuxCaseBot server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.once('SIGINT', () => {
  const bot = getBot();
  if (bot) bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  const bot = getBot();
  if (bot) bot.stop('SIGTERM');
  process.exit(0);
});
