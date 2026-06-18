const { query, queryOne, transaction } = require('../utils/db');
const crypto = require('crypto');

function selectReward(rewards) {
  const totalChance = rewards.reduce((sum, r) => sum + parseFloat(r.chance), 0);
  const random = (crypto.randomInt(0, 1000000) / 1000000) * totalChance;

  let cumulative = 0;
  for (const reward of rewards) {
    cumulative += parseFloat(reward.chance);
    if (random <= cumulative) return reward;
  }
  return rewards[rewards.length - 1];
}

function shuffleRewardsForAnimation(rewards, winner) {
  const pool = [];
  for (let i = 0; i < 30; i++) {
    pool.push(rewards[Math.floor(Math.random() * rewards.length)]);
  }
  pool[23] = winner;
  return pool;
}

function extractInsertId(result) {
  if (result == null) return null;
  if (typeof result === 'number') return result;

  if (Array.isArray(result)) {
    for (const item of result) {
      const id = extractInsertId(item);
      if (id != null) return id;
    }
    return null;
  }

  if (typeof result === 'object') {
    if (result.insertId != null) return result.insertId;
    if (result.lastInsertRowid != null) return result.lastInsertRowid;
    if (result[0] != null) return extractInsertId(result[0]);
  }

  return null;
}

function ensureInventoryId(insertResult, fallbackId = null) {
  const id = extractInsertId(insertResult);
  return id != null ? id : fallbackId;
}

function isProbablyUrl(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return (
    text.startsWith('http://') ||
    text.startsWith('https://') ||
    text.startsWith('//') ||
    text.startsWith('data:') ||
    text.includes('t.me/') ||
    text.includes('telegram.me/') ||
    text.includes('telegram.org/')
  );
}

function normalizeMediaUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:') ||
    raw.startsWith('file:')
  ) {
    return raw;
  }

  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;
  if (raw.startsWith('/public/uploads/')) return raw.replace('/public', '');
  if (raw.startsWith('public/uploads/')) return `/${raw.replace(/^public\//, '')}`;

  if (/^[\w.-]+\.(png|jpe?g|webp|gif|svg|mp4|mov|webm)$/i.test(raw)) {
    return `/uploads/${raw}`;
  }

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
  return {
    ...caseData,
    image_url: normalizeMediaUrl(caseData.image_url),
  };
}

function prepareRewardForClient(reward) {
  if (!reward) return reward;
  return {
    ...reward,
    name: cleanDisplayName(reward),
    image_url: normalizeMediaUrl(reward.image_url),
  };
}

function prepareRewardsForClient(rewards = []) {
  return rewards.map(prepareRewardForClient);
}

// Get all active cases
async function getCases(req, res) {
  try {
    const cases = await query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM case_rewards cr WHERE cr.case_id = c.id AND cr.is_active = 1) as reward_count
       FROM cases c 
       WHERE c.is_active = 1 
       ORDER BY c.sort_order ASC, c.id ASC`
    );
    res.json({ cases: cases.map(prepareCaseForClient) });
  } catch (err) {
    console.error('getCases error:', err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
}

// Get single case with rewards
async function getCaseById(req, res) {
  try {
    const { id } = req.params;
    const caseData = prepareCaseForClient(await queryOne(`SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]));
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const rewards = await query(
      `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1 ORDER BY rarity DESC, chance DESC`,
      [id]
    );

    res.json({ case: caseData, rewards: prepareRewardsForClient(rewards) });
  } catch (err) {
    console.error('getCaseById error:', err);
    res.status(500).json({ error: 'Failed to load case' });
  }
}

