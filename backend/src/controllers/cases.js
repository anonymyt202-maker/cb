const { query, queryOne, transaction } = require('../utils/db');
const crypto = require('crypto');
const { getDayWindow, getOffsetHours } = require('../utils/dailyReset');

async function getSetting(key, fallback = '') {
  try {
    const row = await queryOne(`SELECT value FROM settings WHERE key_name = ?`, [key]);
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Reward tanlash (weighted random) ────────────────────────────────────────
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

// Demo rejimi uchun: eng kam shansli (rare/legendary) prizlarning shansini sun'iy oshiramiz,
// shunda demo ochishda foydalanuvchi qiziqarli/qimmat prizlarni ko'rish ehtimoli kattaroq bo'ladi.
// Bu faqat KO'RSATISH uchun — demo natija inventarga qo'shilmaydi va sotilmaydi.
function selectRewardForDemo(rewards, boostFactor) {
  if (!rewards.length) return null;
  const maxChance = Math.max(...rewards.map(r => parseFloat(r.chance) || 0));
  if (!maxChance) return selectReward(rewards);

  const boosted = rewards.map(r => {
    const c = parseFloat(r.chance) || 0;
    // Shansi past bo'lgan prizlarga ko'proq "boost" beramiz (teskari proporsional),
    // eng yuqori shansli prizga deyarli boost yo'q.
    const rarityFactor = c > 0 ? (maxChance / c) : boostFactor;
    const weight = c * Math.min(boostFactor, 1 + Math.log2(1 + rarityFactor));
    return { ...r, __weight: weight > 0 ? weight : 0.0001 };
  });

  const total = boosted.reduce((s, r) => s + r.__weight, 0);
  const random = (crypto.randomInt(0, 1000000) / 1000000) * total;
  let cumulative = 0;
  for (const r of boosted) {
    cumulative += r.__weight;
    if (random <= cumulative) {
      const { __weight, ...clean } = r;
      return clean;
    }
  }
  const { __weight, ...clean } = boosted[boosted.length - 1];
  return clean;
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

// MUHIM: `chance` maydoni odatda admin uchun, lekin foydalanuvchiga "shans ko'rinmasin" talabiga
// ko'ra, oddiy foydalanuvchiga yuboriladigan reward obyektlaridan chance OLIB TASHLANADI.
// Faqat rarity (common/rare/epic/legendary) va narx/qiymat ko'rsatiladi.
function prepareRewardForClient(reward, { hideChance = true } = {}) {
  if (!reward) return reward;
  const cleaned = {
    ...reward,
    name: cleanDisplayName(reward),
    image_url: normalizeMediaUrl(reward.image_url),
  };
  if (hideChance) delete cleaned.chance;
  return cleaned;
}

function prepareRewardsForClient(rewards = [], opts = {}) {
  return rewards.map(r => prepareRewardForClient(r, opts));
}

// ── Get all active cases ────────────────────────────────────────────────────
async function getCases(req, res) {
  try {
    const cases = await query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM case_rewards cr WHERE cr.case_id = c.id AND cr.is_active = 1) as reward_count
       FROM cases c 
       WHERE c.is_active = 1 AND c.case_type != 'promo'
       ORDER BY c.sort_order ASC, c.id ASC`
    );
    res.json({ cases: cases.map(prepareCaseForClient) });
  } catch (err) {
    console.error('getCases error:', err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
}

// ── Get single case with rewards ────────────────────────────────────────────
async function getCaseById(req, res) {
  try {
    const { id } = req.params;
    const caseData = prepareCaseForClient(await queryOne(`SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]));
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const rewards = await query(
      `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1 ORDER BY rarity DESC, chance DESC`,
      [id]
    );

    // Roulette case turi uchun win_chance ham yashiriladi (shans ko'rinmasin)
    if (caseData.case_type === 'roulette') {
      delete caseData.win_chance;
    }

    res.json({ case: caseData, rewards: prepareRewardsForClient(rewards) });
  } catch (err) {
    console.error('getCaseById error:', err);
    res.status(500).json({ error: 'Failed to load case' });
  }
}

