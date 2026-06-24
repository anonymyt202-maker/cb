require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

// ============================================================
//                    CONFIGURATION
// ============================================================
const BOT_TOKEN    = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const ADMIN_IDS    = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

// TmuxCaseBot Mini App'iga havola (asosiy case-opening ilovasi). Bu battle
// bot — TmuxCase platformasining bir qismi sifatida ishlaydi, shu sababli
// /start javobida foydalanuvchiga asosiy ilovani ochish imkonini ham beradi.
const TMUXCASE_WEBAPP_URL = process.env.TMUXCASE_WEBAPP_URL || process.env.WEBAPP_URL || 'https://your-domain.com';

if (!BOT_TOKEN || !BOT_USERNAME) {
  console.error('❌ .env faylida BOT_TOKEN va BOT_USERNAME bo\'lishi kerak!');
  process.exit(1);
}

if (ADMIN_IDS.length === 0) {
  console.warn('⚠️  .env faylida ADMIN_IDS belgilanmagan! Hech kim /admin panelga kira olmaydi.');
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

const bot = new Telegraf(BOT_TOKEN);

// Faqat ADMIN_IDS dagi foydalanuvchilar admin_* va rch_* tugmalaridan foydalana oladi
bot.use(async (ctx, next) => {
  const data = ctx.callbackQuery && ctx.callbackQuery.data;
  if (data && (data.startsWith('admin_') || data.startsWith('rch_'))) {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCbQuery('🚫 Sizda ruxsat yo\'q.', { show_alert: true });
    }
  }
  return next();
});

// ============================================================
//                      JSON DATABASE
// ============================================================
const USERS_FILE    = './users.json';
const BATTLES_FILE  = './battles.json';
const SETTINGS_FILE = './settings.json';

function loadJSON(file, defaultVal) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2));
      return defaultVal;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[DB] ${file} xato:`, e.message);
    return defaultVal;
  }
}

function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  catch (e) { console.error(`[DB] save xato:`, e.message); }
}

let users    = loadJSON(USERS_FILE,    {});
let battles  = loadJSON(BATTLES_FILE,  {});
let settings = loadJSON(SETTINGS_FILE, { requiredChannels: [] });

const saveUsers    = () => saveJSON(USERS_FILE,    users);
const saveBattles  = () => saveJSON(BATTLES_FILE,  battles);
const saveSettings = () => saveJSON(SETTINGS_FILE, settings);

// ============================================================
//                    USER HELPERS
// ============================================================
function getUser(ctx) {
  const id    = String(ctx.from.id);
  const uname = ctx.from.username || null;
  if (!users[id]) {
    users[id] = {
      id: ctx.from.id, username: uname,
      wins: 0, loses: 0, votes: 0, banned: false,
      createdBattles: 0, joinedBattles: 0
    };
    saveUsers();
  }
  if (uname && users[id].username !== uname) {
    users[id].username = uname;
    saveUsers();
  }
  return users[id];
}

function findUserByQuery(query) {
  const q = query.replace('@', '').toLowerCase().trim();
  if (users[q]) return users[q];
  return Object.values(users).find(u => u.username && u.username.toLowerCase() === q) || null;
}

// ============================================================
//                   BATTLE HELPERS
// ============================================================
function generateId() {
  return Math.random().toString(36).substr(2, 8) + Date.now().toString(36);
}

function getVotesForParticipant(battle, username) {
  return Object.values(battle.votes).filter(v => v.toLowerCase() === username.toLowerCase()).length;
}

function getBattlesByOwner(ownerId) {
  return Object.values(battles).filter(b => b.owner === ownerId);
}

// ============================================================
//                  SUBSCRIPTION CHECK
// ============================================================
async function isMemberOf(userId, channel) {
  try {
    const m = await bot.telegram.getChatMember(channel, userId);
    return !['left', 'kicked'].includes(m.status);
  } catch (e) {
    return true; // bot kanalda emas, skip
  }
}

async function checkRequiredChannels(userId) {
  if (!settings.requiredChannels || settings.requiredChannels.length === 0) return true;
  for (const ch of settings.requiredChannels) {
    if (!await isMemberOf(userId, ch)) return false;
  }
  return true;
}

async function checkBattleChannel(userId, battleChannel) {
  return await isMemberOf(userId, battleChannel);
}

// ============================================================
//                    POST BUILDING
// ============================================================
function buildBattlePost(battle) {
  const sorted = battle.participants
    .map(u => ({ username: u, count: getVotesForParticipant(battle, u) }))
    .sort((a, b) => b.count - a.count);

  let text = `🏆 <b>BATTLE BOSHLANDI</b>\n\n`;
  text += `❗ <b>Shartlar:</b>\n`;
  text += `• Kanalga obuna bo'lish\n`;
  text += `• Do'stlarni chaqirish\n\n`;
  text += `🎁 <b>Sovrin:</b>\n${battle.text}\n\n`;
  text += `🎯 <b>Maqsad:</b> ${battle.target} ta ovoz\n\n`;
  text += `📈 <b>Reyting:</b>\n\n`;

  if (sorted.length === 0) {
    text += `Hali ishtirokchilar yo'q\n`;
  } else {
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} @${p.username} — ${p.count} 📦\n`;
    });
  }
  return text;
}

function buildBattleKeyboard(battle) {
  const sorted = battle.participants
    .map(u => ({ username: u, count: getVotesForParticipant(battle, u) }))
    .sort((a, b) => b.count - a.count);

  const buttons = [];
  sorted.forEach(p => {
    buttons.push([Markup.button.url(
      `@${p.username} — ${p.count} 📦`,
      `https://t.me/${BOT_USERNAME}?start=vote-${battle.channel.replace('@', '')}-${p.username}`
    )]);
  });

  buttons.push([Markup.button.url(
    '🏆 KONKURSGA QO\'SHILISH',
    `https://t.me/${BOT_USERNAME}?start=join-${battle.battleId}`
  )]);
  buttons.push([Markup.button.url(
    '📊 NATIJALAR',
    `https://t.me/${BOT_USERNAME}?start=results-${battle.battleId}`
  )]);

  return Markup.inlineKeyboard(buttons);
}

