# 🛡️ Superteam Malaysia — Gatekeeper Bot

A Telegram bot that manages community onboarding, enforces intro-based access control, monitors group health, and integrates with Luma events for Superteam Malaysia.

---

## How It Works

```
New member joins
       │
       ▼
┌─────────────────────────┐
│  Bot detects join event  │
│  Tracks user in database │
│  intro_completed = false │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────┐
│  Welcome message sent           │
│  1. Try DM first                │
│  2. Fallback: post in Intros    │
│     topic with pin              │
└───────────┬─────────────────────┘
            │
            ▼
  ┌─────────────────────────┐
  │  User posts in a topic  │
  └─────────┬───────────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
  Intros?      Other topic?
     │             │
     ▼             ▼
  Validate    Auto-delete msg
  intro       + 10s reminder
     │        pointing to
     ▼        Intros topic
  Valid?
  ┌──┴──┐
  ▼     ▼
 Yes    No
  │     └── Wait for
  │         valid intro
  ▼
 Mark complete
 Confirmation msg
 Full access granted ✅
```

### Intro Validation

An intro is accepted if it meets **either** condition:
- 50+ characters long, **or**
- 3+ non-empty lines

This prevents one-word messages while allowing natural intro formats.

### Access Enforcement

Until a user completes their intro:
- Messages in **any topic except Intros** are automatically deleted
- A reminder is posted (auto-deletes after 10 seconds) directing them to the Intros topic
- Once the intro is accepted, the user can post freely everywhere

---

## Features

### Core: Gatekeeper Onboarding
- New member detection and tracking
- Welcome message (DM-first, in-group fallback to Intros topic)
- Intro validation with configurable thresholds
- Auto-delete enforcement outside Intros topic
- Admin commands: `/approve`, `/reset`, `/status`, `/stats`

### Luma Events Integration
- `/events` — List upcoming Superteam MY events from Luma
- `/nextevent` — Show the next upcoming event
- Weekly event digest via cron
- Event reminders before start time
- Fallback to seeded events if Luma API is unavailable

### Activity Monitoring
- Per-user message tracking and activity scoring
- `/top` — Leaderboard of most active contributors
- `/inactive` — Members inactive for 14+ days
- `/purge_candidates` — Members inactive for 60+ days
- `/member @user` — Detailed member activity profile

### Security
- Spam detection (repeated messages, link flooding)
- Scam pattern matching
- `/security` — View current security flags and alerts

### Admin Tools
- `/help` — Full command list (admins see extra commands)
- `/health` — Group health overview (total members, active %, trend)
- `/report` — Comprehensive activity report (Member Circle only)
- `/nudge @user` → `/confirm_nudge [id]` — Send re-engagement DM to inactive members

### Dual-Group Support
- **Public Group** — Gatekeeper flow, events, basic commands
- **Member Circle** — Admin reporting, activity analysis, purge management
- Bot runs in both groups simultaneously, auto-detects which group via chat ID

---

## Setup

### Prerequisites
- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### BotFather Configuration

1. Create bot via `/newbot` in BotFather
2. Disable privacy mode: Bot Settings → Group Privacy → Turn Off
3. Enable admin rights: Bot Settings → Group Admin Rights → Enable all
4. Add bot to your group as **admin** with "Restrict Members" and "Delete Messages" permissions

### Installation

```bash
git clone https://github.com/alfredbot2049/superteam-gatekeeper-bot.git
cd superteam-gatekeeper-bot
npm install
cp .env.example .env
```

### Environment Variables

Edit `.env`:

```
BOT_TOKEN=your_bot_token_from_botfather
PUBLIC_GROUP_ID=-100xxxxxxxxxx
MEMBER_CIRCLE_ID=-100yyyyyyyyyy
ADMIN_IDS=123456789,987654321
```

- `BOT_TOKEN` — From BotFather
- `PUBLIC_GROUP_ID` — Your public Superteam group (get from bot logs or @userinfobot)
- `MEMBER_CIRCLE_ID` — Your private member circle group (can be same as public for testing)
- `ADMIN_IDS` — Comma-separated Telegram user IDs for admin access

### Configuration

Edit `config.json`:

```json
{
  "introsTopicId": 36,
  "introValidation": {
    "minLength": 50,
    "minLines": 3
  }
}
```

- `introsTopicId` — The Telegram topic ID for your Intros topic. Enable Topics/Forum in group settings, create an "Intros" topic, then find the ID from the URL: `web.telegram.org/a/#-100xxxxx_TOPIC_ID`

### Run

```bash
npm start
```

### Docker

```bash
docker-compose up -d
```

Database is volume-mounted at `./data/` for persistence across restarts.

---

## File Structure

```
superteam-gatekeeper-bot/
├── src/
│   ├── index.js        — Entry point, middleware, command routing, cron jobs
│   ├── db.js           — SQLite database, 6 tables, prepared statements
│   ├── gatekeeper.js   — Onboarding flow, intro validation, access enforcement
│   ├── activity.js     — Message tracking, scoring, inactive detection
│   ├── events.js       — Luma API integration, reminders, weekly digest
│   ├── admin.js        — Admin commands, member management, reports
│   └── security.js     — Spam detection, scam patterns, security alerts
├── data/               — SQLite database (auto-created at runtime)
├── config.json         — Thresholds, templates, channel/topic IDs
├── package.json
├── Dockerfile          — Node 18 Alpine
├── docker-compose.yml  — With volume for database persistence
├── .env.example        — Environment variable template
└── README.md
```

---

## Commands

### Everyone
| Command | Description |
|---|---|
| `/help` | Show available commands |
| `/events` | List upcoming Superteam MY events |
| `/nextevent` | Show next upcoming event |

### Admin Only
| Command | Description |
|---|---|
| `/status` | Show members with pending intros |
| `/stats` | Intro completion rate and stats |
| `/health` | Group health (members, activity, trend) |
| `/security` | Security flags and alerts |
| `/approve @user` | Manually approve a member's intro |
| `/reset @user` | Reset a member's intro status |
| `/top` | Leaderboard of most active members |
| `/inactive` | List inactive members (14+ days) |
| `/member @user` | Detailed member activity profile |

### Member Circle Admin Only
| Command | Description |
|---|---|
| `/report` | Full activity report |
| `/purge_candidates` | Members inactive 60+ days |
| `/nudge @user` | Send re-engagement DM |
| `/confirm_nudge [id]` | Confirm and send the nudge |

---

## Tech Stack

- **Runtime:** Node.js 18
- **Bot Framework:** [Telegraf](https://github.com/telegraf/telegraf)
- **Database:** SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **HTTP:** [axios](https://github.com/axios/axios) (Luma API)
- **Scheduling:** [node-cron](https://github.com/node-cron/node-cron)
- **Config:** [dotenv](https://github.com/motdotla/dotenv)

---

## License

MIT