// Open a case
async function openCase(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const caseData = prepareCaseForClient(await queryOne(
      `SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]
    ));
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    if (caseData.case_type === 'daily_free') {
      return await openDailyFreeCase(req, res, caseData);
    }
    if (caseData.case_type === 'referral') {
      return await openReferralCase(req, res, caseData);
    }

    const rewards = prepareRewardsForClient(await query(
      `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [id]
    ));
    if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

    const balance = await queryOne(
      `SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]
    );

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
          await conn.execute(
            `UPDATE balances SET stars_balance = stars_balance - ? WHERE user_id = ?`,
            [caseData.price, userId]
          );
          await conn.execute(
            `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type)
             VALUES (?, 'case_open', ?, ?, ?, 'roulette_loss')`,
            [userId, -caseData.price, balance.stars_balance, parseFloat(balance.stars_balance) - parseFloat(caseData.price)]
          );
          await conn.execute(
            `INSERT INTO case_opens (user_id, case_id, reward_id, stars_spent) VALUES (?, ?, ?, ?)`,
            [userId, id, rewards[0].id, caseData.price]
          );
        });
        return res.json({ won: false, message: 'Better luck next time!' });
      }
    } else {
      selectedReward = prepareRewardForClient(selectReward(rewards));
    }

    const result = await transaction(async (conn) => {
      const balanceBefore = parseFloat(balance.stars_balance);
      const balanceAfter = balanceBefore - parseFloat(caseData.price);

      await conn.execute(
        `UPDATE balances SET stars_balance = ?, total_deposited = total_deposited WHERE user_id = ?`,
        [balanceAfter, userId]
      );

      let inventoryId = null;

      if (selectedReward.reward_type === 'stars') {
        const starsWon = parseFloat(selectedReward.stars_amount);
        await conn.execute(
          `UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`,
          [starsWon, starsWon, userId]
        );
        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
           VALUES (?, 'case_open', ?, ?, ?, ?)`,
          [userId, starsWon - caseData.price, balanceBefore, balanceAfter + starsWon, `Won ${starsWon} Stars from case`]
        );
      } else {
        const invResult = await conn.execute(
          `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`,
          [userId, selectedReward.id, id]
        );
        inventoryId = ensureInventoryId(invResult);

        if (!inventoryId) {
          throw new Error('Inventory insert failed: could not determine inventory id');
        }

        await conn.execute(
          `INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`,
          [inventoryId, userId, `Won from case: ${caseData.name}`]
        );

        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
           VALUES (?, 'case_open', ?, ?, ?, ?)`,
          [userId, -caseData.price, balanceBefore, balanceAfter, `Opened case: ${caseData.name}`]
        );
      }

      await conn.execute(
        `INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, ?)`,
        [userId, id, selectedReward.id, inventoryId, caseData.price]
      );

      return { selectedReward: prepareRewardForClient(selectedReward), inventoryId, balanceAfter };
    });

    res.json({
      won: true,
      reward: result.selectedReward,
      inventory_id: result.inventoryId,
      new_balance: result.balanceAfter,
      animation_rewards: shuffleRewardsForAnimation(rewards, prepareRewardForClient(selectedReward)),
    });
  } catch (err) {
    console.error('openCase error:', err);
    res.status(500).json({ error: 'Failed to open case' });
  }
}

async function openDailyFreeCase(req, res, caseData) {
  const userId = req.user.id;

  if (caseData.task_type === 'channel_sub') {
    // checked client-side
  }
  if (caseData.task_type === 'referrals') {
    const refCount = await queryOne(
      `SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?`, [userId]
    );
    if ((refCount?.cnt || 0) < caseData.task_min_referrals) {
      return res.status(400).json({
        error: `You need ${caseData.task_min_referrals} referrals to open this case`,
        current: refCount?.cnt || 0,
        required: caseData.task_min_referrals
      });
    }
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const existing = await queryOne(
    `SELECT id, claimed_at FROM daily_free_claims 
     WHERE user_id = ? AND case_id = ? AND claimed_at >= ? AND claimed_at < ?`,
    [userId, caseData.id, todayStart.toISOString(), tomorrowStart.toISOString()]
  );

  if (existing) {
    // Calculate exact time when user can claim again
    const claimedTime = new Date(existing.claimed_at);
    const nextClaimTime = new Date(claimedTime);
    nextClaimTime.setDate(nextClaimTime.getDate() + 1);
    
    const now = new Date();
    const msLeft = nextClaimTime - now;
    const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
    const minutesLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));
    
    const timeStr = hoursLeft > 0 
      ? `${hoursLeft}h ${minutesLeft}m`
      : minutesLeft > 0 ? `${minutesLeft}m` : 'Soon';
    
    const claimTimeStr = nextClaimTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    return res.status(400).json({
      error: `⏰ Free case already opened today!\n\nNext available in: ${timeStr}\nAvailable at: ${claimTimeStr}`,
      next_at: nextClaimTime.toISOString(),
      hours_left: hoursLeft,
      minutes_left: minutesLeft
    });
  }

  const rewards = prepareRewardsForClient(await query(
    `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [caseData.id]
  ));
  if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

  const selectedReward = prepareRewardForClient(selectReward(rewards));

  const result = await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO daily_free_claims (user_id, case_id, expires_at) VALUES (?, ?, ?)`,
      [userId, caseData.id, tomorrowStart.toISOString()]
    );

    let inventoryId = null;
    if (selectedReward.reward_type === 'stars') {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const starsWon = parseFloat(selectedReward.stars_amount);
      await conn.execute(
        `UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`,
        [starsWon, starsWon, userId]
      );
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
         VALUES (?, 'case_open', ?, ?, ?, 'Daily free case win')`,
        [userId, starsWon, bal.stars_balance, parseFloat(bal.stars_balance) + starsWon]
      );
    } else {
      const invResult = await conn.execute(
        `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`,
        [userId, selectedReward.id, caseData.id]
      );
      inventoryId = ensureInventoryId(invResult);
      if (!inventoryId) {
        throw new Error('Inventory insert failed: could not determine inventory id');
      }
      await conn.execute(
        `INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`,
        [inventoryId, userId, `Won from daily free case: ${caseData.name}`]
      );
    }

    await conn.execute(
      `INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, 0)`,
      [userId, caseData.id, selectedReward.id, inventoryId]
    );

    return { selectedReward: prepareRewardForClient(selectedReward), inventoryId };
  });

  res.json({
    won: true,
    reward: result.selectedReward,
    inventory_id: result.inventoryId,
    animation_rewards: shuffleRewardsForAnimation(rewards, prepareRewardForClient(selectedReward)),
  });
}

