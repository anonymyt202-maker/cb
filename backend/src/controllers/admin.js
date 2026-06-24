const { query, queryOne, transaction } = require('../utils/db');
const { processImageInput } = require('../utils/imageDownloader');
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
    console.log(`[approveDeposit] Approving deposit ${id} with custom_stars: ${custom_stars}`);
    
    const deposit = await queryOne(`SELECT * FROM deposits WHERE id = ? AND status = 'pending'`, [id]);
    if (!deposit) {
      console.error(`[approveDeposit] Deposit ${id} not found`);
      return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const starsToCredit = custom_stars && parseFloat(custom_stars) > 0 ? parseFloat(custom_stars) : parseFloat(deposit.stars_credited);
    console.log(`[approveDeposit] Crediting ${starsToCredit} stars to user ${deposit.user_id}`);
    
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE deposits SET status = 'completed', admin_id = ?, processed_at = datetime('now'), stars_credited = ? WHERE id = ?`,
        [req.user.id, starsToCredit, id]
      );
      
      const bal = await conn.all(`SELECT stars_balance FROM balances WHERE user_id = ?`, [deposit.user_id]);
      const balData = Array.isArray(bal) ? bal[0] : bal;
      const balBefore = parseFloat(balData?.stars_balance || 0);
      
      console.log(`[approveDeposit] User ${deposit.user_id} balance before: ${balBefore}, adding ${starsToCredit}`);
      
      await conn.execute(
        `UPDATE balances SET stars_balance = stars_balance + ?, total_deposited = total_deposited + ? WHERE user_id = ?`, 
        [starsToCredit, starsToCredit, deposit.user_id]
      );
      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'deposit', ?, ?, ?, 'TON deposit approved')`,
        [deposit.user_id, starsToCredit, balBefore, balBefore + starsToCredit]
      );
    });
    const { notifyUserDepositApproved } = require('../services/bot');
    await notifyUserDepositApproved(deposit.user_id, { ...deposit, stars_credited: starsToCredit });
    await logAdminAction(req.user.id, 'approve_deposit', 'deposit', id, { stars_credited: starsToCredit });
    console.log(`[approveDeposit] SUCCESS: Deposit ${id} approved, ${starsToCredit} stars credited to user ${deposit.user_id}`);
    res.json({ success: true, stars_credited: starsToCredit });
  } catch (err) {
    console.error(`[approveDeposit] ERROR:`, err);
    res.status(500).json({ error: 'Failed to approve deposit: ' + err.message });
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
    settings.forEach(s => {
      // Vaqtinchalik/ichki kalitlarni (referral captcha holati va h.k.) admin UI'siga chiqarmaymiz
      if (s.key_name.startsWith('pending_ref_') || s.key_name.startsWith('captcha_pending_')) return;
      settingsMap[s.key_name] = s.value;
    });
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
      
      // SQLite: use INSERT OR REPLACE (since key_name is UNIQUE)
      await query(
        `INSERT OR REPLACE INTO settings (key_name, value, updated_at) VALUES (?, ?, datetime('now'))`,
        [key, stringValue]
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

// ============================================================================
//  NFT LIBRARY (global) — Admin panelda "NFT" bo'limi
//  Talab: "admin panelda NFT degan joy qo'sh o'sha yerda nft lar qo'sha olaman
//  va case ochishda shu nftlarni tanlab yarataman"
//  Bu yerda NFT shablonlari saqlanadi; case reward yaratishda admin shu
//  ro'yxatdan birini tanlab, case_rewards jadvaliga nusxa sifatida qo'shadi
//  (createReward / createRewardFromNft orqali).
// ============================================================================
async function getNftLibrary(req, res) {
  try {
    const nfts = await query(`SELECT * FROM nft_templates ORDER BY created_at DESC`);
    res.json({ nfts });
  } catch (err) {
    console.error('getNftLibrary error:', err);
    res.status(500).json({ error: 'Failed to load NFT library' });
  }
}

async function createNft(req, res) {
  try {
    const { name, image_url, value, rarity } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    let localImageUrl = null;
    if (image_url) {
      try {
        localImageUrl = await processImageInput(image_url, 'nfts');
      } catch (imgErr) {
        return res.status(400).json({ error: `Image processing failed: ${imgErr.message}` });
      }
    }

    const [result] = await query(
      `INSERT INTO nft_templates (name, image_url, value, rarity) VALUES (?, ?, ?, ?)`,
      [name, localImageUrl || '', value || 0, rarity || 'common']
    );

    await logAdminAction(req.user.id, 'create_nft', 'nft_template', result.insertId, { name });
    res.json({ success: true, nft_id: result.insertId });
  } catch (err) {
    console.error('createNft error:', err);
    res.status(500).json({ error: 'Failed to create NFT' });
  }
}

async function updateNft(req, res) {
  try {
    const { id } = req.params;
    const { name, image_url, value, rarity, is_active } = req.body;

    let localImageUrl = image_url || '';
    if (image_url && !image_url.startsWith('/uploads/')) {
      try {
        localImageUrl = await processImageInput(image_url, 'nfts') || '';
      } catch (imgErr) {
        return res.status(400).json({ error: `Image processing failed: ${imgErr.message}` });
      }
    }

    await query(
      `UPDATE nft_templates SET name=?, image_url=?, value=?, rarity=?, is_active=? WHERE id=?`,
      [name, localImageUrl, value || 0, rarity || 'common', is_active ? 1 : 0, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update NFT' });
  }
}

async function deleteNft(req, res) {
  try {
    const { id } = req.params;
    await query(`UPDATE nft_templates SET is_active = 0 WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete NFT' });
  }
}

// Global NFT kutubxonasidan tanlab, to'g'ridan-to'g'ri case_rewards ga qo'shish.
// Talab: "case ochishda shu nftlarni tanlab yarataman" — ya'ni NFT bo'limidagi
// NFT'ni tanlab, biror case ichiga reward sifatida joylash.
async function attachNftToCase(req, res) {
  try {
    const { case_id, nft_id, chance } = req.body;
    if (!case_id || !nft_id || !chance) return res.status(400).json({ error: 'case_id, nft_id, chance required' });

    const nft = await queryOne(`SELECT * FROM nft_templates WHERE id = ? AND is_active = 1`, [nft_id]);
    if (!nft) return res.status(404).json({ error: 'NFT not found' });

    const [result] = await query(
      `INSERT INTO case_rewards (case_id, reward_type, name, image_url, value, rarity, chance) VALUES (?, 'nft', ?, ?, ?, ?, ?)`,
      [case_id, nft.name, nft.image_url, nft.value, nft.rarity, chance]
    );

    await logAdminAction(req.user.id, 'attach_nft_to_case', 'case', case_id, { nft_id, reward_id: result.insertId });
    res.json({ success: true, reward_id: result.insertId });
  } catch (err) {
    console.error('attachNftToCase error:', err);
    res.status(500).json({ error: 'Failed to attach NFT to case' });
  }
}

// ============================================================================
//  PROMO CODES — Admin promo kod yaratadi (shart bilan, masalan min 10 stars)
// ============================================================================
async function getPromoCodes(req, res) {
  try {
    const promos = await query(
      `SELECT p.*, c.name as case_name FROM promo_codes p JOIN cases c ON c.id = p.case_id ORDER BY p.created_at DESC`
    );
    res.json({ promo_codes: promos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load promo codes' });
  }
}

async function createPromoCode(req, res) {
  try {
    const { code, case_id, requirement_type, requirement_value, max_uses } = req.body;
    if (!case_id) return res.status(400).json({ error: 'case_id is required' });

    const finalCode = (code && code.trim()
      ? code.trim().toUpperCase()
      : crypto.randomBytes(4).toString('hex').toUpperCase());

    const [result] = await query(
      `INSERT INTO promo_codes (code, case_id, requirement_type, requirement_value, max_uses) VALUES (?, ?, ?, ?, ?)`,
      [finalCode, case_id, requirement_type || 'none', requirement_value || 0, max_uses || 0]
    );

    await logAdminAction(req.user.id, 'create_promo', 'promo_code', result.insertId, { code: finalCode, case_id });
    res.json({ success: true, promo_id: result.insertId, code: finalCode });
  } catch (err) {
    console.error('createPromoCode error:', err);
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'This promo code already exists' });
    }
    res.status(500).json({ error: 'Failed to create promo code' });
  }
}

async function updatePromoCode(req, res) {
  try {
    const { id } = req.params;
    const { requirement_type, requirement_value, max_uses, is_active } = req.body;
    await query(
      `UPDATE promo_codes SET requirement_type=?, requirement_value=?, max_uses=?, is_active=? WHERE id=?`,
      [requirement_type || 'none', requirement_value || 0, max_uses || 0, is_active ? 1 : 0, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update promo code' });
  }
}

async function deletePromoCode(req, res) {
  try {
    const { id } = req.params;
    await query(`UPDATE promo_codes SET is_active = 0 WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete promo code' });
  }
}

// ============================================================================
//  BROADCAST STARS — Admin tomonidan barchaga stars tarqatish (sabab bilan)
//  Talab: "admin tomonidan barchaga stars tarqatishniham qo'sh misol 5 va
//  hammaga shu qo'shiladi va pastda reason ham yoziladi"
// ============================================================================
async function broadcastStars(req, res) {
  try {
    const { amount, reason } = req.body;
    const starsAmount = parseFloat(amount);
    if (!starsAmount || starsAmount <= 0) {
      return res.status(400).json({ error: 'Valid stars amount is required' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const users = await query(`SELECT id FROM users WHERE is_banned = 0`);

    let credited = 0;
    for (const u of users) {
      try {
        await transaction(async (conn) => {
          const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [u.id]);
          const balBefore = parseFloat(bal?.stars_balance || 0);
          const balAfter = balBefore + starsAmount;
          await conn.execute(`UPDATE balances SET stars_balance = ? WHERE user_id = ?`, [balAfter, u.id]);
          await conn.execute(
            `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, notes) VALUES (?, 'deposit', ?, ?, ?, ?)`,
            [u.id, starsAmount, balBefore, balAfter, `Admin gift: ${reason}`]
          );
        });
        credited++;
      } catch (e) {
        console.error(`broadcastStars failed for user ${u.id}:`, e.message);
      }
    }

    await logAdminAction(req.user.id, 'broadcast_stars', 'all_users', null, { amount: starsAmount, reason, credited });

    // Telegram orqali xabar yuborish (best-effort, broadcast'dan keyin)
    try {
      const { getBot } = require('../services/bot');
      const bot = getBot();
      const message = `🎁 <b>Siz ${starsAmount} ⭐ Stars oldingiz!</b>\n\n📝 Sabab: ${reason}`;
      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.id, message, { parse_mode: 'HTML' });
          await new Promise(r => setTimeout(r, 40));
        } catch (e) {}
      }
    } catch (e) {
      console.error('broadcastStars notify error:', e.message);
    }

    res.json({ success: true, credited, total_users: users.length, amount: starsAmount, reason });
  } catch (err) {
    console.error('broadcastStars error:', err);
    res.status(500).json({ error: 'Failed to broadcast stars' });
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
  getNftLibrary, createNft, updateNft, deleteNft, attachNftToCase,
  getPromoCodes, createPromoCode, updatePromoCode, deletePromoCode,
  broadcastStars,
};