// ── Open a case (real / paid / roulette) ────────────────────────────────────
async function openCase(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
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
    if (caseData.case_type === 'demo') {
      return await openDemoCase(req, res, caseData);
    }
    if (caseData.case_type === 'promo') {
      return res.status(400).json({ error: 'Use /cases/promo/:code/open for promo cases' });
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
    let isRouletteLoss = false;

    if (caseData.case_type === 'roulette') {
      // ── ROULETTE — TO'G'IRLANGAN MANTIQ ──────────────────────────────────
      // Avvalgi versiyada lose holatida hech qanday reward tanlanmagan va animatsiya
      // uchun rewards yuborilmagan edi ("priz aylanmaydi" bug'i). Endi har doim bitta
      // reward weighted random orqali tanlanadi; agar win_chance bo'yicha "lose" chiqsa,
      // pul ayni darajada yechiladi, LEKIN foydalanuvchiga aylanish (animation_rewards)
      // va tanlangan (ko'rsatiladigan) reward baribir qaytariladi — faqat u inventarga
      // qo'shilmaydi va `won: false` deyiladi, shu bilan ruletka g'ildiragi haqiqatan
      // ham biror narsaga to'xtaydi.
      const winRoll = crypto.randomInt(0, 10000);
      const winChance = parseFloat(caseData.win_chance) * 100;
      const won = winRoll < winChance;

      selectedReward = selectReward(rewards);
      isRouletteLoss = !won;
    } else {
      selectedReward = selectReward(rewards);
    }

    const result = await transaction(async (conn) => {
      const balanceBefore = parseFloat(balance.stars_balance);
      const balanceAfter = balanceBefore - parseFloat(caseData.price);

      await conn.execute(
        `UPDATE balances SET stars_balance = ? WHERE user_id = ?`,
        [balanceAfter, userId]
      );

      let inventoryId = null;

      if (isRouletteLoss) {
        // Lose: pul yechildi, hech narsa berilmaydi, lekin animatsiya uchun reward
        // ma'lumoti baribir qaytariladi (frontendda "aylanish" to'xtaydigan reward sifatida).
        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, notes)
           VALUES (?, 'case_open', ?, ?, ?, 'roulette_loss', ?)`,
          [userId, -caseData.price, balanceBefore, balanceAfter, `Roulette lost: ${caseData.name}`]
        );
      } else if (selectedReward.reward_type === 'stars') {
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

      return { selectedReward, inventoryId, balanceAfter };
    });

    res.json({
      won: !isRouletteLoss,
      reward: prepareRewardForClient(result.selectedReward),
      inventory_id: result.inventoryId,
      new_balance: result.balanceAfter,
      animation_rewards: shuffleRewardsForAnimation(
        prepareRewardsForClient(rewards),
        prepareRewardForClient(result.selectedReward)
      ),
      message: isRouletteLoss ? 'Better luck next time!' : undefined,
    });
    console.log(`[openCase] SUCCESS: User ${userId} opened case ${id}, won=${!isRouletteLoss}, new balance: ${result.balanceAfter}`);
  } catch (err) {
    console.error(`[openCase] ERROR for user ${userId}, case ${id}:`, err);
    res.status(500).json({ error: 'Failed to open case: ' + err.message });
  }
}

// ── Daily free case ──────────────────────────────────────────────────────────
async function openDailyFreeCase(req, res, caseData) {
  const userId = req.user.id;

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

  const offsetHours = await getOffsetHours(getSetting);
  const { todayStartUtc, tomorrowStartUtc } = getDayWindow(new Date(), offsetHours);

  const existing = await queryOne(
    `SELECT id, claimed_at FROM daily_free_claims 
     WHERE user_id = ? AND case_id = ? AND claimed_at >= ? AND claimed_at < ?`,
    [userId, caseData.id, todayStartUtc.toISOString(), tomorrowStartUtc.toISOString()]
  );

  if (existing) {
    const msLeft = tomorrowStartUtc.getTime() - Date.now();
    const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
    const minutesLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));

    const timeStr = hoursLeft > 0
      ? `${hoursLeft}h ${minutesLeft}m`
      : minutesLeft > 0 ? `${minutesLeft}m` : 'Soon';

    return res.status(400).json({
      error: `⏰ Free case already opened today!\n\nNext available in: ${timeStr}`,
      next_at: tomorrowStartUtc.toISOString(),
      hours_left: hoursLeft,
      minutes_left: minutesLeft
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
      [userId, caseData.id, tomorrowStartUtc.toISOString()]
    );

    let inventoryId = null;
    if (selectedReward.reward_type === 'stars') {
      const bal = await conn.all(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const balData = Array.isArray(bal) ? bal[0] : bal;
      const currentBalance = parseFloat(balData?.stars_balance || 0);
      const starsWon = parseFloat(selectedReward.stars_amount);

      await conn.execute(
        `UPDATE balances SET stars_balance = stars_balance + ?, total_won = total_won + ? WHERE user_id = ?`,
        [starsWon, starsWon, userId]
      );
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
         VALUES (?, 'case_open', ?, ?, ?, ?)`,
        [userId, starsWon, currentBalance, currentBalance + starsWon, `Daily free case win: ${selectedReward.name}`]
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

    return { selectedReward, inventoryId };
  });

  res.json({
    won: true,
    reward: prepareRewardForClient(result.selectedReward),
    inventory_id: result.inventoryId,
    animation_rewards: shuffleRewardsForAnimation(
      prepareRewardsForClient(rewards),
      prepareRewardForClient(result.selectedReward)
    ),
  });
}

// ── Referral case (24h, GMT+5 reset) ────────────────────────────────────────
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

  const offsetHours = await getOffsetHours(getSetting);
  const { todayStartUtc, tomorrowStartUtc } = getDayWindow(new Date(), offsetHours);

  const existing = await queryOne(
    `SELECT id FROM referral_case_claims 
     WHERE user_id = ? AND case_id = ? AND claimed_at >= ? AND claimed_at < ?`,
    [userId, caseData.id, todayStartUtc.toISOString(), tomorrowStartUtc.toISOString()]
  );

  if (existing) {
    return res.status(400).json({
      error: 'Already claimed today. Come back after reset (00:00, GMT+5)!',
      next_at: tomorrowStartUtc.toISOString()
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
      [userId, caseData.id, tomorrowStartUtc.toISOString()]
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

    return { selectedReward, inventoryId };
  });

  res.json({
    won: true,
    reward: prepareRewardForClient(result.selectedReward),
    inventory_id: result.inventoryId,
    animation_rewards: shuffleRewardsForAnimation(
      prepareRewardsForClient(rewards),
      prepareRewardForClient(result.selectedReward)
    ),
  });
}

// ── Demo case: ko'rsatish uchun, inventarga qo'shilmaydi, sotilmaydi ────────
// Talab: "Case demo ochishham qo'shilsin ammo priz inventory ga qo'shilmaydi va sotilmaydi.
// Demo priz yutish shansi kattalashadi eng kam shanslilar sal kattaroq bo'ladi."
async function openDemoCase(req, res, caseData) {
  const userId = req.user.id;

  const rewards = await query(
    `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [caseData.id]
  );
  if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

  const boostFactor = parseFloat(await getSetting('demo_case_chance_boost', '1.6')) || 1.6;
  const selectedReward = selectRewardForDemo(rewards, boostFactor);

  // Faqat log uchun yoziladi — inventarga HECH NARSA qo'shilmaydi
  try {
    await query(
      `INSERT INTO demo_case_opens (user_id, case_id, reward_id) VALUES (?, ?, ?)`,
      [userId, caseData.id, selectedReward.id]
    );
  } catch (e) {
    console.error('demo_case_opens log error:', e.message);
  }

  res.json({
    won: true,
    demo: true,
    reward: prepareRewardForClient(selectedReward),
    inventory_id: null,
    animation_rewards: shuffleRewardsForAnimation(
      prepareRewardsForClient(rewards),
      prepareRewardForClient(selectedReward)
    ),
    message: '🎬 Demo mode — this reward was NOT added to your inventory.',
  });
}

// ── Promo case: kod orqali ochiladi, shartli, 24-soat reset ─────────────────
async function openPromoCase(req, res) {
  const userId = req.user.id;
  const { code } = req.params;

  try {
    const promo = await queryOne(
      `SELECT p.*, c.name as case_name, c.image_url as case_image, c.id as case_id
       FROM promo_codes p
       JOIN cases c ON c.id = p.case_id
       WHERE p.code = ? AND p.is_active = 1 AND c.is_active = 1`,
      [String(code || '').trim().toUpperCase()]
    );

    if (!promo) return res.status(404).json({ error: 'Invalid or inactive promo code' });

    if (promo.max_uses > 0 && promo.uses_count >= promo.max_uses) {
      return res.status(400).json({ error: 'This promo code has reached its usage limit' });
    }

    // Shart tekshirish (masalan: kamida N stars kiritgan bo'lishi kerak)
    if (promo.requirement_type === 'min_deposit') {
      const bal = await queryOne(`SELECT total_deposited FROM balances WHERE user_id = ?`, [userId]);
      const totalDeposited = parseFloat(bal?.total_deposited || 0);
      if (totalDeposited < parseFloat(promo.requirement_value)) {
        return res.status(400).json({
          error: `You need to have deposited at least ${promo.requirement_value} ⭐ to use this promo code`,
          required: promo.requirement_value,
          current: totalDeposited,
        });
      }
    } else if (promo.requirement_type === 'min_balance') {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const balance = parseFloat(bal?.stars_balance || 0);
      if (balance < parseFloat(promo.requirement_value)) {
        return res.status(400).json({
          error: `You need at least ${promo.requirement_value} ⭐ balance to use this promo code`,
          required: promo.requirement_value,
          current: balance,
        });
      }
    }

    const offsetHours = await getOffsetHours(getSetting);
    const { todayStartUtc, tomorrowStartUtc } = getDayWindow(new Date(), offsetHours);

    const existing = await queryOne(
      `SELECT id FROM promo_case_claims WHERE user_id = ? AND promo_id = ? AND claimed_at >= ? AND claimed_at < ?`,
      [userId, promo.id, todayStartUtc.toISOString(), tomorrowStartUtc.toISOString()]
    );
    if (existing) {
      return res.status(400).json({
        error: 'Already claimed today with this promo code. Come back after reset (00:00, GMT+5)!',
        next_at: tomorrowStartUtc.toISOString(),
      });
    }

    const rewards = await query(
      `SELECT * FROM case_rewards WHERE case_id = ? AND is_active = 1`, [promo.case_id]
    );
    if (!rewards.length) return res.status(400).json({ error: 'No rewards in this case' });

    const selectedReward = selectReward(rewards);

    const result = await transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO promo_case_claims (user_id, promo_id) VALUES (?, ?)`,
        [userId, promo.id]
      );
      await conn.execute(
        `UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = ?`,
        [promo.id]
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
           VALUES (?, 'case_open', ?, ?, ?, ?)`,
          [userId, starsWon, bal.stars_balance, parseFloat(bal.stars_balance) + starsWon, `Promo case win (${code})`]
        );
      } else {
        const invResult = await conn.execute(
          `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, ?, 'owned')`,
          [userId, selectedReward.id, promo.case_id]
        );
        inventoryId = ensureInventoryId(invResult);
        if (!inventoryId) throw new Error('Inventory insert failed');
        await conn.execute(
          `INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`,
          [inventoryId, userId, `Won from promo case (${code})`]
        );
      }

      await conn.execute(
        `INSERT INTO case_opens (user_id, case_id, reward_id, inventory_id, stars_spent) VALUES (?, ?, ?, ?, 0)`,
        [userId, promo.case_id, selectedReward.id, inventoryId]
      );

      return { selectedReward, inventoryId };
    });

    res.json({
      won: true,
      reward: prepareRewardForClient(result.selectedReward),
      inventory_id: result.inventoryId,
      animation_rewards: shuffleRewardsForAnimation(
        prepareRewardsForClient(rewards),
        prepareRewardForClient(result.selectedReward)
      ),
    });
  } catch (err) {
    console.error('openPromoCase error:', err);
    res.status(500).json({ error: 'Failed to open promo case: ' + err.message });
  }
}

// ── Promo code eligibility check (frontend "redeem code" oynasi uchun) ─────
async function checkPromoCode(req, res) {
  try {
    const userId = req.user.id;
    const { code } = req.params;

    const promo = await queryOne(
      `SELECT p.*, c.name as case_name, c.image_url as case_image
       FROM promo_codes p JOIN cases c ON c.id = p.case_id
       WHERE p.code = ? AND p.is_active = 1 AND c.is_active = 1`,
      [String(code || '').trim().toUpperCase()]
    );
    if (!promo) return res.status(404).json({ error: 'Invalid or inactive promo code' });

    const offsetHours = await getOffsetHours(getSetting);
    const { todayStartUtc, tomorrowStartUtc } = getDayWindow(new Date(), offsetHours);
    const claimed = await queryOne(
      `SELECT id FROM promo_case_claims WHERE user_id = ? AND promo_id = ? AND claimed_at >= ? AND claimed_at < ?`,
      [userId, promo.id, todayStartUtc.toISOString(), tomorrowStartUtc.toISOString()]
    );

    let eligible = !claimed && (promo.max_uses === 0 || promo.uses_count < promo.max_uses);
    let reason = null;

    if (promo.requirement_type === 'min_deposit') {
      const bal = await queryOne(`SELECT total_deposited FROM balances WHERE user_id = ?`, [userId]);
      if (parseFloat(bal?.total_deposited || 0) < parseFloat(promo.requirement_value)) {
        eligible = false;
        reason = `Requires at least ${promo.requirement_value} ⭐ total deposited`;
      }
    } else if (promo.requirement_type === 'min_balance') {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      if (parseFloat(bal?.stars_balance || 0) < parseFloat(promo.requirement_value)) {
        eligible = false;
        reason = `Requires at least ${promo.requirement_value} ⭐ balance`;
      }
    }

    res.json({
      eligible,
      claimed_today: !!claimed,
      reason,
      case_name: promo.case_name,
      case_image: normalizeMediaUrl(promo.case_image),
      requirement_type: promo.requirement_type,
      requirement_value: promo.requirement_value,
      next_claim: tomorrowStartUtc.toISOString(),
    });
  } catch (err) {
    console.error('checkPromoCode error:', err);
    res.status(500).json({ error: 'Failed to check promo code' });
  }
}

module.exports = {
  getCases, getCaseById, openCase,
  openPromoCase, checkPromoCode,
};
