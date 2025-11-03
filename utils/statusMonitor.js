const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isGiveAdmin } = require('./permissions');

const DEFAULT_INTERVAL_MS = 30 * 1000;
const PLAYERS_INTERVAL_MS = 5 * 1000;

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

      const serverName = "Dsync Dump";
      const maxPlayers = Number(serverMetrics.data?.maxPlayers) || 0;
      const currentPlayers = Number(serverMetrics.data?.playerCount) || 0;
      const version = serverMetrics.data?.version || 'unknown';
      const uptime = serverMetrics.data?.uptime || '0m';
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
        { name: 'Status', value: '**<:offline_ids:1408889453698748539> Offline**', inline: false },
        { name: 'Connect (F8)', value: `\`\`\`connect ${this.ip}:${this.port}\`\`\``, inline: false },
      );
      return embed;
    }

    const uptimeText = status.uptime || '0m';

    embed.addFields(
      { name: 'Status', value: '**<a:GreenDot:1408889190946570260> Online**', inline: false },
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
let playersMonitors = new Map(); // channelId -> monitor

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

class FiveMPlayersMonitor {
  constructor(client, channelId) {
    this.client = client;
    this.channelId = channelId;
    this.url = null;
    this.messageIds = []; // Array of message IDs for multiple embeds
    this.timer = null;
    this.intervalMs = PLAYERS_INTERVAL_MS;
  }

  setUrl(url) {
    this.url = url;
  }

  setChannel(channelId) {
    this.channelId = channelId;
    persistPlayersConfig(channelId, { url: this.url, messageId: this.messageId });
  }

  setMessages(messageIds) {
    this.messageIds = messageIds;
    persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.update().catch(() => {}), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async fetchPlayersData() {
    if (!this.url) return { online: false };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      console.log(`[PLAYERS] Fetching players.json -> ${this.url}`);
      const res = await fetch(this.url, { signal: controller.signal });
      console.log(`[PLAYERS] players.json HTTP status: ${res.status}`);
      if (!res.ok) throw new Error(`players.json HTTP ${res.status}`);
      const players = await res.json();
      console.log(`[PLAYERS] players.json length: ${Array.isArray(players) ? players.length : 'N/A'}`);

      return {
        online: true,
        players: Array.isArray(players) ? players : [],
      };
    } catch (err) {
      console.error('[PLAYERS] Error fetching players.json:', err?.message || err);
      return { online: false };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  buildEmbeds(data) {
    const color = data.online ? 0x57F287 : 0xED4245; // green/red
    const embeds = [];

    if (!data.online) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('FiveM Server Players')
        .setThumbnail('https://kishann.x02.me/i/5ZVW.png')
        .setTimestamp(new Date())
        .addFields(
          { name: 'Status', value: '**<:offline_ids:1408889453698748539> Server Offline**', inline: false },
        );
      embeds.push(embed);
      return embeds;
    }

    const players = data.players;
    const playerCount = players.length;

    // Sort players by ID
    const sortedPlayers = players
      .sort((a, b) => (a.id || 0) - (b.id || 0))
      .map(p => `${p.id || 'N/A'}: ${p.name || 'Unknown'}`);

    // Split into chunks of 20 players each
    const chunks = [];
    for (let i = 0; i < sortedPlayers.length; i += 20) {
      chunks.push(sortedPlayers.slice(i, i + 20));
    }

    // Create embeds for each chunk
    chunks.forEach((chunk, index) => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(index === 0 ? 'FiveM Server Players' : `FiveM Server Players (Page ${index + 1})`)
        .setThumbnail('https://kishann.x02.me/i/5ZVW.png')
        .setTimestamp(new Date());

      if (index === 0) {
        embed.addFields(
          { name: 'Status', value: '**<a:GreenDot:1408889190946570260> Online**', inline: false },
          { name: 'Players Online', value: `${playerCount}`, inline: true },
          { name: 'Last Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        );
      }

      const playerList = chunk.join('\n');
      embed.addFields({
        name: index === 0 ? 'Player List' : `Players (Page ${index + 1})`,
        value: playerCount > 0 ? `\`\`\`${playerList}\`\`\`` : 'No players online',
        inline: false
      });

      embeds.push(embed);
    });

    // If no players, create a single embed
    if (chunks.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('FiveM Server Players')
        .setThumbnail('https://kishann.x02.me/i/5ZVW.png')
        .setTimestamp(new Date())
        .addFields(
          { name: 'Status', value: '**<a:GreenDot:1408889190946570260> Online**', inline: false },
          { name: 'Players Online', value: `${playerCount}`, inline: true },
          { name: 'Last Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          { name: 'Player List', value: 'No players online', inline: false }
        );
      embeds.push(embed);
    }

    return embeds;
  }

  async ensureMessages() {
    if (!this.channelId) return [];
    const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return [];

    const messages = [];
    const placeholders = [];

    // Check existing messages
    for (let i = 0; i < this.messageIds.length; i++) {
      const msgId = this.messageIds[i];
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) {
        messages.push(msg);
      } else {
        // Message was deleted, we'll recreate later
        this.messageIds.splice(i, 1);
        i--;
      }
    }

    // If no messages exist, create initial placeholder
    if (messages.length === 0) {
      const placeholder = await channel.send({ content: 'Initializing players monitor...' });
      placeholders.push(placeholder);
      this.messageIds = [placeholder.id];
      persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
    }

    return messages.length > 0 ? messages : placeholders;
  }

  async update() {
    try {
      const data = await this.fetchPlayersData();
      if (data.online) {
        console.log(`[PLAYERS] Update: ${data.players.length} players online`);
      } else {
        console.log('[PLAYERS] Update: server OFFLINE');
      }

      const embeds = this.buildEmbeds(data);
      const currentMessages = await this.ensureMessages();

      // Adjust number of messages based on required embeds
      const requiredMessages = embeds.length;

      if (currentMessages.length < requiredMessages) {
        // Need more messages
        const channel = await this.client.channels.fetch(this.channelId);
        for (let i = currentMessages.length; i < requiredMessages; i++) {
          const newMsg = await channel.send({ content: 'Loading...' });
          currentMessages.push(newMsg);
          this.messageIds.push(newMsg.id);
        }
        persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
      } else if (currentMessages.length > requiredMessages) {
        // Need fewer messages, delete extras
        for (let i = requiredMessages; i < currentMessages.length; i++) {
          try {
            await currentMessages[i].delete();
          } catch (err) {
            // Ignore "Unknown Message" errors as the message might already be deleted
            if (!err?.message?.includes('Unknown Message')) {
              console.error('[PLAYERS] Failed to delete message:', err?.message || err);
            }
          }
        }
        this.messageIds = this.messageIds.slice(0, requiredMessages);
        currentMessages.splice(requiredMessages);
        persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
      }

      // Update all messages with their corresponding embeds
      for (let i = 0; i < currentMessages.length; i++) {
        try {
          await currentMessages[i].edit({ content: '', embeds: [embeds[i]] });
        } catch (err) {
          // Ignore "Unknown Message" errors as the message might have been deleted
          if (!err?.message?.includes('Unknown Message')) {
            console.error('[PLAYERS] Failed to edit message:', err?.message || err);
          }
        }
      }
    } catch (err) {
      console.error('[PLAYERS] Update error:', err?.message || err);
    }
  }
}

function getPlayersMonitor(client, channelId) {
  if (!playersMonitors.has(channelId)) {
    playersMonitors.set(channelId, new FiveMPlayersMonitor(client, channelId));
  }
  return playersMonitors.get(channelId);
}

function stopPlayersMonitor(channelId) {
  const monitor = playersMonitors.get(channelId);
  if (monitor) {
    monitor.stop();
    playersMonitors.delete(channelId);
    return true;
  }
  return false;
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

  return message.reply(`✅ Status monitor configured for <#${channelId}>. Updating every 30 seconds.`);
}

module.exports = {
  getMonitor,
  getPlayersMonitor,
  stopPlayersMonitor,
  handleStatusCommand,
  // Expose helper used on startup
  loadPersistedConfig: readConfigSafely,
};


// -------------------- Persistence helpers --------------------
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'statusConfig.json');
const PLAYERS_CONFIG_PATH = path.join(__dirname, '..', 'data', 'playersConfig.json');

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

function readPlayersConfigSafely() {
  try {
    const raw = fs.readFileSync(PLAYERS_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed || {};
  } catch (_) {
    return {};
  }
}

function persistPlayersConfig(channelId, { url, messageIds }) {
  try {
    const dir = path.dirname(PLAYERS_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existing = readPlayersConfigSafely();
    existing[channelId] = {
      url: url ?? existing[channelId]?.url,
      messageIds: messageIds ?? existing[channelId]?.messageIds ?? [],
    };
    fs.writeFileSync(PLAYERS_CONFIG_PATH, JSON.stringify(existing, null, 2), 'utf8');
  } catch (err) {
    console.error('[PLAYERS] Failed to persist config:', err?.message || err);
  }
}

FiveMPlayersMonitor.prototype.resumeFromStorage = async function resumeFromStorage() {
  const saved = readPlayersConfigSafely();
  const config = saved[this.channelId];
  if (config) {
    if (config.url) this.url = config.url;
    if (config.messageIds) this.messageIds = config.messageIds;
    // Ensure messages exist or create new placeholders (and persist them)
    if (this.channelId) {
      await this.ensureMessages();
    }
  }
};

