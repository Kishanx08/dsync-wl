const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isGiveAdmin } = require('./permissions');

const DEFAULT_INTERVAL_MS = 60 * 1000;

class FiveMStatusMonitor {
  constructor(client, options) {
    this.client = client;
    this.ip = options.ip;
    this.port = options.port;
    this.domain = options.domain;
    this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    this.channelId = null;
    this.messageId = null;
    this.timer = null;
    this.lastKnownServerName = null;
  }

  getBaseUrl() {
    return `http://${this.ip}:${this.port}`;
  }

  setChannel(channelId) {
    this.channelId = channelId;
    persistConfig({ channelId: this.channelId, messageId: this.messageId });
  }

  setMessage(messageId) {
    this.messageId = messageId;
    persistConfig({ channelId: this.channelId, messageId: this.messageId });
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.update().catch(() => {}), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async fetchServerData() {
    // FiveM serverMetrics.json/players.json are served over HTTP, not HTTPS
    const base = this.getBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      console.log(`[STATUS] Fetching serverMetrics.json -> ${base}/op-framework/serverMetrics.json`);
      const serverMetricsRes = await fetch(`${base}/op-framework/serverMetrics.json`, { signal: controller.signal });
      console.log(`[STATUS] serverMetrics.json HTTP status: ${serverMetricsRes.status}`);
      if (!serverMetricsRes.ok) throw new Error(`serverMetrics.json HTTP ${serverMetricsRes.status}`);
      const serverMetrics = await serverMetricsRes.json();
      console.log(`[STATUS] serverMetrics.json parsed. Keys: ${Object.keys(serverMetrics || {}).join(', ')}`);

      // If we got here, server is considered online
      let players = [];
      try {
        console.log(`[STATUS] Fetching players.json -> ${base}/players.json`);
        const playersRes = await fetch(`${base}/players.json`, { signal: controller.signal });
        console.log(`[STATUS] players.json HTTP status: ${playersRes.status}`);
        if (playersRes.ok) {
          players = await playersRes.json();
          console.log(`[STATUS] players.json length: ${Array.isArray(players) ? players.length : 'N/A'}`);
        }
      } catch (err) {
        console.error('[STATUS] Error fetching/decoding players.json:', err?.message || err);
      }

      const serverName = this.domain || `${this.ip}:${this.port}`;
      const maxPlayers = Number(serverMetrics.maxClients) || 0;
      const currentPlayers = Number(serverMetrics.playerCount) || 0;
      const version = serverMetrics.version || 'unknown';
      const uptime = serverMetrics.uptime || '0m';
      console.log(`[STATUS] ONLINE. serverName="${serverName}", players=${currentPlayers}/${maxPlayers}, version=${version}, uptime=${uptime}`);

      // Remember last known server name for offline display
      this.lastKnownServerName = serverName;

      return {
        online: true,
        serverName,
        currentPlayers,
        maxPlayers,
        version,
        uptime,
      };
    } catch (err) {
      console.error('[STATUS] OFFLINE or fetch error:', err?.message || err);
      return { online: false };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  buildEmbed(status) {
    const color = status.online ? 0x57F287 : 0xED4245; // green/red
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(status.serverName || this.lastKnownServerName || this.domain || `${this.ip}:${this.port}`)
      .setThumbnail('https://kishann.x02.me/i/5ZVW.png')
      .setTimestamp(new Date());

    if (!status.online) {
      embed.addFields(
        { name: 'Status', value: '🔴 Offline', inline: false },
        { name: 'Connect (F8)', value: `\`\`\`connect ${this.ip}:${this.port}\`\`\``, inline: false },
      );
      return embed;
    }

    const uptimeText = status.uptime || '0m';

    embed.addFields(
      { name: 'Status', value: '🟢 Online', inline: false },
      { name: 'Players', value: `${status.currentPlayers} / ${status.maxPlayers}`, inline: true },
      { name: 'Uptime', value: `${uptimeText}`, inline: true },
      { name: 'Version', value: `${status.version}`, inline: true },
      { name: 'Last Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      { name: 'Connect (F8)', value: `\`\`\`connect ${this.ip}:${this.port}\`\`\``, inline: false },
    );

    return embed;
  }

  async fetchPlayersList() {
    const base = this.getBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${base}/players.json`, { signal: controller.signal });
      if (!res.ok) throw new Error(`players.json HTTP ${res.status}`);
      const players = await res.json();
      if (!Array.isArray(players)) return [];
      return players
        .map(p => (typeof p?.name === 'string' ? p.name.trim() : ''))
        .filter(name => name.length > 0);
    } catch (err) {
      console.error('[STATUS] Error fetching players list:', err?.message || err);
      return null; // null indicates an error/offline
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async ensureMessage() {
    if (!this.channelId) return null;
    const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return null;

    if (this.messageId) {
      const msg = await channel.messages.fetch(this.messageId).catch(() => null);
      if (msg) return msg;
    }

    const placeholder = await channel.send({ content: 'Initializing server status...' });
    this.messageId = placeholder.id;
    persistConfig({ channelId: this.channelId, messageId: this.messageId });
    return placeholder;
  }

  async update() {
    try {
      const status = await this.fetchServerData();
      if (status.online) {
        console.log('[STATUS] Update: server ONLINE');
      } else {
        console.log('[STATUS] Update: server OFFLINE');
      }

      const embed = this.buildEmbed(status);
      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('show_players')
          .setLabel('Players')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Connect')
          .setStyle(ButtonStyle.Link)
          .setURL('https://cfx.re/join/rzdaox')
      );
      const msg = await this.ensureMessage();
      if (!msg) return;
      await msg.edit({ content: '', embeds: [embed], components: [buttonsRow] });
    } catch (_) {}
  }
}

let monitorInstance = null;

function getMonitor(client) {
  if (!monitorInstance) {
    monitorInstance = new FiveMStatusMonitor(client, {
      ip: '172.105.48.231',
      port: 30124,
      domain: 'p408.fivem.opfw.me',
    });
  }
  return monitorInstance;
}

async function handleStatusCommand(message, args, client) {
  if (!isGiveAdmin(message.author.id)) {
    return message.reply('❌ You are not authorized to use this command.');
  }

  const channelMention = message.mentions.channels.first();
  const channelId = channelMention ? channelMention.id : null;
  if (!channelId) {
    return message.reply('Usage: `$status #channel`');
  }

  const monitor = getMonitor(client);
  monitor.setChannel(channelId);
  await monitor.update();
  monitor.start();

  return message.reply(`✅ Status monitor configured for <#${channelId}>. Updating every 1 minute.`);
}

module.exports = {
  getMonitor,
  handleStatusCommand,
  // Expose helper used on startup
  loadPersistedConfig: readConfigSafely,
};


// -------------------- Persistence helpers --------------------
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'statusConfig.json');

function readConfigSafely() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      channelId: typeof parsed?.channelId === 'string' ? parsed.channelId : null,
      messageId: typeof parsed?.messageId === 'string' ? parsed.messageId : null,
    };
  } catch (_) {
    return { channelId: null, messageId: null };
  }
}

function persistConfig({ channelId, messageId }) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existing = readConfigSafely();
    const data = {
      channelId: channelId ?? existing.channelId,
      messageId: messageId ?? existing.messageId,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[STATUS] Failed to persist config:', err?.message || err);
  }
}

FiveMStatusMonitor.prototype.resumeFromStorage = async function resumeFromStorage() {
  const saved = readConfigSafely();
  if (saved.channelId) this.channelId = saved.channelId;
  if (saved.messageId) this.messageId = saved.messageId;
  // Ensure message exists or create a new placeholder (and persist it)
  if (this.channelId) {
    await this.ensureMessage();
  }
};

