const { query, queryOne, transaction } = require('../utils/db');

async function getReferralInfo(req, res) {
  try {
    const userId = req.user.id;
    const user = req.user;

    const settings = await queryOne(
      `SELECT value FROM settings WHERE key_name = 'referral_reward_stars'`
    );
    const rewardStars = parseFloat(settings?.value || 10);

    const referrals = await query(
      `SELECT r.created_at, u.username, u.first_name, u.last_name
       FROM referrals r
       JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const totalEarned = await queryOne(
      `SELECT SUM(reward_given) as total FROM referrals WHERE referrer_id = ?`, [userId]
    );

    const botUsername = (await queryOne(`SELECT value FROM settings WHERE key_name = 'bot_username'`))?.value || 'TmuxCaseBot';
    const referralLink = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;

    res.json({
      referral_link: referralLink,
      referral_code: user.referral_code,
      referrals_count: referrals.length,
      total_earned: totalEarned?.total || 0,
      reward_per_referral: rewardStars,
      referrals,
    });
  } catch (err) {
    console.error('getReferralInfo error:', err);
    res.status(500).json({ error: 'Failed to load referral info' });
  }
}

module.exports = { getReferralInfo };
