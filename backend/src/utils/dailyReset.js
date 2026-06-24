// Kunlik reset hisoblovchi yordamchi.
// Talab: referral case, promo case, daily free case — har kuni 00:00 (GMT+5) da yangilanadi.
// Bu serverning o'zi qaysi vaqt zonasida ishlashidan qat'i nazar to'g'ri ishlaydi,
// chunki biz hisoblashni har doim UTC asosida qilamiz va GMT+5 surilishini qo'shamiz.

const DEFAULT_GMT_OFFSET_HOURS = 5;

/**
 * Berilgan vaqt uchun "GMT+offset kunining boshlanishi" (00:00) ni UTC Date sifatida qaytaradi.
 * Masalan offset=5 bo'lsa, GMT+5 da 00:00 bo'lganda bu UTC 19:00 (oldingi kun) ga to'g'ri keladi.
 */
function getDayWindow(now = new Date(), offsetHours = DEFAULT_GMT_OFFSET_HOURS) {
  const offsetMs = offsetHours * 60 * 60 * 1000;
  // Mahalliy (GMT+offset) vaqtga o'tkazamiz, kun boshini olamiz, keyin yana UTC ga qaytaramiz
  const shifted = new Date(now.getTime() + offsetMs);
  const localMidnightShifted = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0, 0, 0, 0
  ));
  const todayStartUtc = new Date(localMidnightShifted.getTime() - offsetMs);
  const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  return { todayStartUtc, tomorrowStartUtc };
}

async function getOffsetHours(getSetting) {
  try {
    const val = await getSetting('daily_reset_gmt_offset', String(DEFAULT_GMT_OFFSET_HOURS));
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : DEFAULT_GMT_OFFSET_HOURS;
  } catch {
    return DEFAULT_GMT_OFFSET_HOURS;
  }
}

module.exports = { getDayWindow, getOffsetHours, DEFAULT_GMT_OFFSET_HOURS };
