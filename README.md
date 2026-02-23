# 🇲🇾 Superteam Malaysia Telegram Bot

A dual-mode Telegram bot for [Superteam Malaysia](https://my.superteam.fun/) that manages both the public community group (264 members) and the private Member Circle (19 vetted members).

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│              Telegram API               │
└─────────┬───────────────────┬───────────┘
          │                   │
    Public Group         Member Circle
          │                   │
   ┌──────┴──────┐    ┌──────┴──────┐
   │ Gatekeeper  │    │  Activity   │
   │ - Welcome   │    │  - Track    │
   │ - Gate msgs │    │  - Score    │
   │ - Validate  │    │  - Inactive │
   └─────────────┘    └─────────────┘
          │                   │
          └─────────┬─────────┘
                    │
            ┌───────┴───────┐
            │   Shared      │
            │ - Events/Luma │
            │ - Admin cmds  │
            │ - Security    │
            │ - SQLite DB   │
            └───────────────┘
```

## 🚀 Quick Setup for Admins

1. Create bot via [@BotFather](https://t.me/BotFather)
2. Add bot to your group
3. Make bot admin (**delete messages + ban users**)
4. Type `/setup` in the group
5. Bot auto-configures — done

---

## ✨ Features

### Mode 1: Public Group — Intro Gatekeeper
- **New member detection**: Automatically welcomes new members via DM (falls back to in-group)
- **Intro enforcement**: Gates access to main channels until user posts an intro in the Intros channel
- **Smart validation**: Checks intro length and structure (not literal keywords)
- **Auto-cleanup**: Deletes gated messages and sends self-deleting reminders (10s)

### Mode 2: Member Circle — Activity Monitor
- **Activity tracking**: Logs messages, links, and contribution types
- **Scoring**: Weekly activity score based on message count and quality
- **Inactive detection**: Flags members inactive 14+ days, escalates at 30+
- **Nudge system**: Admin-approved friendly DMs to inactive members
- **Purge candidates**: Identifies 60+ day inactive members for review

### Shared Features
- **Luma integration**: Fetches events from [lu.ma/mysuperteam](https://lu.ma/mysuperteam)
- **Event reminders**: 24h and 1h before each event (posted to both groups)
- **Weekly digest**: Monday morning summary of the week's events
- **Security monitoring**: Spam detection, link spam, scam pattern matching
- **Admin dashboard**: Comprehensive commands for group management

## 🤖 Commands

### Everyone
| Command | Description |
|---------|-------------|
| `/events` | Show upcoming events |
| `/nextevent` | Show next event |
| `/help` | List all commands |

### Admin — Public Group
| Command | Description |
|---------|-------------|
| `/reset @user` | Reset intro status |
| `/approve @user` | Manually approve user |
| `/status` | Show pending intros |
| `/stats` | Intro completion rate |

### Admin — Member Circle
| Command | Description |
|---------|-------------|
| `/report` | Full activity report |
| `/inactive` | List inactive members (14+ days) |
| `/top` | Top 10 contributors (30 days) |
| `/member @user` | Detailed member report |
| `/purge_candidates` | Members inactive 60+ days |
| `/nudge @user` | Send friendly reminder DM |
| `/health` | Group health overview |
| `/security` | Recent security flags |

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: [Telegraf](https://telegraf.js.org/) v4
- **Database**: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (synchronous, fast, zero-config)
- **Events**: [Luma API](https://lu.ma) integration
- **Scheduling**: [node-cron](https://github.com/node-cron/node-cron)
- **Deployment**: Docker + Docker Compose

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/superteam-gatekeeper-bot.git
cd superteam-gatekeeper-bot
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description | How to get |
|----------|-------------|------------|
| `BOT_TOKEN` | Telegram bot token | [@BotFather](https://t.me/BotFather) |
| `PUBLIC_GROUP_ID` | Public group chat ID | [@getidsbot](https://t.me/getidsbot) |
| `MEMBER_CIRCLE_ID` | Member circle chat ID | [@getidsbot](https://t.me/getidsbot) |
| `ADMIN_IDS` | Comma-separated admin user IDs | [@getidsbot](https://t.me/getidsbot) |
| `LUMA_CALENDAR_ID` | Luma calendar identifier | `mysuperteam` |

### 3. Configure Channels

Edit `config.json` with your actual channel/topic IDs:

```json
{
  "publicChannels": {
    "general": YOUR_GENERAL_TOPIC_ID,
    "intros": YOUR_INTROS_TOPIC_ID,
    ...
  }
}
```

### 4. Run

```bash
npm start
```

### 5. Docker (Production)

```bash
docker-compose up -d
```

## 📁 Project Structure

```
superteam-gatekeeper-bot/
├── src/
│   ├── index.js        # Entry point, routing, cron scheduling
│   ├── db.js           # SQLite database layer
│   ├── gatekeeper.js   # Intro validation & message gating
│   ├── activity.js     # Activity tracking & scoring
│   ├── events.js       # Luma integration & reminders
│   ├── admin.js        # Admin commands & reports
│   └── security.js     # Threat detection & alerts
├── data/               # SQLite database (auto-created)
├── config.json         # Channel IDs, thresholds, templates
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Member profiles, intro status, activity scores |
| `activity_log` | Message history for scoring |
| `events_cache` | Cached Luma events with reminder flags |
| `security_flags` | Security alerts and incidents |
| `nudge_history` | Nudge DM tracking |

## 🔒 Security Features

- **Spam detection**: Flags repeated identical messages
- **Link spam**: Flags excessive link posting
- **Scam patterns**: Detects common Web3 scam phrases
- **Admin alerts**: Real-time DM notifications to admins
- **Input validation**: All user inputs sanitized
- **Prepared statements**: SQL injection protection

## 🤝 Contributing

Built for [Superteam Malaysia](https://my.superteam.fun/) by the community.

## 📜 License

MIT
