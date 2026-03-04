# 🎵 Discord Music Bot

A self-hosted Discord music bot with Spotify-like AI autoplay, multi-source playback (YouTube / SoundCloud / Spotify), and one-command bootstrap.

---

## Features

- **Multi-source playback** — YouTube (primary) → SoundCloud → Spotify fallback chain
- **Spotify-like AI autoplay** — Analyzes genre, mood, energy of your session and recommends coherent tracks via OpenAI
- **Pre-fetch buffer** — 6 tracks queued ahead for instant transitions, background refill
- **Local algorithm fallback** — Artist similarity + collaborative filtering when AI is unavailable
- **Smart search matching** — Best-match scoring (penalizes remixes, karaoke, 8D audio, etc.)
- **Lavalink v4** with YouTube plugin, LavaSrc (Spotify/Apple Music/Deezer), LavaSearch, LavaLyrics
- **yt-dlp fallback** — Plays when Lavalink can't resolve
- **MongoDB persistence** — Saves volume, autoplay, loop mode, 24/7 per guild
- **One-command setup** — `node setup.js` installs everything and starts the bot
- **PM2 ready** — Auto-restart, memory limits, log rotation for VPS production

## Commands

| Music | System |
|---|---|
| `/play` `/skip` `/pause` `/resume` `/stop` | `/setup` — Create music request channel |
| `/queue` `/remove` `/move` `/shuffle` | `/help` — List all commands |
| `/volume` `/loop` `/seek` `/lyrics` | `/shutdown` — Stop bot + Lavalink (admin) |
| `/nowplaying` `/autoplay` `/247` `/disconnect` | |

---

## Quick Start

### One command (interactive)

```bash
npm start
```

Prompts for `BOT_TOKEN` and `CLIENT_ID`, then auto-installs Java, yt-dlp, MongoDB (Docker), Lavalink, npm deps, syncs slash commands, and starts the bot.

### Full auto (headless / CI)

```bash
BOT_TOKEN=your_token CLIENT_ID=your_client_id npm run bootstrap
```

### Development

```bash
npm run dev    # Starts bot with --watch (auto-reload on changes)
```

---

## VPS Deployment Guide

### Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| **OS** | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04+ |
| **RAM** | 1 GB | 2 GB+ |
| **CPU** | 1 vCPU | 2 vCPU |
| **Disk** | 2 GB free | 5 GB+ |
| **Node.js** | v18 | v20+ |
| **Java** | 17 (auto-installed) | 21 |

### Option A: Quick deploy (setup.js handles everything)

```bash
# 1. Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# 2. Clone and enter project
git clone <your-repo-url>
cd test

# 3. One-command bootstrap
BOT_TOKEN=your_token CLIENT_ID=your_client_id npm run bootstrap
```

`setup.js` automatically:
- Installs npm dependencies
- Installs Java 21 via apt
- Installs yt-dlp
- Starts MongoDB in Docker (or connects to configured URI)
- Downloads Lavalink.jar
- Generates `.env` with random Lavalink password
- Writes `application.yml` with all plugins
- Syncs slash commands globally
- Starts Lavalink, waits for ready, then starts the bot

### Option B: Production deploy with PM2 (recommended)

```bash
# 1. Install Node.js + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
npm install -g pm2

# 2. Clone and setup (without starting bot)
git clone <your-repo-url>
cd test
node setup.js --no-start

# 3. Start with PM2
pm2 start ecosystem.config.cjs

# 4. Auto-start on reboot
pm2 startup
pm2 save

# PM2 commands:
pm2 logs discord-music-bot       # View logs
pm2 restart discord-music-bot    # Restart
pm2 stop discord-music-bot       # Stop
pm2 monit                        # Live monitoring
```

### Option C: External Lavalink node

If you host Lavalink separately (or use a Lavalink hosting service):

```env
# .env
LAVALINK_HOST=your.lavalink.host
LAVALINK_PORT=2333
LAVALINK_PASSWORD=your_password
LAVALINK_MANAGE_LOCAL=false
```

Multi-node tiered fallback:

```env
LAVALINK_NODES=[{"name":"Primary","host":"node1.example.com","port":2333,"password":"pass"},{"name":"Backup","host":"node2.example.com","port":2333,"password":"pass"}]
```

---

## Stopping the Bot

