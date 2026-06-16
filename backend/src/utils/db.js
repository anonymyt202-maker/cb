const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB fayl joyi — backend/ papkasida
const DB_PATH = path.join(__dirname, '../../data/tmuxcasebot.db');

// data/ papkasini yaratish
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance sozlamalari
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Schema yaratish (agar mavjud bo'lmasa)
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      photo_url TEXT,
      language_code TEXT DEFAULT 'en',
      is_banned INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE NOT NULL,
      referred_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      stars_balance REAL DEFAULT 0,
      total_deposited REAL DEFAULT 0,
      total_withdrawn REAL DEFAULT 0,
      total_won REAL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      price REAL NOT NULL DEFAULT 0,
      case_type TEXT NOT NULL DEFAULT 'normal',
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      referrals_required INTEGER DEFAULT 0,
      task_type TEXT DEFAULT 'none',
      task_value TEXT,
      task_min_referrals INTEGER DEFAULT 0,
      win_chance REAL DEFAULT 50.0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS case_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT,
      gift_emoji TEXT,
      stars_amount REAL DEFAULT 0,
      value REAL DEFAULT 0,
      rarity TEXT DEFAULT 'common',
      chance REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reward_id INTEGER NOT NULL,
      case_id INTEGER,
      status TEXT DEFAULT 'owned',
      obtained_at TEXT DEFAULT (datetime('now')),
      sold_at TEXT,
      stars_received REAL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reward_id) REFERENCES case_rewards(id),
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      inventory_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_id INTEGER,
      admin_notes TEXT,
      requested_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      stars_credited REAL DEFAULT 0,
      ton_tx_hash TEXT,
      ton_amount REAL,
      status TEXT DEFAULT 'pending',
      telegram_payment_charge_id TEXT,
      admin_id INTEGER,
      admin_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER NOT NULL,
      reward_given REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(referrer_id, referred_id),
      FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS upgrades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_inventory_id INTEGER NOT NULL,
      target_reward_id INTEGER NOT NULL,
      source_value REAL NOT NULL,
      target_value REAL NOT NULL,
      win_chance REAL NOT NULL,
      result TEXT NOT NULL,
      result_inventory_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (source_inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (target_reward_id) REFERENCES case_rewards(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      reference_id INTEGER,
      reference_type TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_name TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      message_text TEXT,
      image_url TEXT,
      button_text TEXT,
      button_url TEXT,
      target TEXT DEFAULT 'all',
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS case_opens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      reward_id INTEGER NOT NULL,
      inventory_id INTEGER,
      stars_spent REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES cases(id),
      FOREIGN KEY (reward_id) REFERENCES case_rewards(id),
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS daily_free_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      UNIQUE(user_id, case_id, expires_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS referral_case_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
    CREATE INDEX IF NOT EXISTS idx_inventory_user_status ON inventory(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_case_opens_user ON case_opens(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
    CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
  `);

  // Default settings
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO settings (key_name, value, description) VALUES (?, ?, ?)`
  );
  const defaults = [
    ['referral_reward_stars', '10', 'Stars rewarded per referral'],
    ['referral_reward_percentage', '0', 'Percentage of referral deposit credited to referrer'],
    ['ton_to_stars_rate', '100', 'How many stars per 1 TON'],
    ['upgrade_min_value', '10', 'Minimum item value for upgrades'],
    ['max_upgrade_chance', '95', 'Maximum upgrade win chance %'],
    ['min_upgrade_chance', '1', 'Minimum upgrade win chance %'],
    ['bot_username', 'TmuxCaseBot', 'Telegram bot username'],
    ['webapp_url', 'https://your-domain.com', 'Mini App URL'],
    ['maintenance_mode', 'false', 'Maintenance mode toggle'],
  ];
  for (const [k, v, d] of defaults) insertSetting.run(k, v, d);

  console.log('✅ SQLite schema initialized:', DB_PATH);
}

initSchema();

// ── API (mysql2 bilan mos) ──────────────────────────────────────────────────

// better-sqlite3 sync, biz async wrapper beramiz
async function query(sql, params = []) {
  const normalized = normalizeSql(sql);
  const stmt = db.prepare(normalized);
  if (/^\s*(select|pragma)/i.test(normalized)) {
    return stmt.all(...flatParams(params));
  }
  const info = stmt.run(...flatParams(params));
  // mysql2 insertId / affectedRows mos
  return [{ insertId: info.lastInsertRowid, affectedRows: info.changes }];
}

async function queryOne(sql, params = []) {
  const normalized = normalizeSql(sql);
  const stmt = db.prepare(normalized);
  return stmt.get(...flatParams(params)) || null;
}

async function transaction(callback) {
  const txn = db.transaction((fn) => fn());
  // callback conn kutadi — SQLite da connection yo'q, db ni beramiz
  const fakeConn = {
    execute: async (sql, params) => {
      const res = await query(sql, params);
      return [res];
    },
  };
  return txn(() => callback(fakeConn));
}

// MySQL placeholder ? → SQLite ? (ular bir xil aslida)
// MySQL backtick → SQLite double quote (optional, SQLite backtick ham qabul qiladi)
function normalizeSql(sql) {
  return sql
    .replace(/`/g, '"')                        // backtick → double quote
    .replace(/\bNOW\(\)/gi, "datetime('now')") // MySQL NOW() → SQLite datetime
    .replace(/\bCURDATE\(\)/gi, "date('now')") // MySQL CURDATE() → SQLite date
    .replace(/\bBOOLEAN\b/gi, 'INTEGER')
    .replace(/\bTINYINT\(1\)/gi, 'INTEGER');
}

function flatParams(params) {
  // mysql2 da params array keladi, ba'zan nested array ham
  if (Array.isArray(params) && params.length === 1 && Array.isArray(params[0])) {
    return params[0];
  }
  return params;
}

module.exports = { db, query, queryOne, transaction };
