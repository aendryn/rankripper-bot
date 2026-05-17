// RankRipper Challonge Rankings Discord Bot
// Run with: node rankripper.js
//
// Commands:
//   !rankings                  - Pick a pool and display rankings
//   !rankings add <url>        - Add a ranking pool (accepts base URL or direct JSON URL)
//   !rankings remove           - Pick a pool to remove
//   !rankings list             - List all configured pools

import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_TOKEN = "YOUR_BOT_TOKEN_HERE";
const COMMAND_PREFIX = "!rankings";
const POOLS_FILE = "./pools.json";
// ─────────────────────────────────────────────────────────────────────────────

function loadPools() {
  if (!existsSync(POOLS_FILE)) return [];
  try { return JSON.parse(readFileSync(POOLS_FILE, "utf-8")); }
  catch { return []; }
}

function savePools(pools) {
  writeFileSync(POOLS_FILE, JSON.stringify(pools, null, 2), "utf-8");
}

const FETCH_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://challonge.com/",
  Origin: "https://challonge.com",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

async function fetchJson(url) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

// ── URL resolution ────────────────────────────────────────────────────────────
//
// Accepts either:
//   A) Base ranking URL:
//      https://challonge.com/communities/<community_id>/rankings?id=<ranking_id>&team_size=<n>
//
//   B) Direct JSON URL (already resolved):
//      https://challonge.com/api/iris/community/rankings/<ranking_id>/stats/<stat_id>.json?...

function isDirectJsonUrl(url) {
  return url.includes("/api/iris/community/rankings/") && url.includes("/stats/");
}

async function resolveJsonUrl(inputUrl) {
  if (isDirectJsonUrl(inputUrl)) {
    return inputUrl.replace(/page=\d+/, "page=1");
  }

  // Parse the base ranking URL
  const parsed = new URL(inputUrl);
  const communityId = parsed.pathname.split("/communities/")[1]?.split("/")[0];
  const rankingId = parsed.searchParams.get("id");
  const teamSize = parsed.searchParams.get("team_size") ?? "1";

  if (!communityId || !rankingId) {
    throw new Error(
      "Could not extract community ID or ranking ID from URL.\n" +
      "Expected: `https://challonge.com/communities/<id>/rankings?id=<ranking_id>`"
    );
  }

  // Fetch the seasons endpoint — this lists all rankings including their stat IDs
  const seasonsUrl = `https://challonge.com/api/iris/community/seasons.json?community_id=${communityId}`;
  const seasonsJson = await fetchJson(seasonsUrl);

  // Find the matching ranking in standalone_rankings
  const rankings = seasonsJson?.standalone_rankings?.data ?? [];
  const ranking = rankings.find((r) => r.id === rankingId);

  if (!ranking) {
    throw new Error(
      `Could not find ranking ID ${rankingId} in the community's rankings list.\n` +
      `Available IDs: ${rankings.map((r) => r.id).join(", ") || "none"}`
    );
  }

  const statId = ranking.relationships?.ranking_stats?.data?.[0]?.id;
  if (!statId) {
    throw new Error(`Ranking ${rankingId} has no stat IDs associated with it.`);
  }

  return (
    `https://challonge.com/api/iris/community/rankings/${rankingId}/stats/${statId}.json` +
    `?team_size=${teamSize}&page=1&search=&community_id=${communityId}`
  );
}
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllPages(baseUrl) {
  const firstPage = await fetchJson(baseUrl);
  const totalPages = firstPage.meta?.total_pages ?? 1;

  const allData = [...firstPage.data];
  const allIncluded = [...firstPage.included];

  if (totalPages > 1) {
    const pageUrls = Array.from({ length: totalPages - 1 }, (_, i) =>
      baseUrl.replace(/page=\d+/, `page=${i + 2}`)
    );
    const pages = await Promise.all(pageUrls.map(fetchJson));
    for (const page of pages) {
      allData.push(...page.data);
      allIncluded.push(...page.included);
    }
  }

  return { data: allData, included: allIncluded, meta: firstPage.meta };
}

function extractPoolName(json) {
  const member = json.included?.find((i) => i.type === "ranking_member");
  return member?.attributes?.ranking_name ?? "Unknown Ranking";
}

function parseRankings({ data, included }) {
  const memberAliases = {};
  for (const item of included) {
    if (item.type === "ranking_member") {
      const aliases = item.attributes.aliases;
      memberAliases[item.id] = (Array.isArray(aliases) ? aliases[0] : aliases) ?? "Unknown";
    }
  }
  return data.map((entry) => ({
    rank: entry.attributes.rank,
    elo: entry.attributes.data.elo_rating,
    name: memberAliases[entry.relationships.ranking_member.data.id] ?? "Unknown",
  }));
}

