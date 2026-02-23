const db = require('./db');
const activity = require('./activity');
const config = require('../config.json');

// FIX #1: Bot instance passed via init
let bot = null;

function init(botInstance) {
  bot = botInstance;
}

function isAdmin(userId) {
  return (process.env.ADMIN_IDS || '').split(',').includes(String(userId));
}

async function handleReset(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const parts = (ctx.message.text || '').split(' ');
  if (parts.length < 2) return ctx.reply('Usage: /reset @username');
  const username = parts[1].replace('@', '');
  const user = db.getUserByUsername(username);
  if (user) {
    db.updateIntroStatus(user.id, false);
    await ctx.reply(`🔄 Reset intro for @${username}`);
  } else {
    await ctx.reply(`❌ User @${username} not found`);
  }
}

async function handleApprove(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const parts = (ctx.message.text || '').split(' ');
  if (parts.length < 2) return ctx.reply('Usage: /approve @username');
  const username = parts[1].replace('@', '');
  const user = db.getUserByUsername(username);
  if (user) {
    db.updateIntroStatus(user.id, true);
    await ctx.reply(`✅ Approved @${username}`);
  } else {
    await ctx.reply(`❌ User @${username} not found`);
  }
}

async function handleStatus(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const pending = db.getPendingIntros();
  if (pending.length === 0) return ctx.reply('✅ No pending intros!');
  let msg = '⏳ Pending Intros:\n\n';
  pending.forEach(u => {
    msg += `• ${u.username ? '@' + u.username : u.first_name || u.id}\n`;
  });
  await ctx.reply(msg);
}

async function handleStats(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const total = db.getUserCount();
  const completed = db.getCompletedIntroCount();
  const rate = total > 0 ? (completed / total * 100).toFixed(1) : '0';
  await ctx.reply(`📊 Intro Stats:\n\nTotal Users: ${total}\nIntros Completed: ${completed}\nCompletion Rate: ${rate}%`);
}

async function handleReport(ctx) {
  if (!isAdmin(ctx.from.id) || !ctx.isMemberCircle) return;
  const users = db.getMemberCircleUsers();
  if (users.length === 0) return ctx.reply('No member data yet.');

  let msg = '📊 Activity Report:\n\n';
  for (const user of users.slice(0, 20)) {
    const score = activity.calculateActivityScore(user.id);
    const msgCount = db.getMessageCount(user.id);
    const lastActive = db.getLastActive(user.id);
    const lastStr = lastActive ? new Date(lastActive).toLocaleDateString() : 'Never';
    const name = user.username ? '@' + user.username : user.first_name || user.id;
    msg += `${name}: ${msgCount} msgs | Score: ${score} | Last: ${lastStr}\n`;
  }
  await ctx.reply(msg);
}

async function handleInactive(ctx) {
  if (!isAdmin(ctx.from.id) || !ctx.isMemberCircle) return;
  const inactives = db.getInactiveUsers(config.thresholds.inactive);
  if (inactives.length === 0) return ctx.reply('🎉 No inactive members!');
  let msg = '😴 Inactive Members:\n\n';
  inactives.forEach(u => {
    const name = u.username ? '@' + u.username : u.first_name || u.id;
    msg += `• ${name} — ${u.days_inactive} days\n`;
  });
  await ctx.reply(msg);
}

async function handleTop(ctx) {
  if (!isAdmin(ctx.from.id) || !ctx.isMemberCircle) return;
  const top = db.getTopActive(10);
  if (top.length === 0) return ctx.reply('No activity data yet.');
  let msg = '🏆 Top Contributors (30 days):\n\n';
  top.forEach((u, i) => {
    const name = u.username ? '@' + u.username : u.first_name || 'Unknown';
    msg += `${i + 1}. ${name} — ${u.score} contributions\n`;
  });
  await ctx.reply(msg);
}

async function handleMember(ctx) {
  if (!isAdmin(ctx.from.id) || !ctx.isMemberCircle) return;
  const parts = (ctx.message.text || '').split(' ');
  if (parts.length < 2) return ctx.reply('Usage: /member @username');
  const username = parts[1].replace('@', '');
  const user = db.getUserByUsername(username);
  if (!user) return ctx.reply(`❌ User @${username} not found`);

  const score = activity.calculateActivityScore(user.id);
  const msgCount = db.getMessageCount(user.id);
  const lastActive = db.getLastActive(user.id);
  const lastStr = lastActive ? new Date(lastActive).toLocaleDateString() : 'Never';

  await ctx.reply(
    `👤 @${username}\n\n` +
    `Activity Score: ${score}\n` +
    `Messages (30d): ${msgCount}\n` +
    `Last Active: ${lastStr}\n` +
    `Days Inactive: ${user.days_inactive}\n` +
    `Group: ${user.group_type}`
  );
}

async function handlePurgeCandidates(ctx) {
  if (!isAdmin(ctx.from.id) || !ctx.isMemberCircle) return;
  const candidates = db.getInactiveUsers(config.thresholds.purge);
  if (candidates.length === 0) return ctx.reply('✅ No purge candidates!');
  let msg = '🗑️ Purge Candidates (60+ days inactive):\n\n';
  candidates.forEach(u => {
    const name = u.username ? '@' + u.username : u.first_name || u.id;
    msg += `• ${name} — ${u.days_inactive} days\n`;
  });
  await ctx.reply(msg);
}

async function handleNudge(ctx) {
  if (!isAdmin(ctx.from.id) || !ctx.isMemberCircle) return;
  const parts = (ctx.message.text || '').split(' ');
  if (parts.length < 2) return ctx.reply('Usage: /nudge @username');
  const username = parts[1].replace('@', '');
  const user = db.getUserByUsername(username);
  if (!user) return ctx.reply(`❌ User @${username} not found`);
  await ctx.reply(`📩 Send nudge to @${username}?\nConfirm: /confirm_nudge ${user.id}`);
}

// FIX #5: Registered as handler via init, not at module level
async function handleConfirmNudge(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  const parts = (ctx.message.text || '').split(' ');
  if (parts.length < 2) return;
  const userId = parseInt(parts[1]);
  const user = db.getUser(userId);
  if (!user) return ctx.reply('❌ User not found');

  const dm = config.templates.nudge.replace('[name]', user.first_name || user.username || 'there');
  try {
    await bot.telegram.sendMessage(userId, dm);
    db.logNudge(userId);
    await ctx.reply(`✅ Nudge sent to @${user.username || user.first_name}`);
  } catch (err) {
    await ctx.reply(`❌ Could not DM user. They may not have started a chat with the bot.\n${err.message}`);
  }
}

async function handleHealth(ctx) {
  if (!isAdmin(ctx.from.id) || !ctx.isMemberCircle) return;
  const total = db.getUserCount();
  const active7 = db.getActiveUsersCount(7);
  const active30 = db.getActiveUsersCount(30);
  const pct7 = total > 0 ? (active7 / total * 100).toFixed(1) : '0';
  const pct30 = total > 0 ? (active30 / total * 100).toFixed(1) : '0';

  await ctx.reply(
    `🏥 Group Health:\n\n` +
    `Total Members: ${total}\n` +
    `Active (7 days): ${active7} (${pct7}%)\n` +
    `Active (30 days): ${active30} (${pct30}%)\n` +
    `\nTrend: ${active7 > active30 / 4 ? '📈 Healthy' : '📉 Declining'}`
  );
}

module.exports = {
  init, isAdmin,
  handleReset, handleApprove, handleStatus, handleStats,
  handleReport, handleInactive, handleTop, handleMember,
  handlePurgeCandidates, handleNudge, handleConfirmNudge, handleHealth
};
