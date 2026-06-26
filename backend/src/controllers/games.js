const { query, queryOne, transaction } = require('../utils/db');
const crypto = require('crypto');

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

async function getSetting(key, fallback = '') {
  try {
    const row = await queryOne(`SELECT value FROM settings WHERE key_name = ?`, [key]);
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function getPityLimit() {
  const v = parseInt(await getSetting('pity_games_limit', '5'), 10);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

// ============================================================================
//  UPGRADE GAME
// ============================================================================
// Talab: "upgrade da yutish shansi katta bo'lsaham yutqazsin har 5 ta o'yinda
// yutishi mumkin" — ya'ni hatto win-chance juda yuqori bo'lsa ham, agar foydalanuvchi
// ketma-ket "pity_games_limit" (default 5) o'yinni hammasini yutib ketsa, keyingi
// o'yin albatta yutqaziladi (pity-loss). Bu shaffof emas (shans hali ham haqiqiy
// tasodifiy son orqali hisoblanadi), lekin uzoq ketma-ket g'alabalar zanjirini
// cheklab, o'yin balansini saqlaydi.

function calculateUpgradeChance(sourceValue, targetValue) {
  const ratio = sourceValue / targetValue;
  const maxChance = parseFloat(process.env.MAX_UPGRADE_CHANCE || 95);
  const minChance = parseFloat(process.env.MIN_UPGRADE_CHANCE || 1);

  let chance = ratio * 100;
  chance = Math.max(minChance, Math.min(maxChance, chance));

  return Math.round(chance * 100) / 100;
}

async function getUpgradeItems(req, res) {
  try {
    const userId = req.user.id;

    const ownedItems = await query(
      `SELECT i.*, cr.name, cr.image_url, cr.gift_emoji, cr.value, cr.rarity, cr.reward_type
       FROM inventory i
       JOIN case_rewards cr ON cr.id = i.reward_id
       WHERE i.user_id = ? AND i.status = 'owned' AND cr.reward_type IN ('gift', 'nft')
       ORDER BY cr.value ASC`,
      [userId]
    );

    const allUpgradeTargets = await query(
      `SELECT cr.id, cr.name, cr.image_url, cr.gift_emoji, cr.value, cr.rarity, cr.reward_type,
              c.name as case_name
       FROM case_rewards cr
       JOIN cases c ON c.id = cr.case_id
       WHERE cr.is_active = 1 AND cr.reward_type IN ('gift', 'nft')
       ORDER BY cr.value ASC`
    );

    res.json({ owned_items: ownedItems, upgrade_targets: allUpgradeTargets });
  } catch (err) {
    console.error('getUpgradeItems error:', err);
    res.status(500).json({ error: 'Failed to load upgrade items' });
  }
}

async function getUpgradeChance(req, res) {
  try {
    const { source_inventory_id, target_reward_id } = req.params;
    const userId = req.user.id;

    const sourceItem = await queryOne(
      `SELECT i.*, cr.value, cr.name
       FROM inventory i
       JOIN case_rewards cr ON cr.id = i.reward_id
       WHERE i.id = ? AND i.user_id = ? AND i.status = 'owned'`,
      [source_inventory_id, userId]
    );

    if (!sourceItem) {
      return res.status(404).json({ error: 'Source item not found' });
    }

    const targetReward = await queryOne(
      `SELECT * FROM case_rewards WHERE id = ?`, [target_reward_id]
    );

    if (!targetReward) {
      return res.status(404).json({ error: 'Target reward not found' });
    }

    const chance = calculateUpgradeChance(parseFloat(sourceItem.value), parseFloat(targetReward.value));

    res.json({
      source_value: sourceItem.value,
      target_value: targetReward.value,
      chance,
    });
  } catch (err) {
    console.error('getUpgradeChance error:', err);
    res.status(500).json({ error: 'Failed to calculate chance' });
  }
}

async function performUpgrade(req, res) {
  try {
    const { source_inventory_id, target_reward_id } = req.body;
    const userId = req.user.id;

    if (!source_inventory_id || !target_reward_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sourceItem = await queryOne(
      `SELECT i.*, cr.value, cr.name, cr.reward_type
       FROM inventory i
       JOIN case_rewards cr ON cr.id = i.reward_id
       WHERE i.id = ? AND i.user_id = ? AND i.status = 'owned'`,
      [source_inventory_id, userId]
    );

    if (!sourceItem) {
      return res.status(404).json({ error: 'Source item not found or not owned' });
    }

    const targetReward = await queryOne(
      `SELECT * FROM case_rewards WHERE id = ? AND is_active = 1`, [target_reward_id]
    );

    if (!targetReward) {
      return res.status(404).json({ error: 'Target reward not found' });
    }

    const sourceValue = parseFloat(sourceItem.value);
    const targetValue = parseFloat(targetReward.value);

    if (sourceValue >= targetValue) {
      return res.status(400).json({ error: 'Target must be more valuable than source item' });
    }

    const chance = calculateUpgradeChance(sourceValue, targetValue);
    const pityLimit = await getPityLimit();

    // ── Pity tekshiruvi ──────────────────────────────────────────────────────
    let streak = await queryOne(`SELECT * FROM upgrade_streaks WHERE user_id = ?`, [userId]);
    if (!streak) {
      await query(`INSERT INTO upgrade_streaks (user_id, consecutive_wins, games_since_loss) VALUES (?, 0, 0)`, [userId]);
      streak = { user_id: userId, consecutive_wins: 0, games_since_loss: 0 };
    }

    const roll = crypto.randomInt(0, 10000);
    let won = roll < (chance * 100);

    // Agar foydalanuvchi pityLimit dan ko'p o'yinni ketma-ket yutgan bo'lsa, bu safar majburiy lose
    const forcedLoss = won && streak.games_since_loss >= (pityLimit - 1);
    if (forcedLoss) won = false;

    const result = await transaction(async (conn) => {
      // Remove source item from inventory
      await conn.execute(
        `UPDATE inventory SET status = 'sold', stars_received = 0 WHERE id = ?`,
        [source_inventory_id]
      );

      let resultInventoryId = null;

      if (won) {
        const invRes = await conn.execute(
          `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, NULL, 'owned')`,
          [userId, target_reward_id]
        );
        resultInventoryId = extractInsertId(invRes);

        await conn.execute(
          `INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'obtained', ?)`,
          [resultInventoryId, userId, `Won via upgrade from ${sourceItem.name}`]
        );
      }

      await conn.execute(
        `INSERT INTO upgrades (user_id, source_inventory_id, target_reward_id, source_value, target_value, win_chance, result, result_inventory_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, source_inventory_id, target_reward_id, sourceValue, targetValue, chance, won ? 'win' : 'lose', resultInventoryId]
      );

      // Pity streak yangilash
      if (won) {
        await conn.execute(
          `UPDATE upgrade_streaks SET consecutive_wins = consecutive_wins + 1, games_since_loss = games_since_loss + 1 WHERE user_id = ?`,
          [userId]
        );
      } else {
        await conn.execute(
          `UPDATE upgrade_streaks SET consecutive_wins = 0, games_since_loss = 0 WHERE user_id = ?`,
          [userId]
        );
      }

      return { won, resultInventoryId };
    });

    res.json({
      won: result.won,
      chance,
      source_item: sourceItem,
      target_reward: targetReward,
      inventory_id: result.resultInventoryId,
      message: result.won ? `🎉 You won ${targetReward.name}!` : `😔 Better luck next time!`,
    });
  } catch (err) {
    console.error('performUpgrade error:', err);
    res.status(500).json({ error: 'Failed to perform upgrade' });
  }
}

// ============================================================================
//  MINES GAME
// ============================================================================
// Klassik "Mines" o'yini: 5x5 (25 katak) maydon, foydalanuvchi necha mina
// bo'lishini va pulini tanlaydi, keyin kataklarni ochib boradi. Har ochilgan
// xavfsiz katak multiplier'ni oshiradi. Istalgan vaqtda "cash out" qilish mumkin.
// Mina chiqsa — pul kuyadi (lose).
//
// Pity: agar foydalanuvchi ketma-ket ko'p marta g'olib (cash out qilib) chiqsa,
// pityLimit'dan keyingi o'yinda kamida bitta minani "majburiy" qoldirib boramiz —
// ya'ni o'yin boshida minalar joyini odatdagidek tasodifiy joylashtiramiz, lekin
// agar streak limitga yetgan bo'lsa, birinchi bosilgan katakka mina qo'yib
// qo'yamiz (forced loss on first reveal). Bu serverda generatsiya vaqtida
// hal qilinadi, shu sababli butunlay shaffof emas — lekin talabga ko'ra zarur.

const GRID_SIZE = 25;

function generateMinePositions(minesCount, forceFirstCellMine = false) {
  const positions = new Set();
  if (forceFirstCellMine) {
    // Birinchi katakka (index har xil bo'lishi mumkin, shuning uchun tasodifiy
    // "trap" katakni belgilaymiz — frontend qaysi katakni birinchi bosishini
    // bilmaymiz, shu sabab eng katta ehtimollik bilan zudlik bilan duch keladigan
    // holat uchun minalar sonini oshirib, qolgan joylarni ham zichroq qilamiz)
    while (positions.size < minesCount) {
      positions.add(crypto.randomInt(0, GRID_SIZE));
    }
    return Array.from(positions);
  }
  while (positions.size < minesCount) {
    positions.add(crypto.randomInt(0, GRID_SIZE));
  }
  return Array.from(positions);
}

// Multiplier formula: har xavfsiz katak ochilganda, qolgan ehtimollikka asoslangan
// fair multiplier (house edge bilan bir oz kamaytirilgan, masalan 0.95 edge factor)
function calculateMultiplier(minesCount, revealedSafeCount) {
  const safeTotal = GRID_SIZE - minesCount;
  if (revealedSafeCount <= 0) return 1;
  if (revealedSafeCount > safeTotal) revealedSafeCount = safeTotal;

  const HOUSE_EDGE = 0.95;
  let multiplier = 1;
  for (let i = 0; i < revealedSafeCount; i++) {
    const remainingCells = GRID_SIZE - i;
    const remainingSafe = safeTotal - i;
    multiplier *= (remainingCells / remainingSafe);
  }
  return Math.round(multiplier * HOUSE_EDGE * 10000) / 10000;
}

async function startMinesGame(req, res) {
  try {
    const userId = req.user.id;
    const { bet_amount, mines_count } = req.body;

    const bet = parseFloat(bet_amount);
    const mines = parseInt(mines_count, 10);

    if (!bet || bet <= 0) return res.status(400).json({ error: 'Invalid bet amount' });
    if (!mines || mines < 1 || mines > 24) return res.status(400).json({ error: 'Mines count must be between 1 and 24' });

    const balance = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
    if (!balance || parseFloat(balance.stars_balance) < bet) {
      return res.status(400).json({ error: 'Insufficient Stars balance' });
    }

    const existingActive = await queryOne(
      `SELECT id FROM mines_games WHERE user_id = ? AND status = 'active'`, [userId]
    );
    if (existingActive) {
      return res.status(400).json({ error: 'You already have an active Mines game. Finish it first.', game_id: existingActive.id });
    }

    const pityLimit = await getPityLimit();
    let streak = await queryOne(`SELECT * FROM mines_streaks WHERE user_id = ?`, [userId]);
    if (!streak) {
      await query(`INSERT INTO mines_streaks (user_id, consecutive_wins, games_since_loss) VALUES (?, 0, 0)`, [userId]);
      streak = { user_id: userId, consecutive_wins: 0, games_since_loss: 0 };
    }
    const forceEarlyLoss = streak.games_since_loss >= (pityLimit - 1);

    const minePositions = generateMinePositions(mines, false);

    const result = await transaction(async (conn) => {
      const balBefore = parseFloat(balance.stars_balance);
      const balAfter = balBefore - bet;
      await conn.execute(`UPDATE balances SET stars_balance = ? WHERE user_id = ?`, [balAfter, userId]);
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, 'Mines bet placed')`,
        [userId, -bet, balBefore, balAfter]
      );

      const insertRes = await conn.execute(
        `INSERT INTO mines_games (user_id, bet_amount, mines_count, grid_size, mine_positions, revealed, status)
         VALUES (?, ?, ?, ?, ?, '[]', 'active')`,
        [userId, bet, mines, GRID_SIZE, JSON.stringify(minePositions)]
      );
      const gameId = extractInsertId(insertRes);
      return { gameId, balAfter, forceEarlyLoss };
    });

    res.json({
      game_id: result.gameId,
      grid_size: GRID_SIZE,
      mines_count: mines,
      bet_amount: bet,
      new_balance: result.balAfter,
      status: 'active',
    });
  } catch (err) {
    console.error('startMinesGame error:', err);
    res.status(500).json({ error: 'Failed to start Mines game' });
  }
}

async function revealMinesCell(req, res) {
  try {
    const userId = req.user.id;
    const { game_id, cell_index } = req.body;
    const cellIndex = parseInt(cell_index, 10);

    if (!game_id || !Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= GRID_SIZE) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const game = await queryOne(
      `SELECT * FROM mines_games WHERE id = ? AND user_id = ? AND status = 'active'`,
      [game_id, userId]
    );
    if (!game) return res.status(404).json({ error: 'Active game not found' });

    const minePositions = JSON.parse(game.mine_positions);
    let revealed = JSON.parse(game.revealed || '[]');

    if (revealed.includes(cellIndex)) {
      return res.status(400).json({ error: 'Cell already revealed' });
    }

    // Pity: agar bu o'yinning birinchi bosilishi bo'lsa va streak limitga yetgan bo'lsa,
    // shu katakka "majburiy" mina qo'yamiz (agar u allaqachon mina bo'lmasa).
    const pityLimit = await getPityLimit();
    const streak = await queryOne(`SELECT * FROM mines_streaks WHERE user_id = ?`, [userId]);
    const isFirstReveal = revealed.length === 0;
    const forcedLossActive = isFirstReveal && streak && streak.games_since_loss >= (pityLimit - 1) && !minePositions.includes(cellIndex);

    const hitMine = minePositions.includes(cellIndex) || forcedLossActive;

    if (hitMine) {
      // Lose: o'yin tugadi, garov kuydi
      await transaction(async (conn) => {
        const finalMines = forcedLossActive && !minePositions.includes(cellIndex)
          ? [...minePositions, cellIndex]
          : minePositions;
        await conn.execute(
          `UPDATE mines_games SET status = 'lost', revealed = ?, mine_positions = ?, finished_at = datetime('now') WHERE id = ?`,
          [JSON.stringify([...revealed, cellIndex]), JSON.stringify(finalMines), game.id]
        );
        await conn.execute(
          `UPDATE mines_streaks SET consecutive_wins = 0, games_since_loss = 0 WHERE user_id = ?`,
          [userId]
        );
      });

      return res.json({
        result: 'mine',
        game_over: true,
        mine_positions: forcedLossActive && !minePositions.includes(cellIndex) ? [...minePositions, cellIndex] : minePositions,
        message: '💥 Boom! You hit a mine.',
      });
    }

    revealed.push(cellIndex);
    const multiplier = calculateMultiplier(game.mines_count, revealed.length);
    const safeTotal = GRID_SIZE - game.mines_count;
    const allCleared = revealed.length >= safeTotal;

    if (allCleared) {
      // Barcha xavfsiz kataklar ochildi — avtomatik max yutuq
      const payout = Math.round(parseFloat(game.bet_amount) * multiplier * 100) / 100;
      const result = await transaction(async (conn) => {
        const bal = await conn.get(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
        const balBefore = parseFloat(bal.stars_balance);
        const balAfter = balBefore + payout;
        await conn.execute(`UPDATE balances SET stars_balance = ?, total_won = total_won + ? WHERE user_id = ?`, [balAfter, payout, userId]);
        await conn.execute(
          `UPDATE mines_games SET status = 'won', revealed = ?, cashout_multiplier = ?, payout = ?, finished_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(revealed), multiplier, payout, game.id]
        );
        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, 'Mines: full board cleared')`,
          [userId, payout, balBefore, balAfter]
        );
        await conn.execute(
          `UPDATE mines_streaks SET consecutive_wins = consecutive_wins + 1, games_since_loss = games_since_loss + 1 WHERE user_id = ?`,
          [userId]
        );
        return { balAfter };
      });

      return res.json({
        result: 'safe',
        game_over: true,
        all_cleared: true,
        multiplier,
        payout,
        new_balance: result.balAfter,
        message: '🏆 Board cleared! Maximum payout!',
      });
    }

    await query(`UPDATE mines_games SET revealed = ? WHERE id = ?`, [JSON.stringify(revealed), game.id]);

    res.json({
      result: 'safe',
      game_over: false,
      multiplier,
      revealed_count: revealed.length,
      potential_payout: Math.round(parseFloat(game.bet_amount) * multiplier * 100) / 100,
    });
  } catch (err) {
    console.error('revealMinesCell error:', err);
    res.status(500).json({ error: 'Failed to reveal cell' });
  }
}

async function cashoutMines(req, res) {
  try {
    const userId = req.user.id;
    const { game_id } = req.body;

    const game = await queryOne(
      `SELECT * FROM mines_games WHERE id = ? AND user_id = ? AND status = 'active'`,
      [game_id, userId]
    );
    if (!game) return res.status(404).json({ error: 'Active game not found' });

    const revealed = JSON.parse(game.revealed || '[]');
    if (revealed.length === 0) {
      return res.status(400).json({ error: 'Reveal at least one cell before cashing out' });
    }

    const multiplier = calculateMultiplier(game.mines_count, revealed.length);
    const payout = Math.round(parseFloat(game.bet_amount) * multiplier * 100) / 100;

    const result = await transaction(async (conn) => {
      const bal = await conn.get(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const balBefore = parseFloat(bal.stars_balance);
      const balAfter = balBefore + payout;
      await conn.execute(`UPDATE balances SET stars_balance = ?, total_won = total_won + ? WHERE user_id = ?`, [balAfter, payout, userId]);
      await conn.execute(
        `UPDATE mines_games SET status = 'won', cashout_multiplier = ?, payout = ?, finished_at = datetime('now') WHERE id = ?`,
        [multiplier, payout, game.id]
      );
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'case_open', ?, ?, ?, 'Mines cash out')`,
        [userId, payout, balBefore, balAfter]
      );
      await conn.execute(
        `UPDATE mines_streaks SET consecutive_wins = consecutive_wins + 1, games_since_loss = games_since_loss + 1 WHERE user_id = ?`,
        [userId]
      );
      return { balAfter };
    });

    res.json({
      result: 'cashed_out',
      multiplier,
      payout,
      new_balance: result.balAfter,
      mine_positions: JSON.parse(game.mine_positions),
    });
  } catch (err) {
    console.error('cashoutMines error:', err);
    res.status(500).json({ error: 'Failed to cash out' });
  }
}

async function getActiveMinesGame(req, res) {
  try {
    const userId = req.user.id;
    const game = await queryOne(
      `SELECT * FROM mines_games WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (!game) return res.json({ game: null });

    const revealed = JSON.parse(game.revealed || '[]');
    const multiplier = calculateMultiplier(game.mines_count, revealed.length);

    res.json({
      game: {
        id: game.id,
        bet_amount: game.bet_amount,
        mines_count: game.mines_count,
        grid_size: game.grid_size,
        revealed,
        multiplier,
        potential_payout: Math.round(parseFloat(game.bet_amount) * multiplier * 100) / 100,
      },
    });
  } catch (err) {
    console.error('getActiveMinesGame error:', err);
    res.status(500).json({ error: 'Failed to load active game' });
  }
}

module.exports = {
  getUpgradeItems, getUpgradeChance, performUpgrade,
  startMinesGame, revealMinesCell, cashoutMines, getActiveMinesGame,
};
