const { query, queryOne, transaction } = require('../utils/db');

// Submit TON deposit
async function submitTonDeposit(req, res) {
  try {
    const userId = req.user.id;
    const { tx_hash, ton_amount } = req.body;

    if (!tx_hash || !ton_amount) {
      return res.status(400).json({ error: 'Transaction hash and amount are required' });
    }

    // Check for duplicate tx hash
    const existing = await queryOne(
      `SELECT id FROM deposits WHERE ton_tx_hash = ?`, [tx_hash]
    );
    if (existing) {
      return res.status(400).json({ error: 'This transaction has already been submitted' });
    }

    const tonRate = parseFloat((await queryOne(
      `SELECT value FROM settings WHERE key_name = 'ton_to_stars_rate'`
    ))?.value || 100);

    const starsAmount = parseFloat(ton_amount) * tonRate;

    const [result] = await query(
      `INSERT INTO deposits (user_id, method, amount, ton_tx_hash, ton_amount, stars_credited, status)
       VALUES (?, 'ton', ?, ?, ?, ?, 'pending')`,
      [userId, starsAmount, tx_hash, ton_amount, starsAmount]
    );

    // Notify admins
    const { notifyAdminDeposit } = require('../services/bot');
    await notifyAdminDeposit(result.insertId || result, req.user, { ton_amount, tx_hash, stars_amount: starsAmount });

    res.json({
      success: true,
      deposit_id: result.insertId || result,
      message: 'Deposit submitted for review. Stars will be credited after admin approval.',
    });
  } catch (err) {
    console.error('submitTonDeposit error:', err);
    res.status(500).json({ error: 'Failed to submit deposit' });
  }
}

// Get deposit history
async function getDepositHistory(req, res) {
  try {
    const userId = req.user.id;
    const deposits = await query(
      `SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ deposits });
  } catch (err) {
    console.error('getDepositHistory error:', err);
    res.status(500).json({ error: 'Failed to load deposit history' });
  }
}

// Handle Telegram Stars payment (webhook)
async function handleStarsPayment(req, res) {
  try {
    const { pre_checkout_query_id, successful_payment, user_id } = req.body;
    
    if (successful_payment) {
      const { telegram_payment_charge_id, total_amount, invoice_payload } = successful_payment;
      const starsAmount = total_amount; // Stars are in whole units

      await transaction(async (conn) => {
        const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [user_id]);
        const balBefore = parseFloat(bal?.stars_balance || 0);

        const [dep] = await conn.execute(
          `INSERT INTO deposits (user_id, method, amount, stars_credited, telegram_payment_charge_id, status)
           VALUES (?, 'stars', ?, ?, ?, 'completed')`,
          [user_id, starsAmount, starsAmount, telegram_payment_charge_id]
        );

        await conn.execute(
          `UPDATE balances SET stars_balance = stars_balance + ?, total_deposited = total_deposited + ? WHERE user_id = ?`,
          [starsAmount, starsAmount, user_id]
        );

        await conn.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes)
           VALUES (?, 'deposit', ?, ?, ?, 'Telegram Stars deposit')`,
          [user_id, starsAmount, balBefore, balBefore + starsAmount]
        );
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('handleStarsPayment error:', err);
    res.status(500).json({ error: 'Payment processing failed' });
  }
}

module.exports = { submitTonDeposit, getDepositHistory, handleStarsPayment };
