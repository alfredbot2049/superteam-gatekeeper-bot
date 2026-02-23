const config = require('../config.json');
const db = require('./db');

// FIX #12: Try DM first, fall back to in-group
async function handleNewMember(ctx) {
  for (const member of ctx.message.new_chat_members) {
    if (member.is_bot) continue;

    db.upsertUser(member.id, member.username || '', 0, member.first_name || '', 'public');

    try {
      await ctx.telegram.sendMessage(member.id, config.templates.welcome);
      console.log(`[Gatekeeper] Sent DM to ${member.username || member.id}`);
    } catch {
      // User hasn't started chat with bot — send in group
      const sentMsg = await ctx.reply(config.templates.welcome);
    // Auto-pin welcome message
    try { await ctx.pinChatMessage(sentMsg.message_id); } catch {}
      console.log(`[Gatekeeper] Sent in-group welcome for ${member.username || member.id}`);
    }
  }
}

async function handleMessage(ctx) {
  if (!ctx.from || ctx.from.is_bot) return;

  const userId = ctx.from.id;
  const text = ctx.message.text || '';
  const topicId = ctx.message.message_thread_id;

  // Ensure user is tracked
  let user = db.getUser(userId);
  if (!user) {
    db.upsertUser(userId, ctx.from.username || '', 0, ctx.from.first_name || '', 'public');
    user = db.getUser(userId);
  }

  // Already completed intro — pass through
  if (user && user.intro_completed) return;

  // Check if message is in the Intros channel/topic
  const isIntros = topicId === config.publicChannels.intros
    || ctx.chat.id === config.publicChannels.intros;

  if (isIntros) {
    // FIX #3: Validate by length/content, not literal prompt text
    if (isValidIntro(text)) {
      db.updateIntroStatus(userId, true);
      await ctx.reply(
        `✅ Welcome aboard, ${ctx.from.first_name || ctx.from.username || 'friend'}! ` +
        `Your intro looks great. You now have full access to all channels. 🎉`
      );
    }
    return;
  }

  // Gate access to restricted channels
  if (isGatedChannel(topicId || ctx.chat.id)) {
    // FIX #4: Don't reply to deleted message
    try {
      await ctx.deleteMessage();
      const reminder = await ctx.reply(
        `Hey ${ctx.from.first_name || ctx.from.username || 'there'}! 👋 ` +
        `Please post your intro in the Intros channel first. Your message was removed.`
      );
      // Auto-delete reminder after 10 seconds to keep chat clean
      setTimeout(() => {
        ctx.telegram.deleteMessage(ctx.chat.id, reminder.message_id).catch(() => {});
      }, 10000);
    } catch (err) {
      console.error('[Gatekeeper] Delete/remind failed:', err.message);
    }
  }
}

// FIX #3: Validate intro by substance, not literal prompt keywords
function isValidIntro(text) {
  if (!text) return false;
  if (text.length < config.introValidation.minLength) return false;
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  return lines.length >= config.introValidation.minLines || text.length >= 100;
}

function isGatedChannel(channelId) {
  return [
    config.publicChannels.general,
    config.publicChannels.bounty,
    config.publicChannels.career,
    config.publicChannels.community,
  ].includes(channelId);
}

module.exports = { handleNewMember, handleMessage };

// Auto-pin welcome message in Intros channel
async function pinWelcomeInIntros(bot, userId, firstName, username) {
  try {
    const sentMessage = await bot.telegram.sendMessage(
      config.publicChannels.intros,
      `👋 Welcome ${firstName || username || 'friend'}! Please introduce yourself here.`
    );
    await bot.telegram.pinChatMessage(config.publicChannels.intros, sentMessage.message_id);
    console.log(`[Gatekeeper] Pinned welcome for ${username || userId}`);
  } catch (err) {
    console.log(`[Gatekeeper] Pin failed: ${err.message}`);
  }
}

module.exports.pinWelcomeInIntros = pinWelcomeInIntros;