function formatRankings(rankings, label) {
  const header = [`📊 **${label}**`, "```", "Rank Name                      Elo", "─".repeat(38)].join("\n");
  const footer = "```";
  const lines = rankings.map(({ rank, name, elo }) => `${String(rank).padEnd(4)} ${name.padEnd(25)} ${elo}`);

  const messages = [];
  let current = header + "\n";
  for (const line of lines) {
    if ((current + line + "\n" + footer).length > 1990) {
      messages.push(current + footer);
      current = "```\n" + line + "\n";
    } else {
      current += line + "\n";
    }
  }
  messages.push(current + footer);
  return messages;
}

function buildPoolButtons(pools, customIdPrefix = "show") {
  const rows = [];
  for (let i = 0; i < Math.min(pools.length, 25); i++) {
    if (i % 5 === 0) rows.push(new ActionRowBuilder());
    rows[rows.length - 1].addComponents(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:${pools[i].id}`)
        .setLabel(pools[i].label)
        .setStyle(customIdPrefix === "remove" ? ButtonStyle.Danger : ButtonStyle.Primary)
    );
  }
  return rows;
}

async function fetchAndSend(channel, pool, interaction = null) {
  try {
    const combined = await fetchAllPages(pool.url);
    const rankings = parseRankings(combined);
    const messages = formatRankings(rankings, pool.label);

    if (interaction) {
      await interaction.editReply(messages[0]);
      for (const msg of messages.slice(1)) await interaction.followUp(msg);
    } else {
      for (const msg of messages) await channel.send(msg);
    }
  } catch (err) {
    console.error("Error fetching rankings:", err.message);
    const errMsg = "❌ Failed to fetch rankings. Please try again later.";
    if (interaction) await interaction.editReply(errMsg);
    else await channel.send(errMsg);
  }
}

// ── Bot ───────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(COMMAND_PREFIX)) return;

  const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
  const subcommand = args[0]?.toLowerCase();

  // !rankings add <url>
  if (subcommand === "add") {
    const inputUrl = args[1];
    if (!inputUrl) return message.reply("Please provide a URL: `!rankings add <url>`");

    const statusMsg = await message.reply("⏳ Resolving ranking URL...");
    try {
      const jsonUrl = await resolveJsonUrl(inputUrl);
      await statusMsg.edit("⏳ Fetching ranking info...");

      const firstPage = await fetchJson(jsonUrl);
      const name = extractPoolName(firstPage);
      const totalCount = firstPage.meta?.total_count ?? "?";

      const pools = loadPools();
      if (pools.some((p) => p.url === jsonUrl)) {
        return statusMsg.edit("⚠️ That ranking pool is already in the list.");
      }

      pools.push({ id: `pool_${Date.now()}`, label: name, url: jsonUrl });
      savePools(pools);
      await statusMsg.edit(`✅ Added **${name}** (${totalCount} players) to the rankings list.`);
    } catch (err) {
      console.error(err);
      await statusMsg.edit(`❌ Failed to add ranking: ${err.message}`);
    }
    return;
  }

  // !rankings remove
  if (subcommand === "remove") {
    const pools = loadPools();
    if (pools.length === 0) return message.reply("No ranking pools configured yet. Add one with `!rankings add <url>`.");
    return message.reply({ content: "Which pool would you like to remove?", components: buildPoolButtons(pools, "remove") });
  }

  // !rankings list
  if (subcommand === "list") {
    const pools = loadPools();
    if (pools.length === 0) return message.reply("No ranking pools configured yet. Add one with `!rankings add <url>`.");
    const list = pools.map((p, i) => `${i + 1}. **${p.label}**`).join("\n");
    return message.reply(`📋 **Configured ranking pools:**\n${list}`);
  }

  // !rankings
  const pools = loadPools();
  if (pools.length === 0) return message.reply("No ranking pools configured yet. Add one with `!rankings add <url>`.");
  if (pools.length === 1) return fetchAndSend(message.channel, pools[0]);
  return message.channel.send({ content: "Which ranking pool would you like to see?", components: buildPoolButtons(pools, "show") });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [prefix, poolId] = interaction.customId.split(":");
  const pools = loadPools();
  const pool = pools.find((p) => p.id === poolId);
  if (!pool) return interaction.reply({ content: "⚠️ Pool not found.", ephemeral: true });

  if (prefix === "show") {
    await interaction.deferReply();
    await fetchAndSend(interaction.channel, pool, interaction);
  }

  if (prefix === "remove") {
    savePools(pools.filter((p) => p.id !== poolId));
    await interaction.reply({ content: `🗑️ Removed **${pool.label}** from the rankings list.`, ephemeral: true });
  }
});

client.login(BOT_TOKEN);
