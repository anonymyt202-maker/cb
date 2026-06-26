const { Telegraf } = require('telegraf');
const axios = require('axios');
const { query, queryOne, transaction } = require('../utils/db');
const { generateReferralCode, isAdminUser } = require('../middleware/auth');

let bot;

function getBot() {
  if (!bot) bot = new Telegraf(process.env.BOT_TOKEN);
  return bot;
}

// Check if user is member of required channel
async function checkChannelMembership(userId) {
  const setting = await queryOne(`SELECT value FROM settings WHERE key_name = 'required_channel'`);
  const channelId = setting?.value;
  if (!channelId) return true; // No channel required

  try {
    const b = getBot();
    const member = await b.telegram.getChatMember(channelId, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (err) {
    console.error('checkChannelMembership error:', err.message);
    return false; // If can't check, block
  }
}

// Get setting value with fallback
async function getSetting(key, fallback = '') {
  try {
    const row = await queryOne(`SELECT value FROM settings WHERE key_name = ?`, [key]);
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function setupBot() {
  const b = getBot();
  const webAppUrl = process.env.WEBAPP_URL || 'https://your-domain.com';

  // /start command
  b.start(async (ctx) => {
    const startParam = ctx.startPayload;
    const userId = ctx.from.id;

    try {
      // Check if user exists
      const existingUser = await queryOne(`SELECT id, referral_code FROM users WHERE id = ?`, [userId]);
      
      if (!existingUser) {
        // NEW USER - Create with referral code
        const userReferralCode = generateReferralCode(userId);
        await query(
          `INSERT INTO users (id, username, first_name, last_name, referral_code) 
           VALUES (?, ?, ?, ?, ?)`,
          [userId, ctx.from.username || null, ctx.from.first_name, ctx.from.last_name || null, userReferralCode]
        );
        await query(`INSERT INTO balances (user_id, stars_balance) VALUES (?, 0)`, [userId]);
        console.log(`[/start] New user registered: ${userId}`);
      } else {
        // EXISTING USER - Only update profile info, keep referral_code and balance!
        await query(
          `UPDATE users SET username = ?, first_name = ?, last_name = ?, last_seen = datetime('now') 
           WHERE id = ?`,
          [ctx.from.username || null, ctx.from.first_name, ctx.from.last_name || null, userId]
        );
        console.log(`[/start] Existing user updated: ${userId}`);
      }
    } catch (err) {
      console.error(`[/start] Error registering user:`, err);
    }

    
    // Store pending referral code (before channel join)
    if (startParam && startParam.startsWith('ref_')) {
      try {
        await query(
          `INSERT OR REPLACE INTO settings (key_name, value, updated_at) VALUES (?, ?, datetime('now'))`,
          [`pending_ref_${userId}`, startParam.replace('ref_', '')]
        );
      } catch (err) {
        console.error(`[/start] Error storing pending referral:`, err);
      }
    }

    // Check channel membership
    try {
      const isMember = await checkChannelMembership(userId);
      if (!isMember) {
        const channelId = await getSetting('required_channel');
        const joinText = await getSetting('join_channel_text', '⚠️ <b>Channel Subscription Required</b>\n\nTo use TmuxCaseBot you must join our channel first.');

        return ctx.reply(joinText, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📢 Join Channel', url: channelId.startsWith('@') ? `https://t.me/${channelId.replace('@', '')}` : channelId }],
              [{ text: '✅ I Joined - Check', callback_data: 'check_subscription' }],
            ],
          },
        });
      }
    } catch (err) {
      console.error(`[/start] Channel check error:`, err);
    }

    // Process referral (after channel join confirmed)
    try {
      await processReferral(userId, startParam, ctx);
    } catch (err) {
      console.error(`[/start] Referral process error:`, err);
    }

    // Send welcome
    try {
      await sendWelcomeMessage(ctx, userId, webAppUrl);
    } catch (err) {
      console.error(`[/start] Welcome message error:`, err);
      await ctx.reply('Error sending welcome message. Please try again.');
    }
  });

  // Anti-nakrutka captcha javobi
  b.action(/^captcha_(\d+)_(-?\d+)$/, async (ctx) => {
    const targetUserId = parseInt(ctx.match[1], 10);
    const chosenAnswer = parseInt(ctx.match[2], 10);
    const userId = ctx.from.id;

    if (userId !== targetUserId) {
      return ctx.answerCbQuery('Bu sizga tegishli emas.', { show_alert: true });
    }

    const pending = await queryOne(`SELECT value FROM settings WHERE key_name = ?`, [`captcha_pending_${userId}`]);
    if (!pending?.value) {
      return ctx.answerCbQuery('Bu so\'rov muddati o\'tgan.', { show_alert: true });
    }

    let data;
    try { data = JSON.parse(pending.value); } catch { data = null; }
    if (!data) return ctx.answerCbQuery('Xatolik yuz berdi.', { show_alert: true });

    if (chosenAnswer !== data.correct) {
      await ctx.answerCbQuery('❌ Noto\'g\'ri javob, qaytadan urinib ko\'ring.', { show_alert: true });
      // Yangi misol bilan qaytadan yuboramiz
      await query(`DELETE FROM settings WHERE key_name = ?`, [`captcha_pending_${userId}`]);
      await sendReferralCaptcha(ctx, userId, data.startParam);
      try { await ctx.deleteMessage(); } catch (e) {}
      return;
    }

    await ctx.answerCbQuery('✅ Tasdiqlandi!');
    await query(`DELETE FROM settings WHERE key_name = ?`, [`captcha_pending_${userId}`]);

    try {
      const referralCode = data.startParam.replace('ref_', '');
      const referrer = await queryOne(`SELECT id FROM users WHERE referral_code = ?`, [referralCode]);
      if (referrer && referrer.id !== userId) {
        await grantReferralReward(referrer.id, userId, ctx);
      }
    } catch (err) {
      console.error('captcha referral grant error:', err);
    }

    try { await ctx.deleteMessage(); } catch (e) {}
    await ctx.reply('✅ Tasdiqlandingiz! Endi ilovadan to\'liq foydalanishingiz mumkin.');
  });

  // Check subscription callback
  b.action('check_subscription', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const isMember = await checkChannelMembership(userId);

    if (!isMember) {
      const channelId = await getSetting('required_channel');
      return ctx.editMessageText(
        '❌ You haven\'t joined the channel yet.\n\nPlease join first then click check again.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📢 Join Channel', url: channelId.startsWith('@') ? `https://t.me/${channelId.replace('@', '')}` : channelId }],
              [{ text: '✅ I Joined - Check', callback_data: 'check_subscription' }],
            ],
          },
        }
      );
    }

    // Process any pending referral
    const pendingRef = await queryOne(`SELECT value FROM settings WHERE key_name = ?`, [`pending_ref_${userId}`]);
    if (pendingRef?.value) {
      await processReferral(userId, `ref_${pendingRef.value}`, ctx);
      await query(`DELETE FROM settings WHERE key_name = ?`, [`pending_ref_${userId}`]);
    }

    const successText = await getSetting('subscription_success_text', '✅ <b>Subscription Confirmed!</b>\n\nWelcome! You can now access the app.');
    const webAppUrl = process.env.WEBAPP_URL || 'https://your-domain.com';
    const openBtnText = await getSetting('open_app_button_text', '🎰 Open Mini App');

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: openBtnText, web_app: { url: webAppUrl } }]],
      },
    });
  });

  // /admin command
  b.command('admin', async (ctx) => {
    if (!isAdminUser(ctx.from)) return ctx.reply('❌ Access denied');
    const stats = await queryOne(
      `SELECT (SELECT COUNT(*) FROM users) as users, (SELECT COUNT(*) FROM case_opens) as opens, (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') as pending_w, (SELECT COUNT(*) FROM deposits WHERE status = 'pending') as pending_d`
    );
    await ctx.reply(
      `📊 <b>Admin Dashboard</b>\n\n👥 Users: ${stats.users}\n🎰 Case Opens: ${stats.opens}\n⏳ Pending Withdrawals: ${stats.pending_w}\n💰 Pending Deposits: ${stats.pending_d}`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '⚙️ Admin Panel', web_app: { url: process.env.ADMIN_URL || `${process.env.WEBAPP_URL || webAppUrl}/admin` } }]] },
      }
    );
  });

  // Stars payment
  b.on('pre_checkout_query', async (ctx) => ctx.answerPreCheckoutQuery(true));

  b.on('message', async (ctx) => {
    if (ctx.message.successful_payment) {
      const payment = ctx.message.successful_payment;
      const userId = ctx.from.id;
      const starsAmount = payment.total_amount;
      try {
        await transaction(async (conn) => {
          const bal = await conn.get(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
          const balBefore = parseFloat(bal?.stars_balance || 0);
          await conn.execute(
            `INSERT INTO deposits (user_id, method, amount, stars_credited, telegram_payment_charge_id, status) VALUES (?, 'stars', ?, ?, ?, 'completed')`,
            [userId, starsAmount, starsAmount, payment.telegram_payment_charge_id]
          );
          await conn.execute(`UPDATE balances SET stars_balance = stars_balance + ?, total_deposited = total_deposited + ? WHERE user_id = ?`, [starsAmount, starsAmount, userId]);
          await conn.execute(
            `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'deposit', ?, ?, ?, 'Stars deposit via bot')`,
            [userId, starsAmount, balBefore, balBefore + starsAmount]
          );
        });
        const webUrl = process.env.WEBAPP_URL || 'https://your-domain.com';
        await ctx.reply(`✅ <b>Payment Successful!</b>\n\n<b>${starsAmount} ⭐</b> added to your balance!`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🎰 Open Mini App', web_app: { url: webUrl } }]] },
        });
      } catch (err) {
        console.error('Stars payment error:', err);
      }
    }
  });

  return b;
}

