-- TmuxCaseBot Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS tmuxcasebot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tmuxcasebot;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  username VARCHAR(255),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255),
  photo_url TEXT,
  language_code VARCHAR(10) DEFAULT 'en',
  is_banned BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  referred_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Balances table
CREATE TABLE IF NOT EXISTS balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL,
  stars_balance DECIMAL(15,2) DEFAULT 0,
  total_deposited DECIMAL(15,2) DEFAULT 0,
  total_withdrawn DECIMAL(15,2) DEFAULT 0,
  total_won DECIMAL(15,2) DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  price DECIMAL(15,2) NOT NULL DEFAULT 0,
  case_type ENUM('normal', 'roulette', 'referral', 'daily_free') NOT NULL DEFAULT 'normal',
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  -- For referral cases
  referrals_required INT DEFAULT 0,
  -- For daily free cases
  task_type ENUM('none', 'channel_sub', 'referrals') DEFAULT 'none',
  task_value VARCHAR(255),
  task_min_referrals INT DEFAULT 0,
  -- For roulette cases
  win_chance DECIMAL(5,2) DEFAULT 50.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Case rewards table
CREATE TABLE IF NOT EXISTS case_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  reward_type ENUM('stars', 'gift', 'nft') NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_url TEXT,
  gift_emoji VARCHAR(10),
  stars_amount DECIMAL(15,2) DEFAULT 0,
  value DECIMAL(15,2) DEFAULT 0,
  rarity ENUM('common', 'rare', 'epic', 'legendary') DEFAULT 'common',
  chance DECIMAL(8,4) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  reward_id INT NOT NULL,
  case_id INT,
  status ENUM('owned', 'sold', 'withdrawn', 'pending_withdrawal') DEFAULT 'owned',
  obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP NULL,
  stars_received DECIMAL(15,2) DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reward_id) REFERENCES case_rewards(id),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL
);

-- Inventory history
CREATE TABLE IF NOT EXISTS inventory_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_id INT NOT NULL,
  user_id BIGINT NOT NULL,
  action ENUM('obtained', 'sold', 'withdrawn', 'returned') NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  inventory_id INT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  admin_id BIGINT,
  admin_notes TEXT,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id),
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Deposits table
CREATE TABLE IF NOT EXISTS deposits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  method ENUM('stars', 'ton') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  stars_credited DECIMAL(15,2) DEFAULT 0,
  ton_tx_hash VARCHAR(255),
  ton_amount DECIMAL(20,8),
  status ENUM('pending', 'completed', 'rejected') DEFAULT 'pending',
  telegram_payment_charge_id VARCHAR(255),
  admin_id BIGINT,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  referred_id BIGINT NOT NULL,
  reward_given DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (referrer_id, referred_id),
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Upgrades table
CREATE TABLE IF NOT EXISTS upgrades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  source_inventory_id INT NOT NULL,
  target_reward_id INT NOT NULL,
  source_value DECIMAL(15,2) NOT NULL,
  target_value DECIMAL(15,2) NOT NULL,
  win_chance DECIMAL(5,2) NOT NULL,
  result ENUM('win', 'lose') NOT NULL,
  result_inventory_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_inventory_id) REFERENCES inventory(id),
  FOREIGN KEY (target_reward_id) REFERENCES case_rewards(id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type ENUM('deposit', 'withdraw', 'case_open', 'sell', 'upgrade', 'referral_reward') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  reference_id INT,
  reference_type VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin logs table
CREATE TABLE IF NOT EXISTS admin_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT NOT NULL,
  action VARCHAR(255) NOT NULL,
  target_type VARCHAR(100),
  target_id INT,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Broadcasts table
CREATE TABLE IF NOT EXISTS broadcasts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT NOT NULL,
  message_text TEXT,
  image_url TEXT,
  button_text VARCHAR(255),
  button_url TEXT,
  target ENUM('all') DEFAULT 'all',
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status ENUM('pending', 'sending', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Case open logs
CREATE TABLE IF NOT EXISTS case_opens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  case_id INT NOT NULL,
  reward_id INT NOT NULL,
  inventory_id INT,
  stars_spent DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id),
  FOREIGN KEY (reward_id) REFERENCES case_rewards(id),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
);

-- Daily free case claims
CREATE TABLE IF NOT EXISTS daily_free_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  case_id INT NOT NULL,
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE KEY (user_id, case_id, expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- Referral case claims
CREATE TABLE IF NOT EXISTS referral_case_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  case_id INT NOT NULL,
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- Default settings
INSERT IGNORE INTO settings (key_name, value, description) VALUES
('referral_reward_stars', '10', 'Stars rewarded per referral'),
('referral_reward_percentage', '0', 'Percentage of referral deposit credited to referrer'),
('ton_to_stars_rate', '100', 'How many stars per 1 TON'),
('upgrade_min_value', '10', 'Minimum item value for upgrades'),
('max_upgrade_chance', '95', 'Maximum upgrade win chance %'),
('min_upgrade_chance', '1', 'Minimum upgrade win chance %'),
('bot_username', 'TmuxCaseBot', 'Telegram bot username'),
('webapp_url', 'https://your-domain.com', 'Mini App URL'),
('maintenance_mode', 'false', 'Maintenance mode toggle');

-- Indexes for performance
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_referred_by ON users(referred_by);
CREATE INDEX idx_inventory_user_status ON inventory(user_id, status);
CREATE INDEX idx_case_opens_user ON case_opens(user_id);
CREATE INDEX idx_case_opens_case ON case_opens(case_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_deposits_user ON deposits(user_id);
CREATE INDEX idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_deposits_status ON deposits(status);
