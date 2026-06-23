const axios = require('axios');
const { getBot } = require('../services/bot');

function normalizeSource(source) {
  return String(source || '').trim();
}

function isTelegramLink(source) {
  return /^https?:\/\/(?:t\.me|telegram\.me)\//i.test(source);
}

function isDirectUrl(source) {
  return /^https?:\/\//i.test(source) || /^data:/i.test(source);
}

function isProbablyFileId(source) {
  const value = normalizeSource(source);
  if (!value || isDirectUrl(value)) return false;
  if (/[\s<>]/.test(value)) return false;
  if (/^[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u.test(value)) return false;
  return value.length >= 20;
}

function guessKind(url) {
  const value = normalizeSource(url).toLowerCase();
  if (!value) return 'image';
  if (value.endsWith('.webm') || value.endsWith('.mp4') || value.endsWith('.mov')) return 'video';
  if (value.endsWith('.gif')) return 'gif';
  if (value.endsWith('.mp3') || value.endsWith('.wav') || value.endsWith('.ogg')) return 'audio';
  return 'image';
}

function extractPreviewUrl(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?:[:a-zA-Z0-9_-]*)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?:[:a-zA-Z0-9_-]*)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?:[:a-zA-Z0-9_-]*)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?:[:a-zA-Z0-9_-]*)?["'][^>]*>/i,
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function resolveTelegramFileUrl(fileId) {
  const token = process.env.BOT_TOKEN;
  if (!token) return null;

  const bot = getBot();
  const file = await bot.telegram.getFile(fileId);
  if (!file?.file_path) return null;
  return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
}

async function resolveTelegramPagePreview(source) {
  const response = await axios.get(source, {
    timeout: 15000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    validateStatus: () => true,
  });

  const html = String(response.data || '');
  const previewUrl = extractPreviewUrl(html);
  if (previewUrl) {
    try {
      return new URL(previewUrl, source).href;
    } catch {
      return previewUrl;
    }
  }
  return source;
}

async function resolveMediaSource(source) {
  const value = normalizeSource(source);
  if (!value) return { url: null, kind: 'image', sourceType: 'empty' };

  if (isTelegramLink(value)) {
    const url = await resolveTelegramPagePreview(value);
    return { url, kind: guessKind(url), sourceType: 'telegram_link' };
  }

  if (isDirectUrl(value)) {
    return { url: value, kind: guessKind(value), sourceType: 'url' };
  }

  if (isProbablyFileId(value)) {
    const url = await resolveTelegramFileUrl(value);
    return { url, kind: guessKind(url), sourceType: 'telegram_file_id' };
  }

  return { url: null, kind: 'image', sourceType: 'text' };
}

module.exports = {
  resolveMediaSource,
  guessKind,
  isTelegramLink,
  isDirectUrl,
  isProbablyFileId,
};