// ============================================================================
//  ANTI-NAKRUTKA (referral fraud) — oddiy captcha
//  Talab: "Nakrutkadan himoya anti bot misol beriladi 1 ta misol 3 ta variant"
//  Yangi foydalanuvchi referral orqali kelganda, mukofot DARHOL berilmaydi —
//  avval oddiy matematik misol (1 misol, 3 javob variant) ko'rsatiladi.
//  To'g'ri javob berilgandagina referral haqiqiy deb hisoblanadi va
//  referrer'ga mukofot yoziladi. Bu oddiy bot/skript orqali ko'plab
//  "soxta" referral hosil qilishni qiyinlashtiradi.
// ============================================================================
function generateCaptchaChallenge() {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  const correct = a + b;

  const wrongOffsets = [1, -1, 2, -2, 3].sort(() => Math.random() - 0.5);
  const wrongAnswers = new Set();
  for (const off of wrongOffsets) {
    const candidate = correct + off;
    if (candidate !== correct && candidate > 0) wrongAnswers.add(candidate);
    if (wrongAnswers.size >= 2) break;
  }
  const options = [correct, ...Array.from(wrongAnswers).slice(0, 2)];
  while (options.length < 3) options.push(correct + options.length + 1);

  // Variantlarni aralashtiramiz
  options.sort(() => Math.random() - 0.5);

  return { question: `${a} + ${b} = ?`, options, correct };
}

