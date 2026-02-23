const config = require('../config.json');
const db = require('./db');

async function handleNewMember(ctx) {
  for (const member of ctx.message.new_chat_members) {
    if (member.is_bot) continue;

    db.upsertUser(member.id, member.username || '', 0, member.first_name || '', 'public');
    console.log(`[Gatekeeper] New member: ${member.username || member.id} — pending intro`);

    // Try DM first, fall back to Intros topic
    try {
      await ctx.telegram.sendMessage(member.id, config.templates.welcome);
      console.log(`[Gatekeeper] Sent DM to ${member.username || member.id}`);
    } catch {
      try {
        const sentMsg = await ctx.telegram.sendMessage(ctx.chat.id, config.templates.welcome, {
          message_thread_id: config.introsTopicId
        });
        try { await ctx.pinChatMessage(sentMsg.message_id); } catch {}
        console.log(`[Gatekeeper] Sent welcome in Intros topic for ${member.username || member.id}`);
      } catch (err) {
        const sentMsg = await ctx.reply(config.templates.welcome);
        try { await ctx.pinChatMessage(sentMsg.message_id); } catch {}
        console.log(`[Gatekeeper] Sent fallback welcome for ${member.username || member.id}`);
      }
    }
  }
}

async function handleMessage(ctx) {
  if (!ctx.from || ctx.from.is_bot) return;

  const userId = ctx.from.id;
  const text = ctx.message.text || '';
  const topicId = ctx.message.message_thread_id;

  let user = db.getUser(userId);
  if (!user) {
    db.upsertUser(userId, ctx.from.username || '', 0, ctx.from.first_name || '', 'public');
    user = db.getUser(userId);
  }

  // Already completed intro - let them through
  if (user && user.intro_completed) return;

  // Message is in the Intros topic - check if it's a valid intro
  const isIntros = topicId === config.introsTopicId;

  if (isIntros) {
    if (isValidIntro(text)) {
      db.updateIntroStatus(userId, true);
      console.log(`[Gatekeeper] Intro accepted for ${ctx.from.username || userId}`);

      await ctx.reply(
        `✅ Welcome aboard, ${ctx.from.first_name || ctx.from.username || 'friend'}! ` +
        `Your intro looks great. You now have full access to all channels. 🎉`
      );
    }
    return;
  }

  // User hasn't completed intro and posted OUTSIDE Intros topic — delete + remind
  try {
    await ctx.deleteMessage();
    const reminder = await ctx.telegram.sendMessage(ctx.chat.id,
      `Hey ${ctx.from.first_name || ctx.from.username || 'there'}! 👋 ` +
      `Please post your intro in the Intros topic first before chatting in other channels.`,
      { message_thread_id: topicId }
    );
    setTimeout(() => {
      ctx.telegram.deleteMessage(ctx.chat.id, reminder.message_id).catch(() => {});
    }, 10000);
  } catch (err) {
    console.error('[Gatekeeper] Delete/remind failed:', err.message);
  }
}

function isValidIntro(text) {
  if (!text) return false;
  if (text.length < config.introValidation.minLength) return false;
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  return lines.length >= config.introValidation.minLines || text.length >= 100;
}

module.exports = { handleNewMember, handleMessage };
