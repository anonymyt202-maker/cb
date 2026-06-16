const { query, queryOne, transaction } = require('../utils/db');
const crypto = require('crypto');

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
    res.json({ cases });
  } catch (err) {
    console.error('getCases error:', err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
}

// Get single case with rewards
async function getCaseById(req, res) {
  try {
    const { id } = req.params;
    const caseData = await queryOne(
      `SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]
    );
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const rewards = await query(
      `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1 ORDER BY rarity DESC, chance DESC`,
      [id]
    );

    res.json({ case: caseData, rewards });
  } catch (err) {
    console.error('getCaseById error:', err);
    res.status(500).json({ error: 'Failed to load case' });
  }
}

// Server-side weighted reward selection
function selectReward(rewards) {
  const totalChance = rewards.reduce((sum, r) => sum + parseFloat(r.chance), 0);
  const random = crypto.randomInt(0, 1000000) / 1000000 * totalChance;
  
  let cumulative = 0;
  for (const reward of rewards) {
    cumulative += parseFloat(reward.chance);
    if (random <= cumulative) return reward;
  }
  return rewards[rewards.length - 1];
}

// Open a case
async function openCase(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const caseData = await queryOne(
      `SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]
    );
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    // Handle special case types
    if (caseData.case_type === 'daily_free') {
      return await openDailyFreeCase(req, res, caseData);
    }
    if (caseData.case_type === 'referral') {
      return await openReferralCase(req, res, caseData);
    }

    const rewards = await query(
      `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [id]
    );
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
        selectedReward = rewards[0];
      } else {
        // Lost - deduct stars, no reward
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
      selectedReward = selectReward(rewards);
    }

    // Process win
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
        const [invResult] = await conn.execute(
          `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`,
          [userId, selectedReward.id, id]
        );
        inventoryId = invResult.insertId;

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

      return { selectedReward, inventoryId, balanceAfter };
    });

    res.json({
      won: true,
      reward: result.selectedReward,
      inventory_id: result.inventoryId,
      new_balance: result.balanceAfter,
      // Send all rewards for animation (shuffled)
      animation_rewards: shuffleRewardsForAnimation(rewards, selectedReward),
    });
  } catch (err) {
    console.error('openCase error:', err);
    res.status(500).json({ error: 'Failed to open case' });
  }
}

async function openDailyFreeCase(req, res, caseData) {
  const userId = req.user.id;

  // Check task completion
  if (caseData.task_type === 'channel_sub') {
    // This is verified client-side via Telegram SDK in production
    // Server trusts the check for now; add webhook verification for production
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

  // Check 24h cooldown
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const existing = await queryOne(
    `SELECT id FROM daily_free_claims 
     WHERE user_id = ? AND case_id = ? AND claimed_at >= ? AND claimed_at < ?`,
    [userId, caseData.id, todayStart.toISOString(), tomorrowStart.toISOString()]
  );

  if (existing) {
    return res.status(400).json({ 
      error: 'Already claimed today. Come back tomorrow!',
      next_at: tomorrowStart.toISOString()
    });
  }

  const rewards = await query(
    `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [caseData.id]
  );
  if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

  const selectedReward = selectReward(rewards);

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
      const [inv] = await conn.execute(
        `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`,
        [userId, selectedReward.id, caseData.id]
      );
      inventoryId = inv.insertId;
    }

    await conn.execute(
      `INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, 0)`,
      [userId, caseData.id, selectedReward.id, inventoryId]
    );

    return { selectedReward, inventoryId };
  });

  res.json({
    won: true,
    reward: result.selectedReward,
    inventory_id: result.inventoryId,
    animation_rewards: shuffleRewardsForAnimation(rewards, selectedReward),
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

  // Check 24h cooldown
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

  const rewards = await query(
    `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [caseData.id]
  );
  if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

  const selectedReward = selectReward(rewards);

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
      const [inv] = await conn.execute(
        `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`,
        [userId, selectedReward.id, caseData.id]
      );
      inventoryId = inv.insertId;
    }

    await conn.execute(
      `INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, 0)`,
      [userId, caseData.id, selectedReward.id, inventoryId]
    );

    return { selectedReward, inventoryId };
  });

  res.json({
    won: true,
    reward: result.selectedReward,
    inventory_id: result.inventoryId,
    animation_rewards: shuffleRewardsForAnimation(rewards, selectedReward),
  });
}

function shuffleRewardsForAnimation(rewards, winner) {
  const pool = [];
  // Create a pool of 30 items for animation reel
  for (let i = 0; i < 30; i++) {
    pool.push(rewards[Math.floor(Math.random() * rewards.length)]);
  }
  // Place winner at position 24 (landing spot)
  pool[23] = winner;
  return pool;
}

module.exports = { getCases, getCaseById, openCase };
