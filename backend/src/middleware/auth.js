const crypto = require('crypto');
const { query, queryOne } = require('../utils/db');

function parseEnvList(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function getAdminIds() {
  return new Set(
    parseEnvList(process.env.ADMIN_IDS)
      .map(id => Number.parseInt(id, 10))
      .filter(Number.isFinite)
  );
}

function getAdminUsernames() {
  return new Set(
    parseEnvList(process.env.ADMIN_USERNAMES)
      .map(name => name.toLowerCase())
  );
}

async function ensureAdminUserById(adminId) {
  const id = Number.parseInt(adminId, 10);
  if (!Number.isFinite(id)) return null;

  const placeholder = {
    id,
    username: `admin_${id}`,
    first_name: 'Admin',
    last_name: 'Panel',
    photo_url: null,
  };

  const user = await ensureUser(placeholder);
  await query(`UPDATE users SET is_admin = 1 WHERE id = ?`, [id]);
  return { ...user, is_admin: 1 };
}

function isAdminUser(telegramUser) {
  if (!telegramUser?.id) return false;

  const adminIds = getAdminIds();
  const adminUsernames = getAdminUsernames();

  const idAllowed = adminIds.size > 0 && adminIds.has(Number(telegramUser.id));
  const username = String(telegramUser.username || '').trim().toLowerCase();
  const usernameAllowed = adminUsernames.size === 0 || (username && adminUsernames.has(username));

  return idAllowed && usernameAllowed;
}

function verifyTelegramWebAppData(initData) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    const dataCheckArr = [];
    urlParams.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (signature !== hash) return null;

    // auth_date tekshirish — 24 soat
    const authDate = parseInt(urlParams.get('auth_date'));
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    const userStr = urlParams.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

async function ensureUser(telegramUser) {
  const referralCode = generateReferralCode(telegramUser.id);

  await query(
    `INSERT INTO users (id, username, first_name, last_name, photo_url, referral_code, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       last_seen = datetime('now')`,
    [
      telegramUser.id,
      telegramUser.username || null,
      telegramUser.first_name,
      telegramUser.last_name || null,
      telegramUser.photo_url || null,
      referralCode,
    ]
  );

  await query(
    `INSERT OR IGNORE INTO balances (user_id, stars_balance) VALUES (?, 0)`,
    [telegramUser.id]
  );

  const user = await queryOne(
    `SELECT u.*, b.stars_balance, b.total_deposited, b.total_withdrawn
     FROM users u
     LEFT JOIN balances b ON b.user_id = u.id
     WHERE u.id = ?`,
    [telegramUser.id]
  );

  return user;
}

function generateReferralCode(userId) {
  const hash = crypto
    .createHash('md5')
    .update(String(userId) + (process.env.JWT_SECRET || 'secret'))
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return hash;
}

async function authMiddleware(req, res, next) {
  try {
    const initData = req.headers['x-init-data'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!initData) {
      return res.status(401).json({ error: 'Missing authentication' });
    }

    const telegramUser = verifyTelegramWebAppData(initData);
    if (!telegramUser) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    const user = await ensureUser(telegramUser);
    if (!user) {
      return res.status(500).json({ error: 'Failed to load user' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'Account is banned', banned: true });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

async function adminMiddleware(req, res, next) {
  try {
    const adminKey = String(req.headers['x-admin-key'] || req.headers['x-admin-id'] || '').trim();
    const adminIds = getAdminIds();

    if (adminKey && adminIds.has(Number(adminKey))) {
      const adminUser = await ensureAdminUserById(adminKey);
      if (!adminUser) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      req.user = adminUser;
      return next();
    }

    await authMiddleware(req, res, async () => {
      if (!req.user.is_admin && !isAdminUser(req.user)) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    });
  } catch (err) {
    console.error('Admin middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { authMiddleware, adminMiddleware, verifyTelegramWebAppData, ensureUser, ensureAdminUserById, generateReferralCode, isAdminUser };
