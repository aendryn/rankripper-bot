# RankRipper Challonge Rankings Discord Bot

A Discord bot that fetches and displays Elo rankings from [Challonge](https://challonge.com) community ranking pools. Supports multiple pools, automatic URL resolution, and paginated results.

---

## Features

- 📊 Display rankings from any Challonge community ranking pool
- ➕ Add pools with just the base Challonge ranking URL
- 💾 Pools persist between restarts via a local `pools.json` file
- 📄 Automatically fetches all pages for large ranking pools
- 🔘 Interactive button UI for selecting and removing pools
- 💬 Splits long rankings across multiple messages to respect Discord's 2000 character limit

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher (for built-in `fetch`)
- A Discord bot token

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/aendryn/rankripper-bot.git
cd rankripper-bot
```

### 2. Install dependencies

```bash
npm install discord.js
```

### 3. Configure the bot

Open `rankripper.js` and set your bot token at the top of the file:

```js
const BOT_TOKEN = "YOUR_BOT_TOKEN_HERE";
```

### 4. Create a Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Go to the **Bot** tab and click **Add Bot**
4. Copy the token and paste it into `rankripper.js`
5. Under **Privileged Gateway Intents**, enable **Message Content Intent**
6. Go to **OAuth2 → URL Generator**, select the `bot` scope, and grant these permissions:
   - Read Messages / View Channels
   - Send Messages
7. Open the generated URL in your browser to invite the bot to your server

### 5. Run the bot

```bash
node rankripper.js
```

---

## Commands

| Command | Description |
|---|---|
| `!rankings` | Show a pool picker and display rankings |
| `!rankings add <url>` | Add a new ranking pool |
| `!rankings list` | List all configured pools |
| `!rankings remove` | Show a picker to remove a pool |

---

## Adding a Ranking Pool

The bot accepts two URL formats:

**Base ranking URL** (recommended — copy straight from your browser after navigiating to rankings table):
```
!rankings add https://challonge.com/communities/<community_id>/rankings?id=<ranking_id>&team_size=1
```

**Direct JSON URL** (see below if you need to retrieve this manually):
```
!rankings add https://challonge.com/api/iris/community/rankings/<ranking_id>/stats/<stat_id>.json?team_size=1&page=1&search=&community_id=<community_id>
```

When given a base URL, the bot automatically resolves the internal API endpoint by fetching the community's seasons data — no manual digging required.

The pool name is read directly from the Challonge API and saved automatically.

---

## Manually Retrieving the JSON URL

If the automatic URL resolution fails, you can find the direct JSON URL yourself using your browser's developer tools:

1. Open your Challonge community rankings page in your browser
2. Navigate to the ranking pool you want (click through until the rankings table is visible)
3. Open **DevTools** (`F12` or right-click → Inspect)
4. Go to the **Network** tab and filter by **Fetch/XHR**
5. Look for a request matching this pattern:
   ```
   /api/iris/community/rankings/<ranking_id>/stats/<stat_id>.json
   ```
6. Click on it and copy the full request URL from the **Headers** tab
7. Use that URL with `!rankings add <url>`

---

## How It Works

1. When a pool is added via a base URL, the bot calls Challonge's `seasons.json` endpoint for the community to discover the internal `ranking_stat_id`, then constructs and stores the correct API URL.
2. When rankings are requested, the bot fetches all pages of the ranking in parallel and merges the results.
3. Player names are resolved by cross-referencing `ranking_member` IDs in the `included` array of the API response.
4. Results are displayed in a formatted table, split across multiple messages if needed.

---

## File Structure

```
rankripper-bot/
├── rankripper.js        # Main bot file
├── pools.json    # Auto-generated — stores configured ranking pools
└── README.md
```

---

## License

MIT