| Method | Command |
|---|---|
| **Discord** | `/shutdown` (admin only) — stops players, Lavalink, exits process |
| **Terminal** | `npm stop` — kills bot, setup, and Lavalink processes |
| **PM2** | `pm2 stop discord-music-bot` |
| **Signal** | `Ctrl+C` or `kill <pid>` — graceful shutdown with player cleanup |

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Discord bot token from [Developer Portal](https://discord.com/developers/applications) |
| `CLIENT_ID` | Application/Client ID from Developer Portal |

### Optional

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/discord-music-bot` | MongoDB connection URI |
| `AI_API_KEY` | — | OpenAI API key for Spotify-like autoplay recommendations |
| `AI_MODEL` | `gpt-4o-mini` | OpenAI model to use |
| `SPOTIFY_CLIENT_ID` | — | Spotify API client ID (for Spotify link resolution) |
| `SPOTIFY_CLIENT_SECRET` | — | Spotify API client secret |
| `LAVALINK_HOST` | `127.0.0.1` | Lavalink server host |
| `LAVALINK_PORT` | `2333` | Lavalink server port |
| `LAVALINK_PASSWORD` | auto-generated | Lavalink server password |
| `LAVALINK_MANAGE_LOCAL` | `true` | Auto-start/manage local Lavalink |
| `LAVALINK_JAVA_OPTS` | `-Xms512M -Xmx1024M` | JVM options for Lavalink |
| `DEFAULT_VOLUME` | `80` | Default player volume (0-100) |
| `MAX_QUEUE_SIZE` | `500` | Maximum tracks per guild queue |

---

## AI Autoplay — How It Works

When the queue is empty and autoplay is enabled:

1. **AI Batch Recommendations** — Sends the full listening session (up to 20 tracks) to OpenAI. The prompt classifies the exact subgenre, mood, energy level, and era, then generates 8 coherent song recommendations that flow naturally (like Spotify's Song Radio).

2. **Local Algorithm Fallback** — When AI is unavailable or returns too few results, a collaborative-filtering-style algorithm generates queries using artist similarity, genre keyword extraction, and "fans also like" patterns.

3. **Trending Fallback** — AI-generated or curated trending tracks, filtered by genre proximity.

All recommendations are resolved through **YouTube → SoundCloud → Spotify** and scored with a best-match algorithm that penalizes remixes, covers, karaoke, nightcore, and other unwanted versions.

Results are **pre-buffered** (6 tracks ahead) for instant transitions with background refill.

---

## Architecture

```
setup.js              One-command bootstrap (installs everything)
ecosystem.config.cjs  PM2 process management config
src/
├── bot.js            Entry point, startup pipeline, graceful shutdown
├── loader.js         Auto-loads commands and events from filesystem
├── deploy-commands.js  Manual slash command registration
├── config/
│   ├── env.js        Environment validation and config object
│   └── lavalink.js   Lavalink node config + application.yml generation
├── database/
│   ├── connection.js  MongoDB connection with auto-reconnect
│   └── schemas/       Guild settings, trending tracks
├── music/
│   ├── playerManager.js   Shoukaku player lifecycle, queue orchestration
│   ├── queueManager.js    Per-guild queue with history, loop, shuffle
│   ├── autoplayEngine.js  Spotify-like buffer engine (AI + local algorithm)
│   ├── sourceResolver.js  Multi-source track resolution + yt-dlp fallback
│   └── lavalinkManager.js Auto-download/start/manage Lavalink process
├── ai/
│   ├── recommendationAI.js  OpenAI Spotify-grade recommendation engine
│   └── trendAnalyzer.js     Trending track cache (AI + curated fallback)
├── commands/
│   ├── music/         17 music commands
│   └── system/        help, setup, shutdown
├── events/            Discord event handlers
├── ui/                Player embed + control buttons
└── utils/             Logger, helpers, cooldowns
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| YouTube playback fails on VPS | YouTube blocks datacenter IPs. The bot uses `MUSIC` + `TVHTML5EMBEDDED` clients as fallback. Autoplay also tries SoundCloud and Spotify. |
| Lavalink won't start | Check Java: `java -version` (needs 17+). Check port: `ss -ltn \| grep 2333`. |
| Bot can't connect to Lavalink | Ensure Lavalink started first. `node setup.js` handles this automatically. |
| Autoplay picks random songs | Set `AI_API_KEY` in `.env` for genre-coherent AI recommendations. Without it, the local algorithm uses artist-similarity queries. |
| MongoDB connection failed | Bot works without MongoDB (settings won't persist). For local: `docker run -d --name mongo -p 27017:27017 mongo:7` |
| Slash commands not showing | Run `npm run deploy` or wait — `setup.js` syncs commands automatically on start. |
