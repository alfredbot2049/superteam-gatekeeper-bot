const db = require('./db');

// FIX #1: Bot instance passed via init
let bot = null;

function init(botInstance) {
  bot = botInstance;
}

function monitorMessage(ctx) {
  if (!ctx.from || ctx.from.is_bot) return;

  const userId = ctx.from.id;
  const message = ctx.message.text || '';
  const recent = db.getRecentMessages(userId, 5);

  // Detect repeated spam (3+ identical messages)
  if (recent.length >= 3 && recent.slice(0, 3).every(m => m === message)) {
    flagSecurity(userId, 'spam', ctx.from.username || String(userId), `Repeated: "${message.substring(0, 50)}"`);
  }

  // Detect link spam (4+ links in recent messages)
  if (message.includes('http')) {
    const linkCount = recent.filter(m => m && m.includes('http')).length;
    if (linkCount > 3) {
      flagSecurity(userId, 'link_spam', ctx.from.username || String(userId), `${linkCount} links in recent messages`);
    }
  }

  // Detect potential scam patterns
  const scamPatterns = ['airdrop', 'connect wallet', 'claim your', 'free tokens', 'send me'];
  const lowerMsg = message.toLowerCase();
  if (scamPatterns.some(p => lowerMsg.includes(p))) {
    flagSecurity(userId, 'potential_scam', ctx.from.username || String(userId), `Pattern match in: "${message.substring(0, 80)}"`);
  }
}

// FIX #10: Fetch user from DB, don't reference undefined variable
function flagSecurity(userId, type, username, details = '') {
  db.logSecurityFlag(userId, type, details);

  if (!bot) return;

  const adminIds = (process.env.ADMIN_IDS || '').split(',');
  for (const adminId of adminIds) {
    if (!adminId) continue;
    bot.telegram.sendMessage(
      Number(adminId),
      `⚠️ Security Alert\n\nUser: @${username}\nType: ${type}\nDetails: ${details}`
    ).catch(err => console.error('[Security] Admin alert failed:', err.message));
  }
}

// FIX #9: Proper export, no circular dependency
async function handleSecurity(ctx) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',');
  if (!adminIds.includes(String(ctx.from.id))) return;

  const flags = db.getSecurityFlags(20);
  if (flags.length === 0) return ctx.reply('🛡️ No security flags. All clear!');

  let msg = '🚨 Recent Security Flags:\n\n';
  flags.forEach(f => {
    const name = f.username ? '@' + f.username : f.user_id;
    const time = new Date(f.timestamp).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    msg += `• ${name} — ${f.type}\n  ${f.details || ''}\n  ${time}\n\n`;
  });
  await ctx.reply(msg);
}

module.exports = { init, monitorMessage, handleSecurity };