async function sendReferralCaptcha(ctx, userId, startParam) {
  const challenge = generateCaptchaChallenge();

  // Pending referralni va kutilayotgan to'g'ri javobni saqlaymiz
  await query(
    `INSERT OR REPLACE INTO settings (key_name, value) VALUES (?, ?)`,
    [`captcha_pending_${userId}`, JSON.stringify({ startParam, correct: challenge.correct })]
  );

  await ctx.reply(
    `🤖 <b>Tasdiqlash kerak</b>\n\nIltimos, robot emasligingizni tasdiqlash uchun savolga javob bering:\n\n<b>${challenge.question}</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [challenge.options.map(opt => ({
          text: String(opt),
          callback_data: `captcha_${userId}_${opt}`,
        }))],
      },
    }
  );
}

async function processReferral(userId, startParam, ctx) {
  if (!startParam || !startParam.startsWith('ref_')) return;
  const referralCode = startParam.replace('ref_', '');
  const referrer = await queryOne(`SELECT id FROM users WHERE referral_code = ?`, [referralCode]);
  if (!referrer || referrer.id === userId) return;

  // Update referred_by if not set
  await query(
    `UPDATE users SET referred_by = COALESCE(referred_by, ?) WHERE id = ?`,
    [referrer.id, userId]
  );

  const existingRef = await queryOne(`SELECT id FROM referrals WHERE referrer_id = ? AND referred_id = ?`, [referrer.id, userId]);
  if (existingRef) return;

  // Nakrutkadan himoya: mukofotni darhol bermaymiz — avval anti-bot captcha
  // ko'rsatamiz. To'g'ri javob berilgandan keyin grantReferralReward chaqiriladi
  // (quyida, captcha_ callback handlerida).
  await sendReferralCaptcha(ctx, userId, startParam);
}

async function grantReferralReward(referrerId, referredUserId, ctx) {
  const existingRef = await queryOne(`SELECT id FROM referrals WHERE referrer_id = ? AND referred_id = ?`, [referrerId, referredUserId]);
  if (existingRef) return;

  const rewardStars = parseFloat(await getSetting('referral_reward_stars', '10'));
  const referrer = { id: referrerId };

  await transaction(async (conn) => {
    await conn.execute(
      `INSERT OR IGNORE INTO referrals (referrer_id, referred_id, reward_given) VALUES (?, ?, ?)`,
      [referrer.id, referredUserId, rewardStars]
    );
    if (rewardStars > 0) {
      const bal = await conn.get(`SELECT stars_balance FROM balances WHERE user_id = ?`, [referrer.id]);
      const balBefore = parseFloat(bal?.stars_balance || 0);
      await conn.execute(`UPDATE balances SET stars_balance = stars_balance + ? WHERE user_id = ?`, [rewardStars, referrer.id]);
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'referral_reward', ?, ?, ?, 'Referral reward')`,
        [referrer.id, rewardStars, balBefore, balBefore + rewardStars]
      );
    }
  });

  try {
    const b = getBot();
    await b.telegram.sendMessage(
      referrer.id,
      `🎉 <b>New Referral!</b>\n\n${ctx.from.first_name} joined using your link!\nYou received <b>${rewardStars} ⭐</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}
}

async function sendWelcomeMessage(ctx, userId, webAppUrl) {
  const welcomeText = await getSetting('welcome_text', '🎁 <b>Welcome to TmuxCaseBot!</b>\n\nOpen cases, win Telegram Gifts & NFTs, and upgrade your items!');
  const openBtnText = await getSetting('open_app_button_text', '🎰 Open Mini App');

  const extraButtons = [];
  try {
    const extraBtns = JSON.parse(await getSetting('extra_buttons', '[]'));
    extraBtns.forEach(btn => {
      if (btn.text && btn.url) extraButtons.push([{ text: btn.text, url: btn.url }]);
    });
  } catch {}

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: openBtnText, web_app: { url: webAppUrl } }],
        ...extraButtons,
      ],
    },
  });
}

async function createStarsInvoiceLink(amount) {
  const stars = Math.max(1, Math.floor(Number(amount) || 0));
  if (!stars) return null;
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) throw new Error('BOT_TOKEN is not set');
    const payload = `stars_deposit_${stars}_${Date.now()}`;
    const { data } = await axios.post(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      title: 'Top Up Balance',
      description: `Add ${stars} ⭐ Stars to your TmuxCaseBot balance`,
      payload,
      currency: 'XTR',
      prices: [{ label: `${stars} Stars`, amount: stars }],
    }, { timeout: 15000 });
    if (!data?.ok || !data?.result) throw new Error(data?.description || 'Telegram invoice creation failed');
    return data.result;
  } catch (err) {
    console.error('createStarsInvoiceLink error:', err?.response?.data || err.message);
    return null;
  }
}

async function sendStarsInvoice(userId, amount) {
  const link = await createStarsInvoiceLink(amount);
  return !!link;
}

async function notifyAdminWithdrawal(withdrawalId, user, item) {
  const b = getBot();
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
  const message = `🔔 <b>Withdrawal Request</b>\n\n👤 @${user.username || 'N/A'}\n🆔 <code>${user.id}</code>\n📦 ${item.reward_type === 'gift' ? '🎁 Gift' : '🖼️ NFT'}: ${item.name}\n💰 Value: ${item.value} ⭐`;
  for (const adminId of adminIds) {
    try {
      await b.telegram.sendMessage(adminId, message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_w_${withdrawalId}` }, { text: '❌ Reject', callback_data: `reject_w_${withdrawalId}` }]] },
      });
    } catch (e) {}
  }
}

