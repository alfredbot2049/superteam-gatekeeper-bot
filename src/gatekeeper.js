const config = require('../config.json');
const db = require('./db');

async function handleNewMember(ctx) {
  for (const member of ctx.message.new_chat_members) {
    if (member.is_bot) continue;

    db.upsertUser(member.id, member.username || '', 0, member.first_name || '', 'public');

    // Mute new user until they complete intro
    try {
      await ctx.restrictChatMember(member.id, {
        permissions: {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
        }
      });
      console.log(`[Gatekeeper] Muted ${member.username || member.id}`);
    } catch (err) {
      console.error('[Gatekeeper] Failed to mute:', err.message);
    }

    // Try DM first, fall back to in-group
    try {
      await ctx.telegram.sendMessage(member.id, config.templates.welcome);
      console.log(`[Gatekeeper] Sent DM to ${member.username || member.id}`);
    } catch {
      const sentMsg = await ctx.reply(config.templates.welcome);
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

  let user = db.getUser(userId);
  if (!user) {
    db.upsertUser(userId, ctx.from.username || '', 0, ctx.from.first_name || '', 'public');
    user = db.getUser(userId);
  }

  if (user && user.intro_completed) return;

  const isIntros = topicId === config.publicChannels.intros
    || ctx.chat.id === config.publicChannels.intros;

  if (isIntros) {
    if (isValidIntro(text)) {
      db.updateIntroStatus(userId, true);

      // Unmute user - grant full permissions
      try {
        await ctx.restrictChatMember(userId, {
          permissions: {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false,
          }
        });
        console.log(`[Gatekeeper] Unmuted ${ctx.from.username || userId}`);
      } catch (err) {
        console.error('[Gatekeeper] Failed to unmute:', err.message);
      }

      await ctx.reply(
        `✅ Welcome aboard, ${ctx.from.first_name || ctx.from.username || 'friend'}! ` +
        `Your intro looks great. You now have full access to all channels. 🎉`
      );
    }
    return;
  }

  // If somehow they can still send (fallback) - delete and remind
  if (isGatedChannel(topicId || ctx.chat.id)) {
    try {
      await ctx.deleteMessage();
      const reminder = await ctx.reply(
        `Hey ${ctx.from.first_name || ctx.from.username || 'there'}! 👋 ` +
        `Please post your intro in the Intros channel first.`
      );
      setTimeout(() => {
        ctx.telegram.deleteMessage(ctx.chat.id, reminder.message_id).catch(() => {});
      }, 10000);
    } catch (err) {
      console.error('[Gatekeeper] Delete/remind failed:', err.message);
    }
  }
}

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
