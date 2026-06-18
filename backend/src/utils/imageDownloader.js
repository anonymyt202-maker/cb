const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIRS = {
  gifts: path.join(__dirname, '../../uploads/gifts'),
  nfts: path.join(__dirname, '../../uploads/nfts'),
  cases: path.join(__dirname, '../../uploads/cases'),
};

// Ensure upload dirs exist
Object.values(UPLOAD_DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Extracts actual image URL from a Telegram page (og:image)
 */
async function extractTelegramImageUrl(telegramUrl) {
  try {
    const response = await axios.get(telegramUrl, {
      timeout: 15000,
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      validateStatus: () => true,
    });
    const html = String(response.data || '');

    const patterns = [
      /<meta[^>]+property=["']og:image(?::[a-zA-Z0-9_-]*)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::[a-zA-Z0-9_-]*)?["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image(?::[a-zA-Z0-9_-]*)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::[a-zA-Z0-9_-]*)?["'][^>]*>/i,
    ];

    for (const re of patterns) {
      const match = html.match(re);
      if (match?.[1]) {
        try {
          return new URL(match[1], telegramUrl).href;
        } catch {
          return match[1];
        }
      }
    }
  } catch (err) {
    console.error('extractTelegramImageUrl error:', err.message);
  }
  return null;
}

/**
 * Downloads an image from URL and saves to local uploads dir.
 * Returns the local path like /uploads/gifts/abc123.jpg
 */
async function downloadImageFromUrl(url, type = 'gifts') {
  const dir = UPLOAD_DIRS[type] || UPLOAD_DIRS.gifts;

  // If it's a Telegram link, extract real image URL first
  let imageUrl = url;
  if (/^https?:\/\/(?:t\.me|telegram\.me)\//i.test(url)) {
    const extracted = await extractTelegramImageUrl(url);
    if (!extracted) {
      throw new Error(`Cannot extract image from Telegram URL: ${url}`);
    }
    imageUrl = extracted;
  }

  // Download the image
  const response = await axios.get(imageUrl, {
    timeout: 20000,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'image/*,*/*',
    },
    validateStatus: s => s < 400,
  });

  const contentType = response.headers['content-type'] || '';
  let ext = '.jpg';
  if (contentType.includes('png')) ext = '.png';
  else if (contentType.includes('gif')) ext = '.gif';
  else if (contentType.includes('webp')) ext = '.webp';
  else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
  else {
    // Try from URL
    const urlExt = imageUrl.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i)?.[1];
    if (urlExt) ext = '.' + urlExt.toLowerCase();
  }

  const hash = crypto.randomBytes(8).toString('hex');
  const filename = `${Date.now()}_${hash}${ext}`;
  const fullPath = path.join(dir, filename);

  fs.writeFileSync(fullPath, Buffer.from(response.data));

  return `/uploads/${type}/${filename}`;
}

/**
 * Handles image input from admin:
 * - If it's already a local path (/uploads/...) → return as-is
 * - If it's a URL or Telegram link → download and return local path
 * - If it's empty/null → return null
 */
async function processImageInput(value, type = 'gifts') {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Already a local path
  if (trimmed.startsWith('/uploads/')) return trimmed;

  // It's a URL → download it
  if (/^https?:\/\//i.test(trimmed)) {
    return await downloadImageFromUrl(trimmed, type);
  }

  // Unknown → return null (don't store raw text)
  return null;
}

module.exports = {
  processImageInput,
  downloadImageFromUrl,
  UPLOAD_DIRS,
};