async function updateBattlePost(battle) {
  if (!battle.messageId || !battle.channel) return;
  try {
    await bot.telegram.editMessageText(
      battle.channel, battle.messageId, null,
      buildBattlePost(battle),
      { parse_mode: 'HTML', reply_markup: buildBattleKeyboard(battle).reply_markup }
    );
  } catch (e) {
    console.log('[POST] edit xato:', e.message);
  }
}

// ============================================================
//                   DECLARE WINNER
// ============================================================
async function declareWinner(battle, winnerUsername) {
  battle.active = false;
  saveBattles();

  const winnerEntry = Object.values(users).find(
    u => u.username && u.username.toLowerCase() === winnerUsername.toLowerCase()
  );
  if (winnerEntry) {
    users[String(winnerEntry.id)].wins = (winnerEntry.wins || 0) + 1;
    saveUsers();
  }

  battle.participants.forEach(uname => {
    if (uname.toLowerCase() !== winnerUsername.toLowerCase()) {
      const loser = Object.values(users).find(
        u => u.username && u.username.toLowerCase() === uname.toLowerCase()
      );
      if (loser) { users[String(loser.id)].loses = (loser.loses || 0) + 1; saveUsers(); }
    }
  });

  try {
    await bot.telegram.sendMessage(
      battle.channel,
      `🏆 <b>BATTLE TUGADI</b>\n\n🥇 <b>G'olib:</b> @${winnerUsername}\n\n🎉 <b>Tabriklaymiz!</b>\n🎁 Sovrin: ${battle.text}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) { console.log('[WINNER] kanal xato:', e.message); }

  try {
    await bot.telegram.sendMessage(
      battle.owner,
      `🏆 Battleingiz tugadi!\n\n🥇 G'olib: @${winnerUsername}\n🎁 Sovrin: ${battle.text}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}
}

// ============================================================
//                  STATE MACHINE
// ============================================================
const userStates = {};
const setState   = (uid, s)  => { userStates[String(uid)] = s; };
const getState   = (uid)     => userStates[String(uid)] || null;
const clearState = (uid)     => { delete userStates[String(uid)]; };

// ============================================================
//                    KEYBOARDS
// ============================================================
const mainMenu  = () => Markup.keyboard([
  ['🏆 Battle yaratish', '📋 Battlelarim'],
  ['📊 Statistika', 'ℹ️ Yordam']
]).resize();

const cancelMenu = () => Markup.keyboard([['❌ Bekor qilish']]).resize();

const adminPanel = () => Markup.inlineKeyboard([
  [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
  [Markup.button.callback('🚫 Ban', 'admin_ban'), Markup.button.callback('✅ Unban', 'admin_unban')],
  [Markup.button.callback('📊 Statistika', 'admin_stats')],
  [Markup.button.callback('📋 Battlelar', 'admin_battles')],
  [Markup.button.callback('➕ Kanal qo\'shish', 'admin_add_channel'),
   Markup.button.callback('➖ Kanal o\'chirish', 'admin_remove_channel')]
]);

// ============================================================
//                      /start
// ============================================================
bot.start(async (ctx) => {
  const user = getUser(ctx);
  if (user.banned) return ctx.reply('🚫 Siz ban qilingansiz.');

  const payload = ctx.startPayload || '';

  if (payload.startsWith('vote-')) {
    const rest  = payload.slice(5);
    const dash  = rest.indexOf('-');
    if (dash !== -1) {
      return handleVote(ctx, rest.slice(0, dash), rest.slice(dash + 1));
    }
  }
  if (payload.startsWith('join-'))    return handleJoin(ctx, payload.slice(5));
  if (payload.startsWith('results-')) return handleResults(ctx, payload.slice(8));

  await ctx.reply(
    `👋 Salom, <b>${ctx.from.first_name}</b>!\n\n` +
    `🏆 <b>Ovoz Battle Bot</b>ga xush kelibsiz!\n\n` +
    `Battle yarating va do'stlaringiz bilan raqobatlashing!`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.webApp('📱 Open App', TMUXCASE_WEBAPP_URL),
          Markup.button.callback('🆕 Create Battle', 'create_battle'),
        ],
      ]).reply_markup,
    }
  );
  await ctx.reply('⬇️ Pastdagi menyudan foydalanishingiz mumkin:', mainMenu());
});

