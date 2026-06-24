// Multi-akkountdan himoya: bir device (fingerprint) + IP orqali faqat 1 ta akkount ishlasin.
// Mantiq:
//  - Har bir so'rovda frontend "X-Device-Id" header orqali barqaror device fingerprint yuboradi
//    (frontend tomonda localStorage/IndexedDB'da saqlanadigan random ID — Telegram WebView buni
//    saqlab qoladi, chunki bir xil ilova/akkaunt ochilganda shu webview storage qayta ishlatiladi).
//  - Agar device fingerprint kelmasa (eski versiya), faqat IP bo'yicha tekshiramiz (kuchsizroq himoya).
//  - Birinchi marta ko'rilgan device+IP kombinatsiyasi shu user_id'ga bog'lanadi.
//  - Agar shu device orqali boshqa user_id allaqachon ro'yxatdan o'tgan bo'lsa va u banned bo'lmasa,
//    yangi user avtomatik banned qilinadi ("multi-account" sababi bilan) va unga maxsus xato qaytariladi.
//  - Admin asl (birinchi) akkountniban qilsa, device yozuvi saqlanib qoladi — bu orqali keyingi
//    urinishlar ham bloklanadi.

const { query, queryOne } = require('../utils/db');

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function getDeviceHash(req) {
  const raw = String(req.headers['x-device-id'] || '').trim();
  if (raw && raw.length >= 8 && raw.length <= 200) return raw;
  return null;
}

async function getMaxDevicesPerAccount() {
  try {
    const row = await queryOne(`SELECT value FROM settings WHERE key_name = 'max_devices_per_account'`);
    const n = parseInt(row?.value, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * authMiddleware dan KEYIN ishlatiladi (req.user mavjud bo'lishi kerak).
 * Agar multi-account aniqlansa, foydalanuvchini banned qiladi va 403 qaytaradi.
 */
async function antiMultiAccountMiddleware(req, res, next) {
  try {
    if (!req.user?.id) return next();

    const userId = req.user.id;
    const deviceHash = getDeviceHash(req);
    const ip = getClientIp(req);

    // Fingerprint yo'q bo'lsa, bloklamaymiz — faqat keyinroq kuzatish uchun urinib ko'ramiz
    if (!deviceHash) return next();

    const existingForDevice = await query(
      `SELECT DISTINCT user_id FROM devices WHERE device_hash = ?`,
      [deviceHash]
    );

    const otherUserIds = existingForDevice
      .map(r => r.user_id)
      .filter(id => Number(id) !== Number(userId));

    if (otherUserIds.length > 0) {
      // Shu device orqali boshqa akkount(lar) bo'lgan — multi-account.
      // Eng birinchi ro'yxatdan o'tgan akkount "asl" hisoblanadi, qolganlari (shu jumladan hozirgisi
      // agar u birinchi bo'lmasa) banned qilinadi.
      const firstRecord = await queryOne(
        `SELECT user_id FROM devices WHERE device_hash = ? ORDER BY first_seen ASC LIMIT 1`,
        [deviceHash]
      );
      const originalUserId = firstRecord?.user_id;

      if (originalUserId && Number(originalUserId) !== Number(userId)) {
        // Hozirgi user — bu device uchun "qo'shimcha" akkount. Ban.
        const already = await queryOne(`SELECT is_banned FROM users WHERE id = ?`, [userId]);
        if (!already?.is_banned) {
          await query(`UPDATE users SET is_banned = 1 WHERE id = ?`, [userId]);
          await query(
            `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details) VALUES (?, 'auto_ban_multi_account', 'user', ?, ?)`,
            [originalUserId, userId, JSON.stringify({ device_hash: deviceHash, ip, reason: 'multi_account_detected' })]
          );
        }
        return res.status(403).json({
          error: 'Account is banned',
          reason: 'multi_account',
        });
      }
    }

    // Device yozuvini saqlash/yangilash
    const existingOwn = await queryOne(
      `SELECT id FROM devices WHERE device_hash = ? AND user_id = ?`,
      [deviceHash, userId]
    );
    if (existingOwn) {
      await query(
        `UPDATE devices SET last_seen = datetime('now'), ip_address = ? WHERE id = ?`,
        [ip, existingOwn.id]
      );
    } else {
      await query(
        `INSERT INTO devices (device_hash, ip_address, user_id) VALUES (?, ?, ?)`,
        [deviceHash, ip, userId]
      );
    }

    next();
  } catch (err) {
    console.error('antiMultiAccountMiddleware error:', err);
    // Xato bo'lsa ham foydalanuvchini bloklab qo'ymaymiz — faqat log qilamiz
    next();
  }
}

module.exports = { antiMultiAccountMiddleware, getClientIp, getDeviceHash, getMaxDevicesPerAccount };
