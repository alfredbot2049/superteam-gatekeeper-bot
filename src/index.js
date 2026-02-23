require('dotenv').config();

const { Telegraf } = require('telegraf');
const cron = require('node-cron');

const db = require('./db');
const gatekeeper = require('./gatekeeper');
const activity = require('./activity');
const events = require('./events');
const admin = require('./admin');
const security = require('./security');

// Validate env
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required. Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// FIX #1: Pass bot instance to modules that need it
events.init(bot);
security.init(bot);
admin.init(bot);

// Middleware: detect which group the message is from
// FIX #2: Convert env string to number for comparison
bot.use(async (ctx, next) => {
  if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
    const groupId = ctx.chat.id;
    ctx.isPublicGroup = groupId === Number(process.env.PUBLIC_GROUP_ID);
    ctx.isMemberCircle = groupId === Number(process.env.MEMBER_CIRCLE_ID);
  }
  return next();
});

// ---- Event Handlers ----

// New member joins public group
bot.on('new_chat_members', (ctx) => {
  if (ctx.isPublicGroup) {
    gatekeeper.handleNewMember(ctx);
  }
});

// Message routing based on group
bot.on('message', async (ctx) => {
  if (!ctx.chat || !ctx.from) return;

  if (ctx.isPublicGroup) {
    await gatekeeper.handleMessage(ctx);
  } else if (ctx.isMemberCircle) {
    activity.trackMessage(ctx);
    security.monitorMessage(ctx);
  }
});

// ---- Commands ----

// Shared commands (both groups)
bot.command('events', (ctx) => events.handleEvents(ctx));
bot.command('nextevent', (ctx) => events.handleNextEvent(ctx));

bot.command('help', (ctx) => {
  const isAdm = admin.isAdmin(ctx.from.id);
  let msg = '🤖 *Superteam MY Bot Commands*\n\n';
  msg += '📅 /events — Upcoming events\n';
  msg += '📅 /nextevent — Next event\n';
  msg += '❓ /help — This message\n';

  if (isAdm) {
    msg += '\n🔐 *Admin Commands*\n\n';
    msg += '_Public Group:_\n';
    msg += '/reset @user — Reset intro\n';
    msg += '/approve @user — Approve intro\n';
    msg += '/status — Pending intros\n';
    msg += '/stats — Intro stats\n';
    msg += '\n_Member Circle:_\n';
    msg += '/report — Activity report\n';
    msg += '/inactive — Inactive members\n';
    msg += '/top — Top contributors\n';
    msg += '/member @user — Member detail\n';
    msg += '/purge\\_candidates — 60+ day inactive\n';
    msg += '/nudge @user — Send reminder\n';
    msg += '/health — Group health\n';
    msg += '/security — Security flags\n';
  }

  ctx.reply(msg, { parse_mode: 'Markdown' }).catch(() => ctx.reply(msg));
});

// Admin: Public group commands
bot.command('reset', (ctx) => admin.handleReset(ctx));
bot.command('approve', (ctx) => admin.handleApprove(ctx));
bot.command('status', (ctx) => admin.handleStatus(ctx));
bot.command('stats', (ctx) => admin.handleStats(ctx));

// Admin: Member circle commands
bot.command('report', (ctx) => admin.handleReport(ctx));
bot.command('inactive', (ctx) => admin.handleInactive(ctx));
bot.command('top', (ctx) => admin.handleTop(ctx));
bot.command('member', (ctx) => admin.handleMember(ctx));
bot.command('purge_candidates', (ctx) => admin.handlePurgeCandidates(ctx));
bot.command('nudge', (ctx) => admin.handleNudge(ctx));
bot.command('confirm_nudge', (ctx) => admin.handleConfirmNudge(ctx));
bot.command('health', (ctx) => admin.handleHealth(ctx));

// Security
bot.command('security', (ctx) => security.handleSecurity(ctx));

// ---- Scheduled Tasks (node-cron) ----

// Check event reminders every minute
cron.schedule('* * * * *', () => events.checkReminders());

// Weekly digest every Monday at 9am KL time
cron.schedule('0 9 * * 1', () => events.postWeeklyDigest(), { timezone: 'Asia/Kuala_Lumpur' });

// Inactive member detection daily at 3am KL time
cron.schedule('0 3 * * *', () => activity.detectInactive(), { timezone: 'Asia/Kuala_Lumpur' });

// Refresh Luma events every 6 hours
cron.schedule('0 */6 * * *', () => events.fetchEvents());

// ---- Error Handling ----

bot.catch((err, ctx) => {
  console.error(`[Bot Error] ${ctx?.updateType || 'unknown'}:`, err.message);
});

// Graceful shutdown
const shutdown = () => {
  console.log('🛑 Shutting down...');
  db.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---- Launch ----

bot.launch();
console.log('🤖 Superteam MY Bot is running!');
console.log(`   Public Group: ${process.env.PUBLIC_GROUP_ID || 'NOT SET'}`);
console.log(`   Member Circle: ${process.env.MEMBER_CIRCLE_ID || 'NOT SET'}`);
console.log(`   Admins: ${process.env.ADMIN_IDS || 'NOT SET'}`);