// ============================================================
//                   VOTE HANDLER
// ============================================================
async function handleVote(ctx, channelPart, targetUsername) {
  const voter = getUser(ctx);
  if (voter.banned) return ctx.reply('🚫 Siz ban qilingansiz.');

  const voterUsername = ctx.from.username;
  if (!voterUsername) return ctx.reply('❌ Avval username o\'rnating.');

  // Find battle
  const battle = Object.values(battles).find(
    b => b.channel.replace('@', '').toLowerCase() === channelPart.toLowerCase() && b.active
  );
  if (!battle) return ctx.reply('❌ Aktiv battle topilmadi yoki battle tugagan.');

  // Can't vote for yourself
  if (voterUsername.toLowerCase() === targetUsername.toLowerCase()) {
    return ctx.reply('❌ O\'zingizga ovoz bera olmaysiz.');
  }

  // Target must be participant
  const exists = battle.participants.some(p => p.toLowerCase() === targetUsername.toLowerCase());
  if (!exists) return ctx.reply('❌ Bu ishtirokchi battleda yo\'q.');

  const voterId = String(ctx.from.id);

  // Already voted
  if (battle.votes[voterId]) {
    const prev = battle.votes[voterId];
    if (prev.toLowerCase() === targetUsername.toLowerCase()) {
      return ctx.reply(`❌ Siz allaqachon @${targetUsername}ga ovoz bergansiz.`);
    }
    return ctx.reply(`❌ Siz bu battleda allaqachon @${prev}ga ovoz bergansiz.\nBir battleda faqat bitta odamga ovoz beriladi.`);
  }

  // --- CHECK BATTLE CHANNEL SUBSCRIPTION ---
  const inBattleChannel = await checkBattleChannel(ctx.from.id, battle.channel);
  if (!inBattleChannel) {
    const channelLink = `https://t.me/${battle.channel.replace('@', '')}`;
    return ctx.reply(
      `❌ Ovoz berish uchun avval ${battle.channel} kanaliga obuna bo'ling!`,
      Markup.inlineKeyboard([
        [Markup.button.url(`📢 ${battle.channel} ga obuna bo'lish`, channelLink)],
        [Markup.button.callback('✅ Obunani tekshirish', `chk_vote_${channelPart}_${targetUsername}`)]
      ])
    );
  }

  // --- CHECK REQUIRED CHANNELS ---
  const reqOk = await checkRequiredChannels(ctx.from.id);
  if (!reqOk) {
    const buttons = settings.requiredChannels.map(ch => [
      Markup.button.url(`📢 ${ch}`, `https://t.me/${ch.replace('@', '')}`)
    ]);
    buttons.push([Markup.button.callback('✅ Obunani tekshirish', `chk_vote_${channelPart}_${targetUsername}`)]);
    return ctx.reply('❌ Majburiy kanallarga obuna bo\'ling:', Markup.inlineKeyboard(buttons));
  }

  // VOTE!
  battle.votes[voterId] = targetUsername;
  users[voterId].votes = (users[voterId].votes || 0) + 1;
  saveBattles();
  saveUsers();

  await ctx.reply(`✅ @${targetUsername}ga ovoz berdingiz! 📦`, mainMenu());
  await updateBattlePost(battle);

  const count = getVotesForParticipant(battle, targetUsername);
  if (count >= battle.target) {
    await declareWinner(battle, targetUsername);
  }
}