async function notifyAdminDeposit(depositId, user, deposit) {
  const b = getBot();
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
  const message = `💰 <b>TON Deposit</b>\n\n👤 @${user.username || 'N/A'}\n🆔 <code>${user.id}</code>\n💎 ${deposit.ton_amount} TON\n⭐ Stars: ${deposit.stars_amount}\n🔗 <code>${deposit.tx_hash}</code>`;
  for (const adminId of adminIds) {
    try {
      await b.telegram.sendMessage(adminId, message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_d_${depositId}` }, { text: '❌ Reject', callback_data: `reject_d_${depositId}` }]] },
      });
    } catch (e) {}
  }
}

async function notifyUserWithdrawalApproved(userId, withdrawal) {
  const b = getBot();
  try {
    await b.telegram.sendMessage(userId, `✅ <b>Withdrawal Approved!</b>\n\nYour withdrawal has been processed successfully.`, { parse_mode: 'HTML' });
  } catch (e) {}
}

async function notifyUserWithdrawalRejected(userId, withdrawal) {
  const b = getBot();
  try {
    await b.telegram.sendMessage(userId, `❌ <b>Withdrawal Rejected</b>\n\nReason: ${withdrawal.admin_notes || 'No reason provided'}\n\nThe item has been returned to your inventory.`, { parse_mode: 'HTML' });
  } catch (e) {}
}

async function notifyUserDepositApproved(userId, deposit) {
  const b = getBot();
  try {
    await b.telegram.sendMessage(userId, `✅ <b>Deposit Approved!</b>\n\n<b>${deposit.stars_credited} ⭐</b> added to your balance!`, { parse_mode: 'HTML' });
  } catch (e) {}
}

async function sendBroadcastToAll(broadcastId, { message_text, image_url, button_text, button_url }) {
  const b = getBot();
  const users = await query(`SELECT id FROM users WHERE is_banned = 0`);
  let sent = 0, failed = 0;

  const keyboard = button_text && button_url ? {
    reply_markup: { inline_keyboard: [[{ text: button_text, url: button_url }]] },
  } : {};

  const failedUsers = [];

  for (const user of users) {
    try {
      if (image_url) {
        await b.telegram.sendPhoto(user.id, image_url, { caption: message_text, parse_mode: 'HTML', ...keyboard });
      } else {
        await b.telegram.sendMessage(user.id, message_text, { parse_mode: 'HTML', ...keyboard });
      }
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) {
      failed++;
      failedUsers.push(user.id);
    }
  }

  // Retry failed once
  for (const userId of failedUsers) {
    try {
      await new Promise(r => setTimeout(r, 1000));
      if (image_url) {
        await b.telegram.sendPhoto(userId, image_url, { caption: message_text, parse_mode: 'HTML', ...keyboard });
      } else {
        await b.telegram.sendMessage(userId, message_text, { parse_mode: 'HTML', ...keyboard });
      }
      sent++;
      failed--;
    } catch (e) {}
  }

  await query(
    `UPDATE broadcasts SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = NOW() WHERE id = ?`,
    [sent, failed, broadcastId]
  );
}

module.exports = {
  setupBot, getBot, sendStarsInvoice, createStarsInvoiceLink,
  notifyAdminWithdrawal, notifyAdminDeposit,
  notifyUserWithdrawalApproved, notifyUserWithdrawalRejected, notifyUserDepositApproved,
  sendBroadcastToAll, checkChannelMembership,
};
