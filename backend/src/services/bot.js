const { Telegraf } = require('telegraf');
const axios = require('axios');
const { query, queryOne, transaction } = require('../utils/db');
const { generateReferralCode, isAdminUser } = require('../middleware/auth');

let bot;

function getBot() {
  if (!bot) {
    bot = new Telegraf(process.env.BOT_TOKEN);
  }
  return bot;
}

async function setupBot() {
  const b = getBot();
  const webAppUrl = process.env.WEBAPP_URL || 'https://your-domain.com';
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

  b.start(async (ctx) => {
    const startParam = ctx.startPayload;
    const userId = ctx.from.id;

    // Handle referral
    if (startParam && startParam.startsWith('ref_')) {
      const referralCode = startParam.replace('ref_', '');
      const referrer = await queryOne(
        `SELECT id FROM users WHERE referral_code = ?`, [referralCode]
      );

      if (referrer && referrer.id !== userId) {
        // Register the referred user first
        const userReferralCode = generateReferralCode(userId);
        await query(
          `INSERT INTO users (id, username, first_name, last_name, referral_code, referred_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET referred_by = COALESCE(users.referred_by, excluded.referred_by)`,
          [userId, ctx.from.username || null, ctx.from.first_name, ctx.from.last_name || null, userReferralCode, referrer.id]
        );
        await query(`INSERT OR IGNORE INTO balances (user_id, stars_balance) VALUES (?, 0)`, [userId]);

        // Check if referral already exists
        const existingRef = await queryOne(
          `SELECT id FROM referrals WHERE referrer_id = ? AND referred_id = ?`,
          [referrer.id, userId]
        );

        if (!existingRef) {
          const rewardSetting = await queryOne(
            `SELECT value FROM settings WHERE key_name = 'referral_reward_stars'`
          );
          const rewardStars = parseFloat(rewardSetting?.value || 10);

          await transaction(async (conn) => {
            await conn.execute(
              `INSERT OR IGNORE INTO referrals (referrer_id, referred_id, reward_given) VALUES (?, ?, ?)`,
              [referrer.id, userId, rewardStars]
            );

            if (rewardStars > 0) {
              const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [referrer.id]);
              const balBefore = parseFloat(bal?.stars_balance || 0);
              await conn.execute(
                `UPDATE balances SET stars_balance = stars_balance + ? WHERE user_id = ?`,
                [rewardStars, referrer.id]
              );
              await conn.execute(
                `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
                 VALUES (?, 'referral_reward', ?, ?, ?, ?)`,
                [referrer.id, rewardStars, balBefore, balBefore + rewardStars, `Referral reward for inviting user`]
              );
            }
          });

          // Notify referrer
          try {
            await b.telegram.sendMessage(
              referrer.id,
              `🎉 <b>New Referral!</b>\n\n${ctx.from.first_name} joined using your link!\nYou received <b>${rewardStars} ⭐</b>`,
              { parse_mode: 'HTML' }
            );
          } catch (e) {}
        }
      }
    }

    await ctx.reply(
      `🎁 <b>Welcome to TmuxCaseBot!</b>\n\nOpen cases, win Telegram Gifts & NFTs, and upgrade your items!\n\nUse the button below to open the Mini App:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '🎰 Open Mini App', web_app: { url: webAppUrl } }
          ]]
        }
      }
    );
  });

  b.command('admin', async (ctx) => {
    if (!isAdminUser(ctx.from)) {
      return ctx.reply('❌ Access denied');
    }

    const stats = await queryOne(
      `SELECT (SELECT COUNT(*) FROM users) as users,
              (SELECT COUNT(*) FROM case_opens) as opens,
              (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') as pending_w,
              (SELECT COUNT(*) FROM deposits WHERE status = 'pending') as pending_d`
    );

    await ctx.reply(
      `📊 <b>Admin Dashboard</b>\n\n👥 Users: ${stats.users}\n🎰 Case Opens: ${stats.opens}\n⏳ Pending Withdrawals: ${stats.pending_w}\n💰 Pending Deposits: ${stats.pending_d}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '⚙️ Admin Panel', web_app: { url: process.env.ADMIN_URL || `${process.env.WEBAPP_URL || webAppUrl}/admin` } }
          ]]
        }
      }
    );
  });

  // Handle pre-checkout for Stars payments
  b.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // Handle successful Stars payment
  b.on('message', async (ctx) => {
    if (ctx.message.successful_payment) {
      const payment = ctx.message.successful_payment;
      const userId = ctx.from.id;
      const starsAmount = payment.total_amount;

      try {
        await transaction(async (conn) => {
          const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
          const balBefore = parseFloat(bal?.stars_balance || 0);

          const [dep] = await conn.execute(
            `INSERT INTO deposits (user_id, method, amount, stars_credited, telegram_payment_charge_id, status)
             VALUES (?, 'stars', ?, ?, ?, 'completed')`,
            [userId, starsAmount, starsAmount, payment.telegram_payment_charge_id]
          );

          await conn.execute(
            `UPDATE balances SET stars_balance = stars_balance + ?, total_deposited = total_deposited + ? WHERE user_id = ?`,
            [starsAmount, starsAmount, userId]
          );

          await conn.execute(
            `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
             VALUES (?, 'deposit', ?, ?, ?, 'Stars deposit via bot')`,
            [userId, starsAmount, balBefore, balBefore + starsAmount]
          );
        });

        await ctx.reply(
          `✅ <b>Payment Successful!</b>\n\n<b>${starsAmount} ⭐</b> have been added to your balance!\n\nOpen the Mini App to start playing:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '🎰 Open Mini App', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
      } catch (err) {
        console.error('Stars payment processing error:', err);
      }
    }
  });

  return b;
}

async function createStarsInvoiceLink(amount) {
  const stars = Math.max(1, Math.floor(Number(amount) || 0));
  if (!stars) return null;

  try {
    const token = process.env.BOT_TOKEN;
    if (!token) {
      throw new Error('BOT_TOKEN is not set');
    }

    const payload = `stars_deposit_${stars}_${Date.now()}`;

    const { data } = await axios.post(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      title: 'Top Up Balance',
      description: `Add ${stars} ⭐ Stars to your TmuxCaseBot balance`,
      payload,
      currency: 'XTR',
      prices: [{ label: `${stars} Stars`, amount: stars }],
    }, { timeout: 15000 });

    if (!data?.ok || !data?.result) {
      throw new Error(data?.description || 'Telegram invoice creation failed');
    }

    return data.result;
  } catch (err) {
    console.error('createStarsInvoiceLink error:', err?.response?.data || err.message || err);
    return null;
  }
}

// Legacy alias
async function sendStarsInvoice(userId, amount) {
  const link = await createStarsInvoiceLink(amount);
  return !!link;
}

async function notifyAdminWithdrawal(withdrawalId, user, item) {
  const b = getBot();
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

  const message = `
🔔 <b>Withdrawal Request</b>
━━━━━━━━━━━━━━━━━

👤 Username: @${user.username || 'N/A'}
🆔 User ID: <code>${user.id}</code>
📦 Item Type: ${item.reward_type === 'gift' ? '🎁 Gift' : '🖼️ NFT'}
📝 Item Name: ${item.name}
💰 Value: ${item.value} ⭐
━━━━━━━━━━━━━━━━━
  `.trim();

  for (const adminId of adminIds) {
    try {
      await b.telegram.sendMessage(adminId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Approve', callback_data: `approve_w_${withdrawalId}` },
            { text: '❌ Reject', callback_data: `reject_w_${withdrawalId}` }
          ]]
        }
      });
    } catch (e) {}
  }
}

async function notifyAdminDeposit(depositId, user, deposit) {
  const b = getBot();
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

  const message = `
💰 <b>TON Deposit Request</b>
━━━━━━━━━━━━━━━━━

👤 Username: @${user.username || 'N/A'}
🆔 User ID: <code>${user.id}</code>
💎 TON Amount: ${deposit.ton_amount} TON
⭐ Stars to Credit: ${deposit.stars_amount}
🔗 TX Hash: <code>${deposit.tx_hash}</code>
━━━━━━━━━━━━━━━━━
  `.trim();

  for (const adminId of adminIds) {
    try {
      await b.telegram.sendMessage(adminId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Approve', callback_data: `approve_d_${depositId}` },
            { text: '❌ Reject', callback_data: `reject_d_${depositId}` }
          ]]
        }
      });
    } catch (e) {}
  }
}

async function notifyUserWithdrawalApproved(userId, withdrawal) {
  const b = getBot();
  const webAppUrl = process.env.WEBAPP_URL || 'https://your-domain.com';
  try {
    await b.telegram.sendMessage(
      userId,
      `✅ <b>Withdrawal Approved!</b>\n\nYour withdrawal request has been processed successfully.`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}
}

async function notifyUserWithdrawalRejected(userId, withdrawal) {
  const b = getBot();
  try {
    await b.telegram.sendMessage(
      userId,
      `❌ <b>Withdrawal Rejected</b>\n\nYour withdrawal request was rejected. The item has been returned to your inventory.\n\nReason: ${withdrawal.admin_notes || 'No reason provided'}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}
}

async function notifyUserDepositApproved(userId, deposit) {
  const b = getBot();
  try {
    await b.telegram.sendMessage(
      userId,
      `✅ <b>Deposit Approved!</b>\n\n<b>${deposit.stars_credited} ⭐</b> have been added to your balance!`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}
}

async function sendBroadcastToAll(broadcastId, { message_text, image_url, button_text, button_url }) {
  const b = getBot();
  const users = await query(`SELECT id FROM users WHERE is_banned = 0`);

  let sent = 0;
  let failed = 0;

  const keyboard = button_text && button_url ? {
    reply_markup: {
      inline_keyboard: [[{ text: button_text, url: button_url }]]
    }
  } : {};

  for (const user of users) {
    try {
      if (image_url) {
        await b.telegram.sendPhoto(user.id, image_url, {
          caption: message_text,
          parse_mode: 'HTML',
          ...keyboard,
        });
      } else {
        await b.telegram.sendMessage(user.id, message_text, {
          parse_mode: 'HTML',
          ...keyboard,
        });
      }
      sent++;
      await new Promise(r => setTimeout(r, 50)); // Rate limit
    } catch (e) {
      failed++;
    }
  }

  await query(
    `UPDATE broadcasts SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = NOW() WHERE id = ?`,
    [sent, failed, broadcastId]
  );
}

module.exports = {
  setupBot,
  getBot,
  sendStarsInvoice,
  createStarsInvoiceLink,
  notifyAdminWithdrawal,
  notifyAdminDeposit,
  notifyUserWithdrawalApproved,
  notifyUserWithdrawalRejected,
  notifyUserDepositApproved,
  sendBroadcastToAll,
};