// ============================================================
//                   JOIN HANDLER
// ============================================================
async function handleJoin(ctx, battleId) {
  const user = getUser(ctx);
  if (user.banned) return ctx.reply('🚫 Siz ban qilingansiz.');

  const username = ctx.from.username;
  if (!username) return ctx.reply('❌ Avval username o\'rnating.');

  const battle = battles[battleId];
  if (!battle) return ctx.reply('❌ Battle topilmadi.');
  if (!battle.active) return ctx.reply('❌ Bu battle tugagan.');

  // Check battle channel subscription
  const inBattleChannel = await checkBattleChannel(ctx.from.id, battle.channel);
  if (!inBattleChannel) {
    const channelLink = `https://t.me/${battle.channel.replace('@', '')}`;
    return ctx.reply(
      `❌ Battlega qo'shilish uchun avval ${battle.channel} kanaliga obuna bo'ling!`,
      Markup.inlineKeyboard([
        [Markup.button.url(`📢 ${battle.channel} ga obuna bo'lish`, channelLink)],
        [Markup.button.callback('✅ Obunani tekshirish', `chk_join_${battleId}`)]
      ])
    );
  }

  // Check required channels
  const reqOk = await checkRequiredChannels(ctx.from.id);
  if (!reqOk) {
    const buttons = settings.requiredChannels.map(ch => [
      Markup.button.url(`📢 ${ch}`, `https://t.me/${ch.replace('@', '')}`)
    ]);
    buttons.push([Markup.button.callback('✅ Obunani tekshirish', `chk_join_${battleId}`)]);
    return ctx.reply('❌ Majburiy kanallarga obuna bo\'ling:', Markup.inlineKeyboard(buttons));
  }

  if (battle.participants.some(p => p.toLowerCase() === username.toLowerCase())) {
    const voteLink = `https://t.me/${BOT_USERNAME}?start=vote-${battle.channel.replace('@', '')}-${username}`;
    return ctx.reply(
      `✅ Siz allaqachon bu battledasiz!\n\n🔗 Sizning ovoz havolangiz:\n${voteLink}`,
      { disable_web_page_preview: true }
    );
  }

  battle.participants.push(username);
  const uid = String(ctx.from.id);
  users[uid].joinedBattles = (users[uid].joinedBattles || 0) + 1;
  saveBattles();
  saveUsers();

  const voteLink = `https://t.me/${BOT_USERNAME}?start=vote-${battle.channel.replace('@', '')}-${username}`;
  await ctx.reply(
    `✅ Battlega muvaffaqiyatli qo'shildingiz!\n\n` +
    `🔗 <b>Sizning ovoz havolangiz:</b>\n${voteLink}\n\n` +
    `Havolani do'stlaringizga yuboring va ovoz yig'ing! 📦`,
    { parse_mode: 'HTML', disable_web_page_preview: true }
  );
  await updateBattlePost(battle);
}

// ============================================================
//                  RESULTS HANDLER
// ============================================================
async function handleResults(ctx, battleId) {
  const battle = battles[battleId];
  if (!battle) return ctx.reply('❌ Battle topilmadi.');

  const sorted = battle.participants
    .map(u => ({ username: u, count: getVotesForParticipant(battle, u) }))
    .sort((a, b) => b.count - a.count);

  let text = `📊 <b>Battle Natijalari</b>\n\n`;
  text += `🎁 Sovrin: ${battle.text}\n`;
  text += `🎯 Maqsad: ${battle.target} ovoz\n`;
  text += `📌 Holat: ${battle.active ? '🟢 Aktiv' : '🔴 Tugagan'}\n\n`;
  text += `📈 <b>Reyting:</b>\n\n`;

  if (sorted.length === 0) {
    text += 'Hali ishtirokchilar yo\'q.';
  } else {
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} @${p.username} — ${p.count} 📦\n`;
    });
  }
  await ctx.reply(text, { parse_mode: 'HTML' });
}

// ============================================================
//         SUBSCRIPTION CHECK CALLBACKS
// ============================================================
bot.action(/^chk_vote_([^_]+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Tekshirilmoqda...');
  try { await ctx.deleteMessage(); } catch (e) {}
  await handleVote(ctx, ctx.match[1], ctx.match[2]);
});

bot.action(/^chk_join_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Tekshirilmoqda...');
  try { await ctx.deleteMessage(); } catch (e) {}
  await handleJoin(ctx, ctx.match[1]);
});

// ============================================================
//                  MAIN MENU HANDLERS
// ============================================================
async function startBattleCreation(ctx) {
  const user = getUser(ctx);
  if (user.banned) return ctx.reply('🚫 Siz ban qilingansiz.');

  setState(ctx.from.id, { step: 'battle_text' });
  await ctx.reply(
    `🏆 <b>Battle yaratish</b>\n\n` +
    `📝 Battle matnini kiriting (sovrin nomi):\n\nMisol:\n• 🥇 Top 1 ga gift\n• 🎁 100 Stars\n• 🏆 Premium 1 oy`,
    { parse_mode: 'HTML', ...cancelMenu() }
  );
}

bot.hears('🏆 Battle yaratish', startBattleCreation);

// Inline "🆕 Create Battle" tugmasi (/start xabaridagi) — xuddi shu oqimni boshlaydi
bot.action('create_battle', async (ctx) => {
  await ctx.answerCbQuery();
  await startBattleCreation(ctx);
});

bot.hears('📋 Battlelarim', async (ctx) => {
  const user = getUser(ctx);
  if (user.banned) return ctx.reply('🚫 Siz ban qilingansiz.');

  const myBattles = getBattlesByOwner(ctx.from.id);
  if (myBattles.length === 0) return ctx.reply('📋 Sizda hali battle yo\'q.', mainMenu());

  const active   = myBattles.filter(b =>  b.active);
  const finished = myBattles.filter(b => !b.active);
  const buttons  = [];

  active.forEach(b => {
    const v = Object.keys(b.votes).length;
    buttons.push([Markup.button.callback(`🟢 ${b.text.substring(0, 22)} (${v}/${b.target})`, `bm_${b.battleId}`)]);
  });
  finished.slice(0, 5).forEach(b => {
    buttons.push([Markup.button.callback(`🔴 ${b.text.substring(0, 22)}`, `bi_${b.battleId}`)]);
  });

  await ctx.reply(
    `📋 <b>Battlelarim</b>\n\n🟢 Aktiv: ${active.length}\n🔴 Tugagan: ${finished.length}`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
});

bot.hears('📊 Statistika', async (ctx) => {
  const user = getUser(ctx);
  await ctx.reply(
    `📊 <b>Sizning statistikangiz</b>\n\n` +
    `🆔 ID: <code>${user.id}</code>\n` +
    `👤 Username: ${user.username ? '@' + user.username : 'Yo\'q'}\n\n` +
    `🏆 Yaratgan battlelar: ${user.createdBattles || 0}\n` +
    `👥 Qatnashgan battlelar: ${user.joinedBattles || 0}\n` +
    `📦 Yig'ilgan ovozlar: ${user.votes || 0}\n` +
    `🥇 G'alabalar: ${user.wins || 0}\n` +
    `😔 Mag'lubiyatlar: ${user.loses || 0}`,
    { parse_mode: 'HTML' }
  );
});

