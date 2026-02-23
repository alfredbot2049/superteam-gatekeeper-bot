const axios = require('axios');
const db = require('./db');

// FIX #1: Bot instance passed via init
let bot = null;

function init(botInstance) {
  bot = botInstance;
  // Fetch events on startup
  fetchEvents().catch(err => console.error('[Events] Initial fetch failed:', err.message));
}

// FIX #6: Use actual Luma API endpoint
async function fetchEvents() {
  const calendarId = process.env.LUMA_CALENDAR_ID || 'mysuperteam';

  try {
    const response = await axios.get('https://api.lu.ma/calendar/list-events', {
      params: {
        calendar_api_id: calendarId,
        period: 'future'
      },
      timeout: 15000,
      headers: { 'User-Agent': 'SuperteamMY-Bot/1.0' }
    });

    const entries = response.data?.entries || response.data?.data || [];
    const events = entries.map(entry => {
      const ev = entry.event || entry;
      const startAt = ev.start_at || ev.startAt || '';
      return {
        luma_id: ev.api_id || ev.id || '',
        title: ev.name || ev.title || 'Untitled Event',
        date: startAt ? startAt.split('T')[0] : '',
        time: startAt ? new Date(startAt).toLocaleTimeString('en-MY', {
          hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuala_Lumpur'
        }) : 'TBD',
        location: ev.geo_address_info?.city || ev.location || ev.meeting_url || 'TBD',
        link: ev.url || `https://lu.ma/${ev.api_id || ''}`
      };
    });

    db.cacheEvents(events);
    console.log(`[Events] Cached ${events.length} events from Luma`);
    return events;
  } catch (err) {
    console.error('[Events] Fetch failed:', err.message);
    return [];
  }
}

async function handleEvents(ctx) {
  const events = db.getCachedEvents();
  if (events.length === 0) {
    return ctx.reply('📅 No upcoming events right now.\nCheck https://lu.ma/mysuperteam for updates!');
  }

  let msg = '📅 *Upcoming Events*\n\n';
  events.slice(0, 5).forEach((e, i) => {
    msg += `${i + 1}. *${e.title}*\n`;
    msg += `   📆 ${e.date} at ${e.time}\n`;
    msg += `   📍 ${e.location}\n`;
    msg += `   🔗 ${e.link}\n\n`;
  });

  if (events.length > 5) {
    msg += `... and ${events.length - 5} more\n`;
  }
  msg += '📅 Full calendar: https://lu.ma/mysuperteam';

  await ctx.reply(msg, { parse_mode: 'Markdown' }).catch(() => ctx.reply(msg));
}

async function handleNextEvent(ctx) {
  const events = db.getCachedEvents();
  if (events.length === 0) {
    return ctx.reply('No upcoming events right now. 📅');
  }
  const next = events[0];
  await ctx.reply(
    `🔜 *Next Event*\n\n` +
    `*${next.title}*\n` +
    `📆 ${next.date} at ${next.time}\n` +
    `📍 ${next.location}\n` +
    `🔗 RSVP: ${next.link}`,
    { parse_mode: 'Markdown' }
  ).catch(() => ctx.reply(`Next: ${next.title} on ${next.date} — ${next.link}`));
}

// FIX #7: Use time window instead of exact match
async function checkReminders() {
  if (!bot) return;

  const events = db.getCachedEvents();
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;
  const WINDOW = 90 * 1000; // 90-second window for cron check

  for (const event of events) {
    const eventTime = new Date(`${event.date}T${event.time || '00:00'}+08:00`).getTime();
    if (isNaN(eventTime)) continue;
    const diff = eventTime - now;

    // 24h reminder
    if (diff > ONE_DAY - WINDOW && diff < ONE_DAY + WINDOW && !event.reminded_24h) {
      const msg = `📢 *Tomorrow:* ${event.title}\n⏰ ${event.time}\n📍 ${event.location}\n🔗 RSVP: ${event.link}`;
      await sendToBothGroups(msg);
      db.markEventReminded(event.id, '24h');
      console.log(`[Events] Sent 24h reminder for: ${event.title}`);
    }

    // 1h reminder
    if (diff > ONE_HOUR - WINDOW && diff < ONE_HOUR + WINDOW && !event.reminded_1h) {
      const msg = `⏰ *Starting in 1 hour:* ${event.title}\n📍 ${event.location}\n🔗 Join: ${event.link}`;
      await sendToBothGroups(msg);
      db.markEventReminded(event.id, '1h');
      console.log(`[Events] Sent 1h reminder for: ${event.title}`);
    }
  }
}

async function postWeeklyDigest() {
  if (!bot) return;

  const events = db.getCachedEvents();
  const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const thisWeek = events.filter(e => {
    const t = new Date(e.date).getTime();
    return !isNaN(t) && t < weekFromNow;
  });

  let msg = '📋 *This Week at Superteam MY*\n\n';
  if (thisWeek.length === 0) {
    msg += 'No events this week. Stay tuned!\n';
  } else {
    thisWeek.forEach(e => {
      msg += `🔹 *${e.title}* — ${e.date} ${e.time}\n`;
    });
  }
  msg += '\n📅 Full calendar: https://lu.ma/mysuperteam';
  await sendToBothGroups(msg);
}

async function sendToBothGroups(msg) {
  const opts = { parse_mode: 'Markdown' };
  const publicId = Number(process.env.PUBLIC_GROUP_ID);
  const circleId = Number(process.env.MEMBER_CIRCLE_ID);

  if (publicId) {
    try { await bot.telegram.sendMessage(publicId, msg, opts); }
    catch (err) { console.error('[Events] Public group send failed:', err.message); }
  }
  if (circleId) {
    try { await bot.telegram.sendMessage(circleId, msg, opts); }
    catch (err) { console.error('[Events] Member circle send failed:', err.message); }
  }
}

module.exports = { init, fetchEvents, handleEvents, handleNextEvent, checkReminders, postWeeklyDigest };
