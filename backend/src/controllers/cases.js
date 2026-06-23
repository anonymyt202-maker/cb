const { query, queryOne, transaction } = require('../utils/db');
const crypto = require('crypto');

// GMT+5 midnight helper
function getGMT5DayBounds() {
  const now = new Date();
  const utcMs = now.getTime();
  const gmt5Ms = utcMs + 5 * 60 * 60 * 1000;
  const gmt5Date = new Date(gmt5Ms);
  gmt5Date.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(gmt5Date.getTime() - 5 * 60 * 60 * 1000);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { todayStart, tomorrowStart };
}

function selectReward(rewards, isDemo = false) {
  const pool = [...rewards];
  if (isDemo) {
    // Demo: boost rare/epic chances slightly, normalize
    const boosted = pool.map(r => ({
      ...r,
      chance: r.rarity === 'common' ? parseFloat(r.chance) * 0.7 : parseFloat(r.chance) * 1.4,
    }));
    const total = boosted.reduce((s, r) => s + r.chance, 0);
    const random = (crypto.randomInt(0, 1000000) / 1000000) * total;
    let cumulative = 0;
    for (const reward of boosted) {
      cumulative += reward.chance;
      if (random <= cumulative) return pool.find(r => r.id === reward.id) || pool[pool.length - 1];
    }
    return pool[pool.length - 1];
  }
  const totalChance = pool.reduce((sum, r) => sum + parseFloat(r.chance), 0);
  const random = (crypto.randomInt(0, 1000000) / 1000000) * totalChance;
  let cumulative = 0;
  for (const reward of pool) {
    cumulative += parseFloat(reward.chance);
    if (random <= cumulative) return reward;
  }
  return pool[pool.length - 1];
}

function shuffleRewardsForAnimation(rewards, winner) {
  const pool = [];
  for (let i = 0; i < 30; i++) pool.push(rewards[Math.floor(Math.random() * rewards.length)]);
  pool[23] = winner;
  return pool;
}

function extractInsertId(result) {
  if (result == null) return null;
  if (typeof result === 'number') return result;
  if (Array.isArray(result)) { for (const item of result) { const id = extractInsertId(item); if (id != null) return id; } return null; }
  if (typeof result === 'object') {
    if (result.insertId != null) return result.insertId;
    if (result.lastInsertRowid != null) return result.lastInsertRowid;
    if (result[0] != null) return extractInsertId(result[0]);
  }
  return null;
}

function isProbablyUrl(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return text.startsWith('http://') || text.startsWith('https://') || text.startsWith('//') ||
    text.startsWith('data:') || text.includes('t.me/') || text.includes('telegram.me/');
}

function normalizeMediaUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('file:')) return raw;
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;
  if (/^[\w.-]+\.(png|jpe?g|webp|gif|svg|mp4|mov|webm)$/i.test(raw)) return `/uploads/${raw}`;
  return raw;
}

function cleanDisplayName(reward) {
  const original = typeof reward?.name === 'string' ? reward.name.trim() : '';
  if (!original) {
    if (reward?.reward_type === 'stars') return 'Telegram Stars';
    if (reward?.gift_emoji) return reward.gift_emoji;
    return 'Reward';
  }
  if (isProbablyUrl(original)) {
    if (reward?.reward_type === 'stars') return 'Telegram Stars';
    if (reward?.gift_emoji) return `${reward.gift_emoji} Telegram Gift`;
    if (reward?.reward_type === 'gift') return 'Telegram Gift';
    if (reward?.reward_type === 'nft') return 'NFT Reward';
    return 'Reward';
  }
  return original;
}

function prepareCaseForClient(caseData) {
  if (!caseData) return caseData;
  return { ...caseData, image_url: normalizeMediaUrl(caseData.image_url) };
}

function prepareRewardForClient(reward) {
  if (!reward) return reward;
  return { ...reward, name: cleanDisplayName(reward), image_url: normalizeMediaUrl(reward.image_url) };
}

function prepareRewardsForClient(rewards = []) {
  return rewards.map(prepareRewardForClient);
}

