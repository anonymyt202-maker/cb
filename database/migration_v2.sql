-- TmuxCaseBot v2 Migration
-- Run this AFTER the main schema.sql

-- Add new settings for channel join & start message editor
INSERT IGNORE INTO settings (key_name, value, description) VALUES
('required_channel', '', 'Required channel ID or @username (empty = no requirement)'),
('join_channel_text', '⚠️ <b>Channel Subscription Required</b>\n\nTo use TmuxCaseBot you must join our channel first.', 'Message shown when user is not subscribed'),
('subscription_success_text', '✅ <b>Subscription Confirmed!</b>\n\nWelcome! You can now access the app.', 'Message shown after successful subscription check'),
('welcome_text', '🎁 <b>Welcome to TmuxCaseBot!</b>\n\nOpen cases, win Telegram Gifts & NFTs, and upgrade your items!', 'Welcome message text'),
('open_app_button_text', '🎰 Open Mini App', 'Text for the open app button'),
('extra_buttons', '[]', 'JSON array of extra buttons: [{text, url}]');

-- Add referral_verified column to referrals (anti-fake protection)
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS channel_joined BOOLEAN DEFAULT FALSE;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS webapp_opened BOOLEAN DEFAULT FALSE;

-- Index for broadcasts
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
