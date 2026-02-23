const db = require('./db');

function trackMessage(ctx) {
  if (!ctx.from || ctx.from.is_bot) return;

  const userId = ctx.from.id;
  const message = ctx.message.text || '';
  const hasLink = message.includes('http');
  const type = hasLink ? 'link' : 'message';

  // Ensure member exists in DB
  db.upsertUser(userId, ctx.from.username || '', 1, ctx.from.first_name || '', 'member');
  db.logActivity(userId, type, message);
}

function calculateActivityScore(userId) {
  const logs = db.getActivityLogs(userId, 7);
  let score = logs.length;
  logs.forEach(log => {
    if (log.type === 'link') score += 1;
    if (log.message && log.message.length > 200) score += 1; // Long thoughtful messages
  });
  return score;
}

function detectInactive() {
  console.log('[Activity] Running inactive detection...');
  const users = db.getMemberCircleUsers();
  const now = Date.now();
  let flagged = 0;

  for (const user of users) {
    const lastActive = db.getLastActive(user.id);
    if (!lastActive) continue;
    const daysInactive = Math.floor((now - lastActive) / (24 * 60 * 60 * 1000));
    if (daysInactive >= 14) {
      db.flagInactive(user.id, daysInactive);
      flagged++;
    } else {
      db.flagInactive(user.id, 0); // Reset if active
    }
  }
  console.log(`[Activity] Flagged ${flagged} inactive members`);
}

module.exports = { trackMessage, calculateActivityScore, detectInactive };
