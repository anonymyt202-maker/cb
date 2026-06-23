const { query, queryOne, transaction } = require('../utils/db');
const crypto = require('crypto');

// Calculate upgrade chance based on value difference
function calculateUpgradeChance(sourceValue, targetValue) {
  const ratio = sourceValue / targetValue;
  const maxChance = parseFloat(process.env.MAX_UPGRADE_CHANCE || 95);
  const minChance = parseFloat(process.env.MIN_UPGRADE_CHANCE || 1);
  
  // Chance = (source/target) * 100, clamped
  let chance = ratio * 100;
  chance = Math.max(minChance, Math.min(maxChance, chance));
  
  return Math.round(chance * 100) / 100;
}

// Get available gifts for upgrade
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

// Calculate chance preview
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

// Perform upgrade
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
    const roll = crypto.randomInt(0, 10000);
    const won = roll < (chance * 100);

    const result = await transaction(async (conn) => {
      // Remove source item from inventory
      await conn.execute(
        `UPDATE inventory SET status = 'sold', stars_received = 0 WHERE id = ?`,
        [source_inventory_id]
      );

      let resultInventoryId = null;

      if (won) {
        const [invRes] = await conn.execute(
          `INSERT INTO inventory (user_id, reward_id, case_id, status) VALUES (?, ?, NULL, 'owned')`,
          [userId, target_reward_id]
        );
        resultInventoryId = invRes.insertId;

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

module.exports = { getUpgradeItems, getUpgradeChance, performUpgrade };