async function getCases(req, res) {
  try {
    const cases = await query(
      `SELECT c.*, (SELECT COUNT(*) FROM case_rewards cr WHERE cr.case_id = c.id AND cr.is_active = 1) as reward_count
       FROM cases c WHERE c.is_active = 1 ORDER BY c.sort_order ASC, c.id ASC`
    );
    res.json({ cases: cases.map(prepareCaseForClient) });
  } catch (err) {
    console.error('getCases error:', err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
}

async function getCaseById(req, res) {
  try {
    const { id } = req.params;
    const caseData = prepareCaseForClient(await queryOne(`SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]));
    if (!caseData) return res.status(404).json({ error: 'Case not found' });
    const rewards = await query(`SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1 ORDER BY rarity DESC, chance DESC`, [id]);
    res.json({ case: caseData, rewards: prepareRewardsForClient(rewards) });
  } catch (err) {
    console.error('getCaseById error:', err);
    res.status(500).json({ error: 'Failed to load case' });
  }
}

async function openCase(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isDemo = req.body?.demo === true || req.query?.demo === 'true';

    const caseData = prepareCaseForClient(await queryOne(`SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]));
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    if (caseData.case_type === 'daily_free') return openDailyFreeCase(req, res, caseData);
    if (caseData.case_type === 'referral') return openReferralCase(req, res, caseData);
    if (caseData.case_type === 'promo') return res.status(400).json({ error: 'Use promo code endpoint' });

    const rewards = prepareRewardsForClient(await query(`SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [id]));
    if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

    if (isDemo) {
      const selectedReward = prepareRewardForClient(selectReward(rewards, true));
      await query(
        `INSERT INTO case_opens (user_id, case_id, reward_id, stars_spent, is_demo) VALUES (?, ?, ?, 0, 1)`,
        [userId, id, selectedReward.id]
      );
      return res.json({
        won: true, demo: true,
        reward: selectedReward,
        inventory_id: null,
        animation_rewards: shuffleRewardsForAnimation(rewards, selectedReward),
      });
    }

    const balance = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
    if (!balance || parseFloat(balance.stars_balance) < parseFloat(caseData.price)) {
      return res.status(400).json({ error: 'Insufficient Stars balance' });
    }

    let selectedReward;
    if (caseData.case_type === 'roulette') {
      const winRoll = crypto.randomInt(0, 10000);
      const winChance = parseFloat(caseData.win_chance) * 100;
      if (winRoll < winChance) {
        selectedReward = prepareRewardForClient(rewards[0]);
      } else {
        await transaction(async (conn) => {
          await conn.execute(`UPDATE balances SET stars_balance = stars_balance - ? WHERE user_id = ?`, [caseData.price, userId]);
          await conn.execute(
            `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type) VALUES (?, 'case_open', ?, ?, ?, 'roulette_loss')`,
            [userId, -caseData.price, balance.stars_balance, parseFloat(balance.stars_balance) - parseFloat(caseData.price)]
          );
          await conn.execute(`INSERT INTO case_opens (user_id, case_id, reward_id, stars_spent) VALUES (?, ?, ?, ?)`, [userId, id, rewards[0].id, caseData.price]);
        });
        return res.json({ won: false, message: 'Better luck next time!' });
      }
    } else {
      selectedReward = prepareRewardForClient(selectReward(rewards));
    }

    const result = await transaction(async (conn) => {
      const balanceBefore = parseFloat(balance.stars_balance);
      const balanceAfter = balanceBefore - parseFloat(caseData.price);
      await conn.execute(`UPDATE balances SET stars_balance = ? WHERE user_id = ?`, [balanceAfter, userId]);

      let inventoryId = null;
      if (selectedReward.reward_type === 'stars') {
        const starsWon = parseFloat(selectedReward.stars_amount);
        await conn.execute(`UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`, [starsWon, starsWon, userId]);
        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, ?)`,
          [userId, starsWon - caseData.price, balanceBefore, balanceAfter + starsWon, `Won ${starsWon} Stars from case`]
        );
      } else {
        const invResult = await conn.execute(`INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`, [userId, selectedReward.id, id]);
        inventoryId = extractInsertId(invResult);
        if (!inventoryId) throw new Error('Inventory insert failed');
        await conn.execute(`INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`, [inventoryId, userId, `Won from case: ${caseData.name}`]);
        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, ?)`,
          [userId, -caseData.price, balanceBefore, balanceAfter, `Opened case: ${caseData.name}`]
        );
      }
      await conn.execute(`INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, ?)`, [userId, id, selectedReward.id, inventoryId, caseData.price]);
      return { selectedReward: prepareRewardForClient(selectedReward), inventoryId, balanceAfter };
    });

    res.json({
      won: true, reward: result.selectedReward, inventory_id: result.inventoryId,
      new_balance: result.balanceAfter,
      animation_rewards: shuffleRewardsForAnimation(rewards, prepareRewardForClient(selectedReward)),
    });
  } catch (err) {
    console.error(`[openCase] ERROR:`, err);
    res.status(500).json({ error: 'Failed to open case: ' + err.message });
  }
}

async function openDailyFreeCase(req, res, caseData) {
  const userId = req.user.id;
  if (caseData.task_type === 'referrals') {
    const refCount = await queryOne(`SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?`, [userId]);
    if ((refCount?.cnt || 0) < caseData.task_min_referrals) {
      return res.status(400).json({ error: `You need ${caseData.task_min_referrals} referrals`, current: refCount?.cnt || 0, required: caseData.task_min_referrals });
    }
  }

  const { todayStart, tomorrowStart } = getGMT5DayBounds();
  const existing = await queryOne(
    `SELECT id, claimed_at FROM daily_free_claims WHERE user_id = ? AND case_id = ? AND claimed_at >= ? AND claimed_at < ?`,
    [userId, caseData.id, todayStart.toISOString(), tomorrowStart.toISOString()]
  );

  if (existing) {
    const msLeft = tomorrowStart - new Date();
    const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
    const minutesLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));
    const timeStr = hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : minutesLeft > 0 ? `${minutesLeft}m` : 'Tez kunda';
    return res.status(400).json({
      error: `⏰ Bugun allaqachon ochildi!\n\nKeyingisi: ${timeStr} (GMT+5 00:00 da reset)`,
      next_at: tomorrowStart.toISOString(), hours_left: hoursLeft, minutes_left: minutesLeft
    });
  }

  const rewards = prepareRewardsForClient(await query(`SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [caseData.id]));
  if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });
  const selectedReward = prepareRewardForClient(selectReward(rewards));

  const result = await transaction(async (conn) => {
    await conn.execute(`INSERT INTO daily_free_claims (user_id, case_id, expires_at) VALUES (?, ?, ?)`, [userId, caseData.id, tomorrowStart.toISOString()]);
    let inventoryId = null;
    if (selectedReward.reward_type === 'stars') {
      const bal = await conn.all(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const balData = Array.isArray(bal) ? bal[0] : bal;
      const currentBalance = parseFloat(balData?.stars_balance || 0);
      const starsWon = parseFloat(selectedReward.stars_amount);
      await conn.execute(`UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`, [starsWon, starsWon, userId]);
      await conn.execute(`INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, ?)`, [userId, starsWon, currentBalance, currentBalance + starsWon, `Daily free case win`]);
    } else {
      const invResult = await conn.execute(`INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`, [userId, selectedReward.id, caseData.id]);
      inventoryId = extractInsertId(invResult);
      if (!inventoryId) throw new Error('Inventory insert failed');
      await conn.execute(`INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`, [inventoryId, userId, `Won from daily free case: ${caseData.name}`]);
    }
    await conn.execute(`INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, 0)`, [userId, caseData.id, selectedReward.id, inventoryId]);
    return { selectedReward: prepareRewardForClient(selectedReward), inventoryId };
  });

  res.json({ won: true, reward: result.selectedReward, inventory_id: result.inventoryId, animation_rewards: shuffleRewardsForAnimation(rewards, prepareRewardForClient(selectedReward)) });
}