bot.hears('ℹ️ Yordam', async (ctx) => {
  await ctx.reply(
    `ℹ️ <b>Yordam</b>\n\n` +
    `🏆 Battle yarating va kanalingizga joylang\n` +
    `👥 Ishtirokchi bo'lish uchun <i>Konkursga qo'shilish</i> tugmasini bosing\n` +
    `📦 Ovoz berish uchun ishtirokchi tugmasini bosing\n` +
    `🎯 Kim birinchi maqsadga yetsa — avto g'olib!\n\n` +
    `🔗 Ovoz havola formati:\n` +
    `<code>t.me/${BOT_USERNAME}?start=vote-KANAL-USERNAME</code>`,
    { parse_mode: 'HTML' }
  );
});

bot.hears('❌ Bekor qilish', async (ctx) => {
  clearState(ctx.from.id);
  await ctx.reply('❌ Bekor qilindi.', mainMenu());
});

// ============================================================
//              TEXT / STATE MACHINE HANDLER
// ============================================================
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return; // admin bo'lmagan odamga sezilmasligi uchun jim qoladi

  const totalUsers    = Object.keys(users).length;
  const bannedUsers   = Object.values(users).filter(u => u.banned).length;
  const totalBattles  = Object.keys(battles).length;
  const activeBattles = Object.values(battles).filter(b => b.active).length;

  return ctx.reply(
    `⚙️ <b>Admin Panel</b>\n\n` +
    `👥 Foydalanuvchilar: ${totalUsers}\n` +
    `🚫 Banlangan: ${bannedUsers}\n` +
    `🏆 Jami battlelar: ${totalBattles}\n` +
    `🟢 Aktiv battlelar: ${activeBattles}\n\n` +
    `📢 Majburiy kanallar:\n${settings.requiredChannels.map(c => `• ${c}`).join('\n') || 'Yo\'q'}`,
    { parse_mode: 'HTML', ...adminPanel() }
  );
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text.startsWith('/')) return;

  const user  = getUser(ctx);
  if (user.banned) return;

  const state = getState(ctx.from.id);
  if (!state) return;

  // ── BATTLE CREATION ────────────────────────────────────
  if (state.step === 'battle_text') {
    state.battleText = text;
    state.step = 'battle_target';
    setState(ctx.from.id, state);
    return ctx.reply('✅ Matn saqlandi!\n\n🎯 G\'olib uchun kerakli ovoz sonini kiriting:\nMisol: 10, 50, 100', cancelMenu());
  }

  if (state.step === 'battle_target') {
    const target = parseInt(text);
    if (isNaN(target) || target < 1) return ctx.reply('❌ Musbat son kiriting (masalan: 10, 50, 100)');
    state.battleTarget = target;
    state.step = 'battle_channel';
    setState(ctx.from.id, state);
    return ctx.reply(
      `✅ Maqsad: ${target} ovoz\n\n📢 Kanal username kiriting:\nMisol: @mystarchannel`,
      cancelMenu()
    );
  }

  if (state.step === 'battle_channel') {
    let channel = text;
    if (!channel.startsWith('@')) channel = '@' + channel;

    // --- BOT shu kanalda admin ekanligini tekshirish ---
    try {
      const me = await ctx.telegram.getChatMember(channel, ctx.botInfo.id);
      if (!['administrator', 'creator'].includes(me.status)) {
        return ctx.reply('❌ Bot kanalda admin emas!\n\nIltimos, botni kanalga admin qilib qo\'shing va qaytadan urinib ko\'ring.', cancelMenu());
      }
    } catch (e) {
      return ctx.reply('❌ Kanal topilmadi yoki bot kanalda admin emas.\n\nIltimos, botni kanalga admin qilib qo\'shing va qaytadan urinib ko\'ring.', cancelMenu());
    }

    // --- FOYDALANUVCHI (battle yaratuvchi) shu kanalda admin ekanligini tekshirish ---
    try {
      const requester = await ctx.telegram.getChatMember(channel, ctx.from.id);
      if (!['administrator', 'creator'].includes(requester.status)) {
        return ctx.reply('❌ Siz bu kanalda admin emassiz!\n\nIltimos, kanalda admin bo\'lib, keyin battle yarating.', cancelMenu());
      }
    } catch (e) {
      return ctx.reply('❌ Siz bu kanalda admin emassiz!\n\nIltimos, kanalda admin bo\'lib, keyin battle yarating.', cancelMenu());
    }

    const battleId = generateId();
    const battle = {
      battleId, owner: ctx.from.id, channel,
      text: state.battleText, target: state.battleTarget,
      active: true, participants: [], votes: {},
      messageId: null, createdAt: Date.now()
    };

    battles[battleId] = battle;
    const uid = String(ctx.from.id);
    users[uid].createdBattles = (users[uid].createdBattles || 0) + 1;
    saveBattles();
    saveUsers();
    clearState(ctx.from.id);

    try {
      const msg = await ctx.telegram.sendMessage(
        channel, buildBattlePost(battle),
        { parse_mode: 'HTML', reply_markup: buildBattleKeyboard(battle).reply_markup }
      );
      battles[battleId].messageId = msg.message_id;
      saveBattles();
      await ctx.reply(
        `✅ Battle yaratildi!\n\n🆔 <code>${battleId}</code>\n📢 ${channel}\n🎯 ${state.battleTarget} ovoz`,
        { parse_mode: 'HTML', ...mainMenu() }
      );
    } catch (e) {
      delete battles[battleId];
      saveBattles();
      await ctx.reply(`❌ Kanalga post yubora olmadi:\n${e.message}`, mainMenu());
    }
    return;
  }

  // ── CHANGE TARGET ───────────────────────────────────────
  if (state.step === 'change_target') {
    const newTarget = parseInt(text);
    if (isNaN(newTarget) || newTarget < 1) return ctx.reply('❌ To\'g\'ri son kiriting.');
    const battle = battles[state.battleId];
    if (!battle || battle.owner !== ctx.from.id) { clearState(ctx.from.id); return ctx.reply('❌ Battle topilmadi.', mainMenu()); }
    const old = battle.target;
    battle.target = newTarget;
    saveBattles();
    clearState(ctx.from.id);
    await ctx.reply(`✅ Maqsad ${old} → ${newTarget} ga o'zgartirildi!`, mainMenu());
    await updateBattlePost(battle);
    return;
  }

  // ── ADMIN STATES ─────────────────────────────────────────
  if (state.step === 'admin_ban_user') {
    const target = findUserByQuery(text);
    if (!target) { clearState(ctx.from.id); return ctx.reply('❌ Topilmadi.', mainMenu()); }
    users[String(target.id)].banned = true;
    saveUsers();
    clearState(ctx.from.id);
    return ctx.reply(`🚫 @${target.username || target.id} ban qilindi.`, mainMenu());
  }

  if (state.step === 'admin_unban_user') {
    const target = findUserByQuery(text);
    if (!target) { clearState(ctx.from.id); return ctx.reply('❌ Topilmadi.', mainMenu()); }
    users[String(target.id)].banned = false;
    saveUsers();
    clearState(ctx.from.id);
    return ctx.reply(`✅ @${target.username || target.id} unban qilindi.`, mainMenu());
  }

  if (state.step === 'admin_add_channel') {
    let ch = text;
    if (!ch.startsWith('@')) ch = '@' + ch;
    if (!settings.requiredChannels.includes(ch)) { settings.requiredChannels.push(ch); saveSettings(); }
    clearState(ctx.from.id);
    return ctx.reply(`✅ ${ch} majburiy kanallarga qo'shildi.`, mainMenu());
  }

  if (state.step === 'admin_remove_channel') {
    let ch = text;
    if (!ch.startsWith('@')) ch = '@' + ch;
    settings.requiredChannels = settings.requiredChannels.filter(c => c !== ch);
    saveSettings();
    clearState(ctx.from.id);
    return ctx.reply(`✅ ${ch} o'chirildi.`, mainMenu());
  }

  if (state.step === 'admin_broadcast') {
    return sendBroadcast(ctx, ctx.message.message_id);
  }
});