async function openReferralCase(req, res, caseData) {
  const userId = req.user.id;

  const refCount = await queryOne(
    `SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?`, [userId]
  );
  if ((refCount?.cnt || 0) < caseData.referrals_required) {
    return res.status(400).json({
      error: `You need ${caseData.referrals_required} referrals to open this case`,
      current: refCount?.cnt || 0,
      required: caseData.referrals_required
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const existing = await queryOne(
    `SELECT id FROM referral_case_claims 
     WHERE user_id = ? AND case_id = ? AND claimed_at >= ?`,
    [userId, caseData.id, todayStart.toISOString()]
  );

  if (existing) {
    return res.status(400).json({
      error: 'Already claimed today. Come back tomorrow!',
      next_at: tomorrowStart.toISOString()
    });
  }

  const rewards = prepareRewardsForClient(await query(
    `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [caseData.id]
  ));
  if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

  const selectedReward = prepareRewardForClient(selectReward(rewards));

  const result = await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO referral_case_claims (user_id, case_id, expires_at) VALUES (?, ?, ?)`,
      [userId, caseData.id, tomorrowStart.toISOString()]
    );

    let inventoryId = null;
    if (selectedReward.reward_type === 'stars') {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const starsWon = parseFloat(selectedReward.stars_amount);
      await conn.execute(
        `UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`,
        [starsWon, starsWon, userId]
      );
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
         VALUES (?, 'case_open', ?, ?, ?, 'Referral case win')`,
        [userId, starsWon, bal.stars_balance, parseFloat(bal.stars_balance) + starsWon]
      );
    } else {
      const invResult = await conn.execute(
        `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`,
        [userId, selectedReward.id, caseData.id]
      );
      inventoryId = ensureInventoryId(invResult);
      if (!inventoryId) {
        throw new Error('Inventory insert failed: could not determine inventory id');
      }
      await conn.execute(
        `INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`,
        [inventoryId, userId, `Won from referral case: ${caseData.name}`]
      );
    }

    await conn.execute(
      `INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, 0)`,
      [userId, caseData.id, selectedReward.id, inventoryId]
    );

    return { selectedReward: prepareRewardForClient(selectedReward), inventoryId };
  });

  res.json({
    won: true,
    reward: result.selectedReward,
    inventory_id: result.inventoryId,
    animation_rewards: shuffleRewardsForAnimation(rewards, prepareRewardForClient(selectedReward)),
  });
}

module.exports = { getCases, getCaseById, openCase };
