const { query, queryOne, transaction } = require('../utils/db');

async function getInventory(req, res) {
  try {
    const userId = req.user.id;
    const { type } = req.query; // 'gifts', 'nfts', or undefined for all

    let typeFilter = '';
    const params = [userId];
    
    if (type === 'gifts') {
      typeFilter = `AND cr.reward_type = 'gift'`;
    } else if (type === 'nfts') {
      typeFilter = `AND cr.reward_type = 'nft'`;
    }

    const items = await query(
      `SELECT i.*, cr.name, cr.image_url, cr.gift_emoji, cr.value, cr.rarity, cr.reward_type, cr.stars_amount,
              c.name as case_name
       FROM inventory i
       JOIN case_rewards cr ON cr.id = i.reward_id
       LEFT JOIN cases c ON c.id = i.case_id
       WHERE i.user_id = ? AND i.status = 'owned' ${typeFilter}
       ORDER BY i.obtained_at DESC`,
      params
    );

    res.json({ items });
  } catch (err) {
    console.error('getInventory error:', err);
    res.status(500).json({ error: 'Failed to load inventory' });
  }
}

async function sellItem(req, res) {
  try {
    const userId = req.user.id;
    const { inventory_id } = req.params;

    const item = await queryOne(
      `SELECT i.*, cr.value, cr.name, cr.reward_type
       FROM inventory i
       JOIN case_rewards cr ON cr.id = i.reward_id
       WHERE i.id = ? AND i.user_id = ? AND i.status = 'owned'`,
      [inventory_id, userId]
    );

    if (!item) {
      return res.status(404).json({ error: 'Item not found or already sold' });
    }

    if (item.reward_type === 'stars') {
      return res.status(400).json({ error: 'Cannot sell Stars rewards' });
    }

    const sellValue = parseFloat(item.value);

    await transaction(async (conn) => {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [userId]);
      const balBefore = parseFloat(bal.stars_balance);
      const balAfter = balBefore + sellValue;

      await conn.execute(
        `UPDATE inventory SET status = 'sold', sold_at = NOW(), stars_received = ? WHERE id = ?`,
        [sellValue, inventory_id]
      );

      await conn.execute(
        `UPDATE balances SET stars_balance = ? WHERE user_id = ?`,
        [balAfter, userId]
      );

      await conn.execute(
        `INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'sold', ?)`,
        [inventory_id, userId, `Sold for ${sellValue} Stars`]
      );

      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
         VALUES (?, 'sell', ?, ?, ?, ?)`,
        [userId, sellValue, balBefore, balAfter, `Sold: ${item.name}`]
      );
    });

    res.json({ success: true, stars_received: sellValue, message: `Sold for ${sellValue} ⭐` });
  } catch (err) {
    console.error('sellItem error:', err);
    res.status(500).json({ error: 'Failed to sell item' });
  }
}

async function requestWithdrawal(req, res) {
  try {
    const userId = req.user.id;
    const { inventory_id } = req.params;

    const item = await queryOne(
      `SELECT i.*, cr.value, cr.name, cr.reward_type, cr.image_url, cr.gift_emoji
       FROM inventory i
       JOIN case_rewards cr ON cr.id = i.reward_id
       WHERE i.id = ? AND i.user_id = ? AND i.status = 'owned'`,
      [inventory_id, userId]
    );

    if (!item) {
      return res.status(404).json({ error: 'Item not found or not available for withdrawal' });
    }

    if (item.reward_type === 'stars') {
      return res.status(400).json({ error: 'Stars rewards cannot be withdrawn this way' });
    }

    // Talab: gift/NFT yechib olish uchun foydalanuvchi kamida N (default 10) Stars
    // depozit qilgan bo'lishi kerak. Bu nakrutka/bot hisoblarini cheklash uchun.
    const minDepositSetting = await queryOne(
      `SELECT value FROM settings WHERE key_name = 'min_withdrawal_stars_deposited'`
    );
    const minDeposit = parseFloat(minDepositSetting?.value ?? 10);
    if (minDeposit > 0) {
      const bal = await queryOne(`SELECT total_deposited FROM balances WHERE user_id = ?`, [userId]);
      const totalDeposited = parseFloat(bal?.total_deposited || 0);
      if (totalDeposited < minDeposit) {
        return res.status(400).json({
          error: `To withdraw gifts/NFTs you must deposit at least ${minDeposit} ⭐ first.`,
          required_deposit: minDeposit,
          current_deposit: totalDeposited,
        });
      }
    }

    // Check for pending withdrawal
    const pending = await queryOne(
      `SELECT id FROM withdrawals WHERE inventory_id = ? AND status = 'pending'`,
      [inventory_id]
    );
    if (pending) {
      return res.status(400).json({ error: 'Withdrawal already pending for this item' });
    }

    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE inventory SET status = 'pending_withdrawal' WHERE id = ?`,
        [inventory_id]
      );

      const wResult = await conn.execute(
        `INSERT INTO withdrawals (user_id, inventory_id, status) VALUES (?, ?, 'pending')`,
        [userId, inventory_id]
      );
      const withdrawalId = extractInsertId(wResult);

      await conn.execute(
        `INSERT INTO inventory_history (inventory_id, user_id, action, notes) VALUES (?, ?, 'withdrawn', 'Withdrawal requested')`,
        [inventory_id, userId]
      );

      // Notify admins via bot
      const { notifyAdminWithdrawal } = require('../services/bot');
      await notifyAdminWithdrawal(withdrawalId, req.user, item);
    });

    res.json({ success: true, message: 'Withdrawal request submitted. Admin will process it soon.' });
  } catch (err) {
    console.error('requestWithdrawal error:', err);
    res.status(500).json({ error: 'Failed to request withdrawal' });
  }
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

module.exports = { getInventory, sellItem, requestWithdrawal };