// ============================================================
//              MEDIA BROADCAST HANDLER
// ============================================================
bot.on(['photo', 'video', 'animation', 'sticker', 'document', 'voice', 'audio'], async (ctx) => {
  const state = getState(ctx.from.id);
  if (!state || state.step !== 'admin_broadcast') return;
  await sendBroadcast(ctx, ctx.message.message_id);
});

async function sendBroadcast(ctx, messageId) {
  const uids = Object.keys(users);
  let sent = 0, failed = 0;
  await ctx.reply(`📢 Broadcast boshlandi... ${uids.length} ta foydalanuvchi`);
  for (const uid of uids) {
    try { await bot.telegram.copyMessage(uid, ctx.from.id, messageId); sent++; }
    catch (e) { failed++; }
    await new Promise(r => setTimeout(r, 55));
  }
  clearState(ctx.from.id);
  await ctx.reply(`✅ Broadcast tugadi!\n✅ Yuborildi: ${sent}\n❌ Xato: ${failed}`, mainMenu());
}

// ============================================================
//              BATTLE MANAGEMENT CALLBACKS
// ============================================================
bot.action(/^bm_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const battle = battles[ctx.match[1]];
  if (!battle || battle.owner !== ctx.from.id) return;

  const v = Object.keys(battle.votes).length;
  await ctx.editMessageText(
    `📋 <b>Battle Boshqaruvi</b>\n\n🎁 ${battle.text}\n🎯 Maqsad: ${battle.target}\n👥 Ishtirokchilar: ${battle.participants.length}\n📦 Ovozlar: ${v}\n📢 ${battle.channel}\n📌 ${battle.active ? '🟢 Aktiv' : '🔴 Tugagan'}`,
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('📊 Natijalar', `bi_${battle.battleId}`)],
      [Markup.button.callback('🎯 Maqsadni o\'zgartirish', `bc_${battle.battleId}`)],
      [Markup.button.callback('⛔ Battle stop', `bs_${battle.battleId}`)],
      [Markup.button.callback('🔄 Yangilash', `bm_${battle.battleId}`)],
      [Markup.button.callback('◀️ Orqaga', 'back_battles')]
    ]).reply_markup }
  );
});

