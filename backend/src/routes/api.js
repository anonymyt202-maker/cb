const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const casesCtrl = require('../controllers/cases');
const inventoryCtrl = require('../controllers/inventory');
const gamesCtrl = require('../controllers/games');
const referralsCtrl = require('../controllers/referrals');
const depositsCtrl = require('../controllers/deposits');
const adminCtrl = require('../controllers/admin');
const { query, queryOne } = require('../utils/db');
const { createStarsInvoiceLink } = require('../services/bot');
const { processImageInput } = require('../utils/imageDownloader');

const router = express.Router();

// ============ MULTER SETUP ============
const UPLOAD_DIRS = {
  gifts: path.join(__dirname, '../../uploads/gifts'),
  nfts: path.join(__dirname, '../../uploads/nfts'),
  cases: path.join(__dirname, '../../uploads/cases'),
};
Object.values(UPLOAD_DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.query.type || req.body.type || 'gifts';
    const dir = UPLOAD_DIRS[type] || UPLOAD_DIRS.gifts;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}_${hash}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (!allowed.test(file.originalname)) {
      return cb(new Error('Only image files allowed'));
    }
    cb(null, true);
  },
});

// ============ RATE LIMITERS ============
const openCaseLimiter = rateLimit({ windowMs: 60000, max: 30, message: { error: 'Too many case opens.' } });
const upgradeLimiter = rateLimit({ windowMs: 60000, max: 20, message: { error: 'Too many upgrades.' } });
const depositLimiter = rateLimit({ windowMs: 60000, max: 5, message: { error: 'Too many deposit requests.' } });

// ============ USER ROUTES ============
router.get('/user/me', authMiddleware, async (req, res) => res.json({ user: req.user }));

