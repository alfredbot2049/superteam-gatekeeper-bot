const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/bot.sqlite');
const fs = require('fs');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    intro_completed INTEGER DEFAULT 0,
    last_active INTEGER,
    activity_score INTEGER DEFAULT 0,
    days_inactive INTEGER DEFAULT 0,
    group_type TEXT DEFAULT 'public',
    joined_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    message TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS events_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    luma_id TEXT,
    title TEXT,
    date TEXT,
    time TEXT,
    location TEXT,
    link TEXT,
    reminded_24h INTEGER DEFAULT 0,
    reminded_1h INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS security_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    details TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS nudge_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    sent_date INTEGER,
    response_status TEXT DEFAULT 'pending'
  );

  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_group ON users(group_type);
`);

// Prepared statements for performance
const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (id, username, first_name, intro_completed, group_type, joined_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = COALESCE(excluded.username, users.username),
      first_name = COALESCE(excluded.first_name, users.first_name)
  `),
  getUser: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  updateIntroStatus: db.prepare('UPDATE users SET intro_completed = ? WHERE id = ?'),
  updateLastActive: db.prepare('UPDATE users SET last_active = ? WHERE id = ?'),
  flagInactive: db.prepare('UPDATE users SET days_inactive = ? WHERE id = ?'),
  logActivity: db.prepare('INSERT INTO activity_log (user_id, type, message, timestamp) VALUES (?, ?, ?, ?)'),
  logSecurityFlag: db.prepare('INSERT INTO security_flags (user_id, type, details, timestamp) VALUES (?, ?, ?, ?)'),
  logNudge: db.prepare("INSERT INTO nudge_history (user_id, sent_date, response_status) VALUES (?, ?, 'pending')"),
};

module.exports = {
  upsertUser(id, username, introCompleted = 0, firstName = '', groupType = 'public') {
    stmts.upsertUser.run(id, username, firstName, introCompleted, groupType, Date.now());
  },

  getUser(id) {
    return stmts.getUser.get(id);
  },

  getUserByUsername(username) {
    return stmts.getUserByUsername.get(username);
  },

  updateIntroStatus(id, completed) {
    stmts.updateIntroStatus.run(completed ? 1 : 0, id);
  },

  logActivity(userId, type, message) {
    const now = Date.now();
    stmts.logActivity.run(userId, type, message, now);
    stmts.updateLastActive.run(now, userId);
  },

  getActivityLogs(userId, days = 30) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return db.prepare('SELECT * FROM activity_log WHERE user_id = ? AND timestamp > ? ORDER BY timestamp DESC')
      .all(userId, since);
  },

  getLastActive(userId) {
    const row = db.prepare('SELECT last_active FROM users WHERE id = ?').get(userId);
    return row ? row.last_active : 0;
  },

  flagInactive(userId, days) {
    stmts.flagInactive.run(days, userId);
  },

  getInactiveUsers(minDays) {
    return db.prepare('SELECT * FROM users WHERE days_inactive >= ? ORDER BY days_inactive DESC').all(minDays);
  },

  getAllUsers() {
    return db.prepare('SELECT * FROM users').all();
  },

  getMemberCircleUsers() {
    return db.prepare("SELECT * FROM users WHERE group_type = 'member'").all();
  },

  // Events
  cacheEvents(events) {
    db.prepare('DELETE FROM events_cache').run();
    const insert = db.prepare('INSERT INTO events_cache (luma_id, title, date, time, location, link) VALUES (?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((evts) => {
      for (const e of evts) {
        insert.run(e.luma_id || '', e.title, e.date, e.time, e.location || '', e.link || '');
      }
    });
    insertMany(events);
  },

  getCachedEvents() {
    return db.prepare('SELECT * FROM events_cache ORDER BY date ASC').all();
  },

  markEventReminded(id, type) {
    const col = type === '24h' ? 'reminded_24h' : 'reminded_1h';
    db.prepare(`UPDATE events_cache SET ${col} = 1 WHERE id = ?`).run(id);
  },

  // Security
  logSecurityFlag(userId, type, details = '') {
    stmts.logSecurityFlag.run(userId, type, details, Date.now());
  },

  getSecurityFlags(limit = 20) {
    return db.prepare(`
      SELECT sf.*, u.username FROM security_flags sf
      LEFT JOIN users u ON sf.user_id = u.id
      ORDER BY sf.timestamp DESC LIMIT ?
    `).all(limit);
  },

  // Nudge
  logNudge(userId) {
    stmts.logNudge.run(userId, Date.now());
  },

  // Stats
  getPendingIntros() {
    return db.prepare("SELECT * FROM users WHERE intro_completed = 0 AND group_type = 'public'").all();
  },

  getUserCount() {
    return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  },

  getCompletedIntroCount() {
    return db.prepare('SELECT COUNT(*) as count FROM users WHERE intro_completed = 1').get().count;
  },

  getMessageCount(userId) {
    return db.prepare('SELECT COUNT(*) as count FROM activity_log WHERE user_id = ?').get(userId).count;
  },

  getTopActive(limit = 10) {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return db.prepare(`
      SELECT u.username, u.first_name, COUNT(a.id) as score
      FROM users u LEFT JOIN activity_log a ON u.id = a.user_id AND a.timestamp > ?
      WHERE u.group_type = 'member'
      GROUP BY u.id ORDER BY score DESC LIMIT ?
    `).all(since, limit);
  },

  getActiveUsersCount(days) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return db.prepare('SELECT COUNT(*) as count FROM users WHERE last_active > ?').get(since).count;
  },

  getRecentMessages(userId, count = 5) {
    return db.prepare('SELECT message FROM activity_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?')
      .all(userId, count).map(r => r.message);
  },

  close() {
    db.close();
  }
};
