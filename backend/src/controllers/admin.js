const { query, queryOne, transaction } = require('../utils/db');
const { processImageInput } = require('../utils/imageDownloader');

// Dashboard stats
async function getDashboard(req, res) {
  try {
    const [
      totalUsers, totalDeposits, totalWithdrawals,
      totalCaseOpens, totalUpgrades, pendingWithdrawals,
      pendingDeposits, recentActivity,
    ] = await Promise.all([
      queryOne(`SELECT COUNT(*) as cnt FROM users`),
      queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = 'completed'`),
      queryOne(`SELECT COALESCE(SUM(cr.value), 0) as total FROM withdrawals w JOIN inventory i ON i.id = w.inventory_id JOIN case_rewards cr ON cr.id = i.reward_id WHERE w.status = 'approved'`),
      queryOne(`SELECT COUNT(*) as cnt FROM case_opens`),
      queryOne(`SELECT COUNT(*) as cnt FROM upgrades`),
      queryOne(`SELECT COUNT(*) as cnt FROM withdrawals WHERE status = 'pending'`),
      queryOne(`SELECT COUNT(*) as cnt FROM deposits WHERE status = 'pending'`),
      query(`SELECT u.username, u.first_name, co.created_at, c.name as case_name FROM case_opens co JOIN users u ON u.id = co.user_id JOIN cases c ON c.id = co.case_id ORDER BY co.created_at DESC LIMIT 10`),
    ]);

    res.json({
      total_users: totalUsers.cnt,
      total_deposits: totalDeposits.total,
      total_withdrawals: totalWithdrawals.total,
      total_case_opens: totalCaseOpens.cnt,
      total_upgrades: totalUpgrades.cnt,
      pending_withdrawals: pendingWithdrawals.cnt,
      pending_deposits: pendingDeposits.cnt,
      recent_activity: recentActivity,
    });
  } catch (err) {
    console.error('getDashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

// User management
async function getUsers(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];
    if (search) {
      whereClause = `WHERE u.username LIKE ? OR u.first_name LIKE ? OR u.id = ?`;
      params.push(`%${search}%`, `%${search}%`, parseInt(search) || 0);
    }
    const users = await query(
      `SELECT u.*, b.stars_balance, b.total_deposited FROM users u LEFT JOIN balances b ON b.user_id = u.id ${whereClause} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const total = await queryOne(`SELECT COUNT(*) as cnt FROM users u ${whereClause}`, params);
    res.json({ users, total: total.cnt, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users' });
  }
}

async function banUser(req, res) {
  try {
    const { id } = req.params;
    await query(`UPDATE users SET is_banned = 1 WHERE id = ?`, [id]);
    await logAdminAction(req.user.id, 'ban_user', 'user', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ban user' });
  }
}

async function unbanUser(req, res) {
  try {
    const { id } = req.params;
    await query(`UPDATE users SET is_banned = 0 WHERE id = ?`, [id]);
    await logAdminAction(req.user.id, 'unban_user', 'user', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unban user' });
  }
}

async function getUserProfile(req, res) {
  try {
    const { id } = req.params;
    const user = await queryOne(
      `SELECT u.*, b.stars_balance, b.total_deposited, b.total_withdrawn, b.total_won FROM users u LEFT JOIN balances b ON b.user_id = u.id WHERE u.id = ?`, [id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    const inventory = await query(
      `SELECT i.*, cr.name, cr.image_url, cr.value, cr.rarity, cr.reward_type FROM inventory i JOIN case_rewards cr ON cr.id = i.reward_id WHERE i.user_id = ? ORDER BY i.obtained_at DESC LIMIT 20`, [id]
    );
    const recentDeposits = await query(
      `SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`, [id]
    );
    res.json({ user, inventory, recent_deposits: recentDeposits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user profile' });
  }
}

// Case management
async function getCases(req, res) {
  try {
    const cases = await query(
      `SELECT c.*, COUNT(cr.id) as reward_count FROM cases c LEFT JOIN case_rewards cr ON cr.case_id = c.id GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC`
    );
    res.json({ cases });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load cases' });
  }
}

async function createCase(req, res) {
  try {
    const { name, description, image_url, price, case_type, referrals_required, task_type, task_value, task_min_referrals, win_chance, sort_order } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Name and price are required' });

    // Process image: download if URL
    let localImageUrl = null;
    if (image_url) {
      try {
        localImageUrl = await processImageInput(image_url, 'cases');
      } catch (imgErr) {
        console.error('Case image download failed:', imgErr.message);
        return res.status(400).json({ error: `Image processing failed: ${imgErr.message}` });
      }
    }

    const [result] = await query(
      `INSERT INTO cases (name, description, image_url, price, case_type, referrals_required, task_type, task_value, task_min_referrals, win_chance, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', localImageUrl || '', price, case_type || 'normal', referrals_required || 0, task_type || 'none', task_value || '', task_min_referrals || 0, win_chance || 50, sort_order || 0]
    );

    await logAdminAction(req.user.id, 'create_case', 'case', result.insertId, { name });
    res.json({ success: true, case_id: result.insertId });
  } catch (err) {
    console.error('createCase error:', err);
    res.status(500).json({ error: 'Failed to create case' });
  }
}

async function updateCase(req, res) {
  try {
    const { id } = req.params;
    const { name, description, image_url, price, case_type, is_active, referrals_required, task_type, task_value, task_min_referrals, win_chance, sort_order } = req.body;

    // Process image
    let localImageUrl = image_url || '';
    if (image_url && !image_url.startsWith('/uploads/')) {
      try {
        localImageUrl = await processImageInput(image_url, 'cases') || '';
      } catch (imgErr) {
        console.error('Case image update failed:', imgErr.message);
        return res.status(400).json({ error: `Image processing failed: ${imgErr.message}` });
      }
    }

    await query(
      `UPDATE cases SET name=?, description=?, image_url=?, price=?, case_type=?, is_active=?, referrals_required=?, task_type=?, task_value=?, task_min_referrals=?, win_chance=?, sort_order=? WHERE id=?`,
      [name, description, localImageUrl, price, case_type, is_active ? 1 : 0, referrals_required || 0, task_type || 'none', task_value || '', task_min_referrals || 0, win_chance || 50, sort_order || 0, id]
    );

    await logAdminAction(req.user.id, 'update_case', 'case', id, { name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update case' });
  }
}

async function deleteCase(req, res) {
  try {
    const { id } = req.params;
    await query(`UPDATE cases SET is_active = 0 WHERE id = ?`, [id]);
    await logAdminAction(req.user.id, 'delete_case', 'case', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete case' });
  }
}

// Reward management
async function getCaseRewards(req, res) {
  try {
    const { case_id } = req.params;
    const rewards = await query(`SELECT * FROM case_rewards WHERE case_id = ? ORDER BY rarity DESC, chance ASC`, [case_id]);
    res.json({ rewards });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load rewards' });
  }
}

async function createReward(req, res) {
  try {
    const { case_id, reward_type, name, image_url, gift_emoji, stars_amount, value, rarity, chance } = req.body;
    if (!case_id || !reward_type || !name || !chance) return res.status(400).json({ error: 'Missing required fields' });

    // Determine upload subfolder based on reward type
    const imgType = reward_type === 'nft' ? 'nfts' : 'gifts';
    let localImageUrl = null;
    if (image_url) {
      try {
        localImageUrl = await processImageInput(image_url, imgType);
      } catch (imgErr) {
        console.error('Reward image download failed:', imgErr.message);
        return res.status(400).json({ error: `Image processing failed: ${imgErr.message}` });
      }
    }

    const [result] = await query(
      `INSERT INTO case_rewards (case_id, reward_type, name, image_url, gift_emoji, stars_amount, value, rarity, chance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [case_id, reward_type, name, localImageUrl || '', gift_emoji || '', stars_amount || 0, value || 0, rarity || 'common', chance]
    );

    await logAdminAction(req.user.id, 'create_reward', 'reward', result.insertId, { case_id, name });
    res.json({ success: true, reward_id: result.insertId });
  } catch (err) {
    console.error('createReward error:', err);
    res.status(500).json({ error: 'Failed to create reward' });
  }
}

async function updateReward(req, res) {
  try {
    const { id } = req.params;
    const { reward_type, name, image_url, gift_emoji, stars_amount, value, rarity, chance, is_active } = req.body;

    const imgType = reward_type === 'nft' ? 'nfts' : 'gifts';
    let localImageUrl = image_url || '';
    if (image_url && !image_url.startsWith('/uploads/')) {
      try {
        localImageUrl = await processImageInput(image_url, imgType) || '';
      } catch (imgErr) {
        return res.status(400).json({ error: `Image processing failed: ${imgErr.message}` });
      }
    }

    await query(
      `UPDATE case_rewards SET reward_type=?, name=?, image_url=?, gift_emoji=?, stars_amount=?, value=?, rarity=?, chance=?, is_active=? WHERE id=?`,
      [reward_type, name, localImageUrl, gift_emoji || '', stars_amount || 0, value || 0, rarity || 'common', chance, is_active ? 1 : 0, id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update reward' });
  }
}

async function deleteReward(req, res) {
  try {
    const { id } = req.params;
    await query(`UPDATE case_rewards SET is_active = 0 WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reward' });
  }
}

// Withdrawal management
async function getWithdrawals(req, res) {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const withdrawals = await query(
      `SELECT w.*, u.username, u.first_name, cr.name as item_name, cr.value, cr.reward_type, cr.image_url, cr.gift_emoji FROM withdrawals w JOIN users u ON u.id = w.user_id JOIN inventory i ON i.id = w.inventory_id JOIN case_rewards cr ON cr.id = i.reward_id WHERE w.status = ? ORDER BY w.requested_at DESC LIMIT ? OFFSET ?`,
      [status, parseInt(limit), offset]
    );
    const total = await queryOne(`SELECT COUNT(*) as cnt FROM withdrawals WHERE status = ?`, [status]);
    res.json({ withdrawals, total: total.cnt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load withdrawals' });
  }
}

async function approveWithdrawal(req, res) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE withdrawals SET status = 'approved', admin_id = ?, admin_notes = ?, processed_at = NOW() WHERE id = ? AND status = 'pending'`,
        [req.user.id, notes || '', id]
      );
      const withdrawal = await queryOne(`SELECT inventory_id FROM withdrawals WHERE id = ?`, [id]);
      await conn.execute(`UPDATE inventory SET status = 'withdrawn' WHERE id = ?`, [withdrawal.inventory_id]);
      await conn.execute(
        `INSERT INTO inventory_history (inventory_id, user_id, action, notes) SELECT ?, user_id, 'withdrawn', 'Withdrawal approved by admin' FROM withdrawals WHERE id = ?`,
        [withdrawal.inventory_id, id]
      );
    });
    const { notifyUserWithdrawalApproved } = require('../services/bot');
    const withdrawal = await queryOne(`SELECT w.*, u.id as uid FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.id = ?`, [id]);
    await notifyUserWithdrawalApproved(withdrawal.uid, withdrawal);
    await logAdminAction(req.user.id, 'approve_withdrawal', 'withdrawal', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
}

async function rejectWithdrawal(req, res) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE withdrawals SET status = 'rejected', admin_id = ?, admin_notes = ?, processed_at = NOW() WHERE id = ? AND status = 'pending'`,
        [req.user.id, notes || '', id]
      );
      const withdrawal = await queryOne(`SELECT inventory_id FROM withdrawals WHERE id = ?`, [id]);
      await conn.execute(`UPDATE inventory SET status = 'owned' WHERE id = ?`, [withdrawal.inventory_id]);
    });
    const { notifyUserWithdrawalRejected } = require('../services/bot');
    const withdrawal = await queryOne(`SELECT w.*, u.id as uid FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.id = ?`, [id]);
    await notifyUserWithdrawalRejected(withdrawal.uid, withdrawal);
    await logAdminAction(req.user.id, 'reject_withdrawal', 'withdrawal', id, { notes });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
}

// Deposit management
async function getDeposits(req, res) {
  try {
    const { status = 'pending' } = req.query;
    const deposits = await query(
      `SELECT d.*, u.username, u.first_name FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.status = ? ORDER BY d.created_at DESC LIMIT 50`,
      [status]
    );
    res.json({ deposits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load deposits' });
  }
}

async function approveDeposit(req, res) {
  try {
    const { id } = req.params;
    const { custom_stars } = req.body;
    const deposit = await queryOne(`SELECT * FROM deposits WHERE id = ? AND status = 'pending'`, [id]);
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    const starsToCredit = custom_stars && parseFloat(custom_stars) > 0 ? parseFloat(custom_stars) : parseFloat(deposit.stars_credited);
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE deposits SET status = 'completed', admin_id = ?, processed_at = NOW(), stars_credited = ? WHERE id = ?`,
        [req.user.id, starsToCredit, id]
      );
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [deposit.user_id]);
      const balBefore = parseFloat(bal?.stars_balance || 0);
      await conn.execute(`UPDATE balances SET stars_balance = stars_balance + ?, total_deposited = total_deposited + ? WHERE user_id = ?`, [starsToCredit, starsToCredit, deposit.user_id]);
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'deposit', ?, ?, ?, 'TON deposit approved')`,
        [deposit.user_id, starsToCredit, balBefore, balBefore + starsToCredit]
      );
    });
    const { notifyUserDepositApproved } = require('../services/bot');
    await notifyUserDepositApproved(deposit.user_id, { ...deposit, stars_credited: starsToCredit });
    await logAdminAction(req.user.id, 'approve_deposit', 'deposit', id, { stars_credited: starsToCredit });
    res.json({ success: true, stars_credited: starsToCredit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve deposit' });
  }
}

async function rejectDeposit(req, res) {
  try {
    const { id } = req.params;
    await query(`UPDATE deposits SET status = 'rejected', admin_id = ?, processed_at = NOW() WHERE id = ?`, [req.user.id, id]);
    await logAdminAction(req.user.id, 'reject_deposit', 'deposit', id, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject deposit' });
  }
}

// Broadcast - FIXED: proper retry + progress tracking
async function sendBroadcast(req, res) {
  try {
    const { message_text, image_url, button_text, button_url } = req.body;
    if (!message_text) return res.status(400).json({ error: 'Message is required' });

    const [result] = await query(
      `INSERT INTO broadcasts (admin_id, message_text, image_url, button_text, button_url, status) VALUES (?, ?, ?, ?, ?, 'sending')`,
      [req.user.id, message_text, image_url || '', button_text || '', button_url || '']
    );
    const broadcastId = result.insertId;

    const { sendBroadcastToAll } = require('../services/bot');
    sendBroadcastToAll(broadcastId, { message_text, image_url, button_text, button_url }).catch(console.error);

    res.json({ success: true, broadcast_id: broadcastId, message: 'Broadcast started' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
}

async function getBroadcastStatus(req, res) {
  try {
    const { id } = req.params;
    const broadcast = await queryOne(`SELECT * FROM broadcasts WHERE id = ?`, [id]);
    if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });
    res.json({ broadcast });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get broadcast status' });
  }
}

async function getBroadcasts(req, res) {
  try {
    const broadcasts = await query(
      `SELECT b.*, u.username as admin_username FROM broadcasts b JOIN users u ON u.id = b.admin_id ORDER BY b.created_at DESC LIMIT 50`
    );
    res.json({ broadcasts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load broadcasts' });
  }
}

// Settings
async function getSettings(req, res) {
  try {
    const settings = await query(`SELECT * FROM settings`);
    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.key_name] = s.value; });
    res.json({ settings: settingsMap });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
}

async function updateSettings(req, res) {
  try {
    const updates = req.body;
    console.log('[updateSettings] Received updates:', updates);
    
    for (const [key, value] of Object.entries(updates)) {
      const stringValue = String(value || '');
      console.log(`[updateSettings] Setting ${key} = ${stringValue}`);
      
      await query(
        `INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?`,
        [key, stringValue, stringValue]
      );
    }
    
    await logAdminAction(req.user.id, 'update_settings', 'settings', null, updates);
    console.log('[updateSettings] Success');
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (err) {
    console.error('[updateSettings] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
}

// Logs
async function getLogs(req, res) {
  try {
    const { type = 'admin', page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let rows;
    if (type === 'admin') {
      rows = await query(`SELECT al.*, u.username, u.first_name FROM admin_logs al JOIN users u ON u.id = al.admin_id ORDER BY al.created_at DESC LIMIT ? OFFSET ?`, [parseInt(limit), offset]);
    } else if (type === 'case_opens') {
      rows = await query(`SELECT co.*, u.username, u.first_name, c.name as case_name, cr.name as reward_name FROM case_opens co JOIN users u ON u.id = co.user_id JOIN cases c ON c.id = co.case_id JOIN case_rewards cr ON cr.id = co.reward_id ORDER BY co.created_at DESC LIMIT ? OFFSET ?`, [parseInt(limit), offset]);
    } else if (type === 'upgrades') {
      rows = await query(`SELECT upg.*, u.username, u.first_name FROM upgrades upg JOIN users u ON u.id = upg.user_id ORDER BY upg.created_at DESC LIMIT ? OFFSET ?`, [parseInt(limit), offset]);
    }
    res.json({ logs: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load logs' });
  }
}

async function adjustBalance(req, res) {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid amount is required' });
    await transaction(async (conn) => {
      const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [id]);
      const balBefore = parseFloat(bal?.stars_balance || 0);
      const balAfter = Math.max(0, balBefore + parseFloat(amount));
      await conn.execute(`UPDATE balances SET stars_balance = ? WHERE user_id = ?`, [balAfter, id]);
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'deposit', ?, ?, ?, ?)`,
        [id, parseFloat(amount), balBefore, balAfter, reason || 'Admin balance adjustment']
      );
    });
    await logAdminAction(req.user.id, 'adjust_balance', 'user', id, { amount, reason });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to adjust balance' });
  }
}

async function logAdminAction(adminId, action, targetType, targetId, details) {
  try {
    await query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`,
      [adminId, action, targetType, targetId, JSON.stringify(details)]
    );
  } catch (e) {
    console.error('Failed to log admin action:', e);
  }
}

module.exports = {
  getDashboard, getUsers, banUser, unbanUser, getUserProfile, adjustBalance,
  getCases, createCase, updateCase, deleteCase,
  getCaseRewards, createReward, updateReward, deleteReward,
  getWithdrawals, approveWithdrawal, rejectWithdrawal,
  getDeposits, approveDeposit, rejectDeposit,
  sendBroadcast, getBroadcastStatus, getBroadcasts,
  getSettings, updateSettings, getLogs,
};