async function openReferralCase(req, res, caseData) {
  const userId = req.user.id;
  const refCount = await queryOne(`SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?`, [userId]);
  if ((refCount?.cnt || 0) < caseData.referrals_required) {
    return res.status(400).json({ error: `You need ${caseData.referrals_required} referrals`, current: refCount?.cnt || 0, required: caseData.referrals_required });
  }

  const { todayStart, tomorrowStart } = getGMT5DayBounds();
  const existing = await queryOne(
    `SELECT id FROM referral_case_claims WHERE user_id = ? AND case_id = ? AND claimed_at >= ? AND claimed_at < ?`,
    [userId, caseData.id, todayStart.toISOString(), tomorrowStart.toISOString()]
  );
  if (existing) {
    const msLeft = tomorrowStart - new Date();
    const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
    const minutesLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));
    return res.status(400).json({ error: `⏰ Bugun allaqachon ochildi! GMT+5 00:00 da yangilanadi`, next_at: tomorrowStart.toISOString(), hours_left: hoursLeft, minutes_left: minutesLeft });
  }

  const rewards = prepareRewardsForClient(await query(`SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [caseData.id]));
  if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });
  const selectedReward = prepareRewardForClient(selectReward(rewards));

  const result = await transaction(async (conn) => {
    await conn.execute(`INSERT INTO referral_case_claims (user_id, case_id, expires_at) VALUES (?, ?, ?)`, [userId, caseData.id, tomorrowStart.toISOString()]);
    let inventoryId = null;
    if (selectedReward.reward_type === 'stars') {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const starsWon = parseFloat(selectedReward.stars_amount);
      await conn.execute(`UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`, [starsWon, starsWon, userId]);
      await conn.execute(`INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, 'Referral case win')`, [userId, starsWon, bal.stars_balance, parseFloat(bal.stars_balance) + starsWon]);
    } else {
      const invResult = await conn.execute(`INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`, [userId, selectedReward.id, caseData.id]);
      inventoryId = extractInsertId(invResult);
      if (!inventoryId) throw new Error('Inventory insert failed');
      await conn.execute(`INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`, [inventoryId, userId, `Won from referral case: ${caseData.name}`]);
    }
    await conn.execute(`INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, 0)`, [userId, caseData.id, selectedReward.id, inventoryId]);
    return { selectedReward: prepareRewardForClient(selectedReward), inventoryId };
  });

  res.json({ won: true, reward: result.selectedReward, inventory_id: result.inventoryId, animation_rewards: shuffleRewardsForAnimation(rewards, prepareRewardForClient(selectedReward)) });
}

// Promo code case
async function openPromoCase(req, res) {
  try {
    const { code } = req.body;
    const userId = req.user.id;
    if (!code) return res.status(400).json({ error: 'Promo code required' });

    const promo = await queryOne(
      `SELECT p.*, c.name as case_name, c.is_active as case_active FROM promo_codes p JOIN cases c ON c.id = p.case_id WHERE UPPER(p.code) = UPPER(?) AND p.is_active = 1`,
      [code.trim()]
    );
    if (!promo) return res.status(400).json({ error: '❌ Noto\'g\'ri promo kod' });
    if (!promo.case_active) return res.status(400).json({ error: '❌ Case mavjud emas' });
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ error: '❌ Promo kod muddati o\'tgan' });
    if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return res.status(400).json({ error: '❌ Promo kod limiti tugagan' });

    // Stars required check
    if (promo.stars_required > 0) {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      if (!bal || parseFloat(bal.stars_balance) < promo.stars_required) {
        return res.status(400).json({ error: `❌ ${promo.stars_required} ⭐ kerak, balansingiz yetarli emas` });
      }
    }

    const { todayStart, tomorrowStart } = getGMT5DayBounds();
    const existing = await queryOne(
      `SELECT id FROM promo_code_claims WHERE promo_id = ? AND user_id = ? AND claimed_at >= ? AND claimed_at < ?`,
      [promo.id, userId, todayStart.toISOString(), tomorrowStart.toISOString()]
    );
    if (existing) {
      const msLeft = tomorrowStart - new Date();
      const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
      const minutesLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));
      return res.status(400).json({ error: `⏰ Bugun allaqachon ochildi! ${hoursLeft}h ${minutesLeft}m qoldi (GMT+5 00:00 reset)`, next_at: tomorrowStart.toISOString() });
    }

    const rewards = prepareRewardsForClient(await query(`SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [promo.case_id]));
    if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });
    const selectedReward = prepareRewardForClient(selectReward(rewards));

    const result = await transaction(async (conn) => {
      // Deduct stars if required
      if (promo.stars_required > 0) {
        const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
        const balBefore = parseFloat(bal?.stars_balance || 0);
        await conn.execute(`UPDATE balances SET stars_balance = stars_balance - ? WHERE user_id = ?`, [promo.stars_required, userId]);
        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, ?)`,
          [userId, -promo.stars_required, balBefore, balBefore - promo.stars_required, `Promo case: ${promo.code}`]
        );
      }
      await conn.execute(`INSERT INTO promo_code_claims (promo_id, user_id, expires_at) VALUES (?, ?, ?)`, [promo.id, userId, tomorrowStart.toISOString()]);
      await conn.execute(`UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?`, [promo.id]);

      let inventoryId = null;
      if (selectedReward.reward_type === 'stars') {
        const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
        const starsWon = parseFloat(selectedReward.stars_amount);
        await conn.execute(`UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`, [starsWon, starsWon, userId]);
        await conn.execute(`INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, 'Promo case win')`, [userId, starsWon, bal?.stars_balance || 0, parseFloat(bal?.stars_balance || 0) + starsWon]);
      } else {
        const invResult = await conn.execute(`INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`, [userId, selectedReward.id, promo.case_id]);
        inventoryId = extractInsertId(invResult);
        if (!inventoryId) throw new Error('Inventory insert failed');
        await conn.execute(`INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`, [inventoryId, userId, `Won from promo case: ${promo.case_name}`]);
      }
      await conn.execute(`INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, ?)`, [userId, promo.case_id, selectedReward.id, inventoryId, promo.stars_required || 0]);
      return { selectedReward: prepareRewardForClient(selectedReward), inventoryId };
    });

    res.json({ won: true, reward: result.selectedReward, inventory_id: result.inventoryId, case_name: promo.case_name, animation_rewards: shuffleRewardsForAnimation(rewards, prepareRewardForClient(selectedReward)) });
  } catch (err) {
    console.error('[openPromoCase] error:', err);
    res.status(500).json({ error: 'Failed to open promo case: ' + err.message });
  }
}

// Validate promo code (no open)
async function validatePromoCode(req, res) {
  try {
    const { code } = req.params;
    const userId = req.user.id;
    const promo = await queryOne(
      `SELECT p.*, c.name as case_name FROM promo_codes p JOIN cases c ON c.id = p.case_id WHERE UPPER(p.code) = UPPER(?) AND p.is_active = 1`,
      [code.trim()]
    );
    if (!promo) return res.status(404).json({ error: '❌ Promo kod topilmadi' });
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ error: '❌ Muddati o\'tgan' });
    if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return res.status(400).json({ error: '❌ Limit tugagan' });

    const { todayStart, tomorrowStart } = getGMT5DayBounds();
    const claimed = await queryOne(
      `SELECT id FROM promo_code_claims WHERE promo_id = ? AND user_id = ? AND claimed_at >= ? AND claimed_at < ?`,
      [promo.id, userId, todayStart.toISOString(), tomorrowStart.toISOString()]
    );

    res.json({
      valid: true, case_name: promo.case_name, stars_required: promo.stars_required,
      claimed_today: !!claimed, next_at: tomorrowStart.toISOString(),
      uses_left: promo.max_uses > 0 ? promo.max_uses - promo.used_count : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to validate promo code' });
  }
}

module.exports = { getCases, getCaseById, openCase, openPromoCase, validatePromoCode };