bot.action(/^bi_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const battle = battles[ctx.match[1]];
  if (!battle) return;

  const sorted = battle.participants
    .map(u => ({ username: u, count: getVotesForParticipant(battle, u) }))
    .sort((a, b) => b.count - a.count);

  let text = `📊 <b>Natijalar</b>\n\n🎁 ${battle.text}\n🎯 Maqsad: ${battle.target}\n\n📈 <b>Reyting:</b>\n\n`;
  if (sorted.length === 0) { text += 'Hali ishtirokchilar yo\'q.'; }
  else { sorted.forEach((p, i) => { const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`; text += `${m} @${p.username} — ${p.count} 📦\n`; }); }

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga', `bm_${battle.battleId}`)]]).reply_markup });
});

bot.action(/^bc_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const battle = battles[ctx.match[1]];
  if (!battle || battle.owner !== ctx.from.id) return;
  setState(ctx.from.id, { step: 'change_target', battleId: battle.battleId });
  await ctx.reply(`🎯 Yangi maqsad sonini kiriting (hozir: ${battle.target}):`, cancelMenu());
});

bot.action(/^bs_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('⛔ Battle to\'xtatildi.');
  const battle = battles[ctx.match[1]];
  if (!battle || battle.owner !== ctx.from.id) return;
  battle.active = false;
  saveBattles();
  try { await bot.telegram.sendMessage(battle.channel, `⛔ <b>Battle to'xtatildi</b>\n\n🎁 Sovrin: ${battle.text}`, { parse_mode: 'HTML' }); } catch (e) {}
  await ctx.editMessageText('⛔ Battle to\'xtatildi.', { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga', 'back_battles')]]).reply_markup });
});

bot.action('back_battles', async (ctx) => {
  await ctx.answerCbQuery();
  const myBattles = getBattlesByOwner(ctx.from.id);
  const active = myBattles.filter(b => b.active);
  const finished = myBattles.filter(b => !b.active);
  const buttons = [];
  active.forEach(b => { const v=Object.keys(b.votes).length; buttons.push([Markup.button.callback(`🟢 ${b.text.substring(0,22)} (${v}/${b.target})`, `bm_${b.battleId}`)]); });
  finished.slice(0,5).forEach(b => { buttons.push([Markup.button.callback(`🔴 ${b.text.substring(0,22)}`, `bi_${b.battleId}`)]); });
  await ctx.editMessageText(
    `📋 <b>Battlelarim</b>\n\n🟢 Aktiv: ${active.length}\n🔴 Tugagan: ${finished.length}`,
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
  );
});

// ── REMOVE REQUIRED CHANNEL ────────────────────────────────
bot.action(/^rch_(.+)$/, async (ctx) => {
  const ch = ctx.match[1];
  settings.requiredChannels = settings.requiredChannels.filter(c => c !== ch);
  saveSettings();
  await ctx.answerCbQuery(`✅ ${ch} o'chirildi.`);
  await ctx.editMessageText(`✅ ${ch} majburiy kanallardan o'chirildi.`);
});

// ============================================================
//              ADMIN CALLBACKS
// ============================================================
bot.action('admin_broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  setState(ctx.from.id, { step: 'admin_broadcast' });
  await ctx.reply('📢 Broadcast xabarini yuboring (matn, rasm, video, gif, stiker...):', cancelMenu());
});

bot.action('admin_ban', async (ctx) => {
  await ctx.answerCbQuery();
  setState(ctx.from.id, { step: 'admin_ban_user' });
  await ctx.reply('🚫 Ban qilish uchun user ID yoki @username:', cancelMenu());
});

bot.action('admin_unban', async (ctx) => {
  await ctx.answerCbQuery();
  setState(ctx.from.id, { step: 'admin_unban_user' });
  await ctx.reply('✅ Unban qilish uchun user ID yoki @username:', cancelMenu());
});

bot.action('admin_stats', async (ctx) => {
  await ctx.answerCbQuery();
  const totalVotes = Object.values(battles).reduce((a, b) => a + Object.keys(b.votes).length, 0);
  await ctx.editMessageText(
    `📊 <b>Bot Statistikasi</b>\n\n` +
    `👥 Foydalanuvchilar: ${Object.keys(users).length}\n` +
    `🚫 Banlangan: ${Object.values(users).filter(u=>u.banned).length}\n` +
    `🏆 Jami battlelar: ${Object.keys(battles).length}\n` +
    `🟢 Aktiv: ${Object.values(battles).filter(b=>b.active).length}\n` +
    `📦 Jami ovozlar: ${totalVotes}\n\n` +
    `📢 Majburiy kanallar:\n${settings.requiredChannels.map(c=>`• ${c}`).join('\n')||'Yo\'q'}`,
    { parse_mode: 'HTML' }
  );
});

bot.action('admin_battles', async (ctx) => {
  await ctx.answerCbQuery();
  const all = Object.values(battles);
  let text = `📋 <b>Barcha Battlelar</b> (${all.length})\n\n`;
  if (all.length === 0) { text += 'Hali battle yo\'q.'; }
  else { all.slice(0,20).forEach(b => { const v=Object.keys(b.votes).length; text += `${b.active?'🟢':'🔴'} ${b.text.substring(0,20)} | ${b.channel} | ${v}/${b.target}\n`; }); }
  await ctx.editMessageText(text, { parse_mode: 'HTML' });
});

bot.action('admin_add_channel', async (ctx) => {
  await ctx.answerCbQuery();
  setState(ctx.from.id, { step: 'admin_add_channel' });
  await ctx.reply('➕ Majburiy kanal username kiriting (@kanal):', cancelMenu());
});

bot.action('admin_remove_channel', async (ctx) => {
  await ctx.answerCbQuery();
  if (settings.requiredChannels.length === 0) return ctx.reply('Majburiy kanallar yo\'q.');
  const buttons = settings.requiredChannels.map(ch => [Markup.button.callback(`❌ ${ch}`, `rch_${ch}`)]);
  await ctx.editMessageText('➖ O\'chirish uchun kanalni tanlang:', { reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
});

// ============================================================
//                    ERROR HANDLER
// ============================================================
bot.catch((err, ctx) => {
  console.error(`[ERROR]:`, err.message || err);
  try {
    if (ctx.callbackQuery) ctx.answerCbQuery('❌ Xato yuz berdi.').catch(()=>{});
    else ctx.reply('❌ Xato yuz berdi.').catch(()=>{});
  } catch (_) {}
});

// ============================================================
//                      LAUNCH
// ============================================================
bot.launch({ allowedUpdates: ['message', 'callback_query'] })
  .then(() => console.log(`✅ Ovoz Battle Bot ishga tushdi! @${BOT_USERNAME}\n🔑 Admin panel: /admin (ADMIN_IDS: ${ADMIN_IDS.join(', ') || 'belgilanmagan'})`))
  .catch(err => { console.error('❌ Bot ishga tushmadi:', err.message); process.exit(1); });

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