router.get('/user/balance', authMiddleware, async (req, res) => {
  try {
    const bal = await queryOne(`SELECT stars_balance FROM balances WHERE user_id = ?`, [req.user.id]);
    res.json({ balance: parseFloat(bal?.stars_balance || 0) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load balance' });
  }
});

// Cases
router.get('/cases', authMiddleware, casesCtrl.getCases);
router.get('/cases/:id', authMiddleware, casesCtrl.getCaseById);
router.post('/cases/:id/open', authMiddleware, openCaseLimiter, casesCtrl.openCase);

router.get('/cases/:id/eligibility', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const caseData = await queryOne(`SELECT * FROM cases WHERE id = ? AND is_active = 1`, [id]);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    if (caseData.case_type === 'daily_free') {
      const claim = await queryOne(
        `SELECT id FROM daily_free_claims WHERE user_id = ? AND case_id = ? AND claimed_at >= ?`,
        [userId, id, todayStart.toISOString()]
      );
      let taskCompleted = true, taskMessage = '';
      if (caseData.task_type === 'referrals') {
        const refCount = await queryOne(`SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?`, [userId]);
        const count = refCount?.cnt || 0;
        taskCompleted = count >= caseData.task_min_referrals;
        taskMessage = `${count}/${caseData.task_min_referrals} referrals`;
      } else if (caseData.task_type === 'channel_sub') {
        taskMessage = `Subscribe to ${caseData.task_value}`;
      }
      return res.json({ eligible: !claim && taskCompleted, claimed_today: !!claim, next_claim: tomorrowStart.toISOString(), task_completed: taskCompleted, task_message: taskMessage, task_type: caseData.task_type, task_value: caseData.task_value });
    }

    if (caseData.case_type === 'referral') {
      const refCount = await queryOne(`SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?`, [userId]);
      const count = refCount?.cnt || 0;
      const claim = await queryOne(`SELECT id FROM referral_case_claims WHERE user_id = ? AND case_id = ? AND claimed_at >= ?`, [userId, id, todayStart.toISOString()]);
      return res.json({ eligible: count >= caseData.referrals_required && !claim, claimed_today: !!claim, current_referrals: count, required_referrals: caseData.referrals_required, next_claim: tomorrowStart.toISOString() });
    }

    res.json({ eligible: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// Inventory
router.get('/inventory', authMiddleware, inventoryCtrl.getInventory);
router.post('/inventory/:inventory_id/sell', authMiddleware, inventoryCtrl.sellItem);
router.post('/inventory/:inventory_id/withdraw', authMiddleware, inventoryCtrl.requestWithdrawal);

// Games
router.get('/games/upgrade/items', authMiddleware, gamesCtrl.getUpgradeItems);
router.get('/games/upgrade/chance/:source_inventory_id/:target_reward_id', authMiddleware, gamesCtrl.getUpgradeChance);
router.post('/games/upgrade', authMiddleware, upgradeLimiter, gamesCtrl.performUpgrade);

// Referrals
router.get('/referrals', authMiddleware, referralsCtrl.getReferralInfo);

// Deposits
router.post('/deposit/ton', authMiddleware, depositLimiter, depositsCtrl.submitTonDeposit);
router.get('/deposit/ton-rate', async (req, res) => {
  try {
    const setting = await queryOne(`SELECT value FROM settings WHERE key_name = 'ton_to_stars_rate'`);
    res.json({ rate: parseFloat(setting?.value || 100) });
  } catch (err) {
    res.json({ rate: 100 });
  }
});
router.get('/deposit/history', authMiddleware, depositsCtrl.getDepositHistory);

router.post('/deposit/stars/invoice', authMiddleware, depositLimiter, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
    const link = await createStarsInvoiceLink(parseInt(amount));
    if (link) res.json({ success: true, invoice_url: link });
    else res.status(500).json({ error: 'Failed to create invoice' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Transactions
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const transactions = await query(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// ============ ADMIN: IMAGE UPLOAD (multipart) ============
// POST /api/admin/upload?type=gifts|nfts|cases
router.post('/admin/upload', adminMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  const type = req.query.type || 'gifts';
  const localPath = `/uploads/${type}/${req.file.filename}`;
  res.json({ success: true, url: localPath });
});

// POST /api/admin/upload-url - download from URL and save locally
router.post('/admin/upload-url', adminMiddleware, async (req, res) => {
  try {
    const { url, type = 'gifts' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const localPath = await processImageInput(url, type);
    if (!localPath) return res.status(400).json({ error: 'Failed to process image URL' });
    res.json({ success: true, url: localPath });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to download image' });
  }
});

// ============ ADMIN ROUTES ============
router.get('/admin/dashboard', adminMiddleware, adminCtrl.getDashboard);
router.get('/admin/users', adminMiddleware, adminCtrl.getUsers);
router.get('/admin/users/:id', adminMiddleware, adminCtrl.getUserProfile);
router.post('/admin/users/:id/ban', adminMiddleware, adminCtrl.banUser);
router.post('/admin/users/:id/unban', adminMiddleware, adminCtrl.unbanUser);
router.post('/admin/users/:id/balance', adminMiddleware, adminCtrl.adjustBalance);

router.get('/admin/cases', adminMiddleware, adminCtrl.getCases);
router.post('/admin/cases', adminMiddleware, adminCtrl.createCase);
router.put('/admin/cases/:id', adminMiddleware, adminCtrl.updateCase);
router.delete('/admin/cases/:id', adminMiddleware, adminCtrl.deleteCase);

router.get('/admin/cases/:case_id/rewards', adminMiddleware, adminCtrl.getCaseRewards);
router.post('/admin/rewards', adminMiddleware, adminCtrl.createReward);
router.put('/admin/rewards/:id', adminMiddleware, adminCtrl.updateReward);
router.delete('/admin/rewards/:id', adminMiddleware, adminCtrl.deleteReward);

router.get('/admin/withdrawals', adminMiddleware, adminCtrl.getWithdrawals);
router.post('/admin/withdrawals/:id/approve', adminMiddleware, adminCtrl.approveWithdrawal);
router.post('/admin/withdrawals/:id/reject', adminMiddleware, adminCtrl.rejectWithdrawal);

router.get('/admin/deposits', adminMiddleware, adminCtrl.getDeposits);
router.post('/admin/deposits/:id/approve', adminMiddleware, adminCtrl.approveDeposit);
router.post('/admin/deposits/:id/reject', adminMiddleware, adminCtrl.rejectDeposit);

router.post('/admin/broadcast', adminMiddleware, adminCtrl.sendBroadcast);
router.get('/admin/broadcast', adminMiddleware, adminCtrl.getBroadcasts);
router.get('/admin/broadcast/:id/status', adminMiddleware, adminCtrl.getBroadcastStatus);

router.get('/admin/settings', adminMiddleware, adminCtrl.getSettings);
router.put('/admin/settings', adminMiddleware, adminCtrl.updateSettings);
router.get('/admin/logs', adminMiddleware, adminCtrl.getLogs);

module.exports = router;
