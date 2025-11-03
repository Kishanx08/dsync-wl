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
    this.lastUpdate = 0;
    this.updateInProgress = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
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
    console.log(`[PLAYERS] Starting monitor for channel ${this.channelId} with ${this.intervalMs}ms interval`);
    this.timer = setInterval(() => {
      if (!this.updateInProgress) {
        this.update().catch(err => {
          console.error('[PLAYERS] Unhandled update error:', err?.message || err);
          this.consecutiveErrors++;
          if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            console.error('[PLAYERS] Too many consecutive errors, stopping monitor');
            this.stop();
          }
        });
      } else {
        console.warn('[PLAYERS] Update already in progress, skipping...');
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      console.log(`[PLAYERS] Stopping monitor for channel ${this.channelId}`);
      clearInterval(this.timer);
      this.timer = null;
    }
    this.updateInProgress = false;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async fetchPlayersData() {
    if (!this.url) return { online: false };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased timeout
    try {
      console.log(`[PLAYERS] Fetching players.json -> ${this.url}`);
      const res = await fetch(this.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Discord-Bot/1.0',
          'Accept': 'application/json',
        },
        // Add retry logic for rate limits
        redirect: 'follow',
        follow: 3
      });
      console.log(`[PLAYERS] players.json HTTP status: ${res.status}`);

      if (res.status === 429) {
        // Rate limited, wait and retry once
        const retryAfter = res.headers.get('Retry-After') || '5';
        console.warn(`[PLAYERS] Rate limited, retrying after ${retryAfter} seconds`);
        await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
        return this.fetchPlayersData(); // Recursive retry
      }

      if (!res.ok) throw new Error(`players.json HTTP ${res.status}`);
      const players = await res.json();
      console.log(`[PLAYERS] players.json length: ${Array.isArray(players) ? players.length : 'N/A'}`);

      return {
        online: true,
        players: Array.isArray(players) ? players : [],
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('[PLAYERS] Request timed out');
      } else {
        console.error('[PLAYERS] Error fetching players.json:', err?.message || err);
      }
      return { online: false };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  buildEmbeds(data) {
    try {
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

      const players = data.players || [];
      const playerCount = players.length;

      // Validate players array
      if (!Array.isArray(players)) {
        console.error('[PLAYERS] Players data is not an array:', typeof players);
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('FiveM Server Players')
          .setDescription('Error: Invalid player data received')
          .setTimestamp(new Date());
        embeds.push(embed);
        return embeds;
      }

      // Sort players by ID
      const sortedPlayers = players
        .sort((a, b) => (a.id || 0) - (b.id || 0))
        .map(p => `${p.id || 'N/A'}: ${p.name || 'Unknown'}`);

      // Split into chunks of 40 players each (reduced to prevent size limits)
      const PLAYERS_PER_CHUNK = 40;
      const chunks = [];
      for (let i = 0; i < sortedPlayers.length; i += PLAYERS_PER_CHUNK) {
        chunks.push(sortedPlayers.slice(i, i + PLAYERS_PER_CHUNK));
      }

      // Create embeds for each chunk
      chunks.forEach((chunk, index) => {
        try {
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

          // Validate field value length (Discord limit is 1024 chars)
          const fieldValue = playerCount > 0 ? `\`\`\`${playerList}\`\`\`` : 'No players online';
          if (fieldValue.length > 1024) {
            console.warn(`[PLAYERS] Field value too long (${fieldValue.length} chars), truncating`);
            const truncatedList = chunk.slice(0, 10).join('\n'); // Show only first 10
            embed.addFields({
              name: index === 0 ? 'Player List' : `Players (Page ${index + 1})`,
              value: `\`\`\`${truncatedList}\`\`\`\n...and ${chunk.length - 10} more`,
              inline: false
            });
          } else {
            embed.addFields({
              name: index === 0 ? 'Player List' : `Players (Page ${index + 1})`,
              value: fieldValue,
              inline: false
            });
          }

          embeds.push(embed);
        } catch (embedErr) {
          console.error(`[PLAYERS] Error building embed ${index}:`, embedErr?.message || embedErr);
        }
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

      console.log(`[PLAYERS] Successfully built ${embeds.length} embeds`);
      return embeds;
    } catch (err) {
      console.error('[PLAYERS] Error in buildEmbeds:', err?.message || err);
      // Return a fallback embed
      const fallbackEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('FiveM Server Players')
        .setDescription('Error building player list')
        .setTimestamp(new Date());
      return [fallbackEmbed];
    }
  }

  async ensureMessages() {
    if (!this.channelId) return [];
    const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error(`[PLAYERS] Channel ${this.channelId} not found or not a text channel`);
      return [];
    }

    const messages = [];
    console.log(`[PLAYERS] Checking ${this.messageIds.length} existing message IDs`);

    // Check existing messages
    for (let i = 0; i < this.messageIds.length; i++) {
      const msgId = this.messageIds[i];
      try {
        const msg = await channel.messages.fetch(msgId);
        if (msg) {
          messages.push(msg);
          console.log(`[PLAYERS] Found existing message ${i}: ${msgId}`);
        }
      } catch (err) {
        if (err?.message?.includes('Unknown Message')) {
          console.warn(`[PLAYERS] Message ${msgId} was deleted, removing from tracking`);
          this.messageIds.splice(i, 1);
          persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
          i--; // Adjust index
        } else {
          console.error(`[PLAYERS] Error fetching message ${msgId}:`, err?.message || err);
        }
      }
    }

    // If no messages exist, create initial placeholder
    if (messages.length === 0) {
      console.log('[PLAYERS] No existing messages found, creating initial placeholder');
      try {
        const placeholder = await channel.send({ content: 'Initializing players monitor...' });
        messages.push(placeholder);
        this.messageIds = [placeholder.id];
        persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
        console.log(`[PLAYERS] Created placeholder message: ${placeholder.id}`);
      } catch (err) {
        console.error('[PLAYERS] Failed to create placeholder message:', err?.message || err);
        return [];
      }
    }

    return messages;
  }

  async update() {
    if (this.updateInProgress) {
      console.warn('[PLAYERS] Update already in progress, skipping...');
      return;
    }

    const now = Date.now();
    if (now - this.lastUpdate < 1000) { // Minimum 1 second between updates
      console.warn('[PLAYERS] Update too frequent, throttling...');
      return;
    }

    this.updateInProgress = true;
    this.lastUpdate = now;

    try {
      console.log(`[PLAYERS] Starting update cycle at ${new Date().toISOString()}`);

      const data = await this.fetchPlayersData();
      if (data.online) {
        console.log(`[PLAYERS] Update: ${data.players.length} players online`);
      } else {
        console.log('[PLAYERS] Update: server OFFLINE');
      }

      const embeds = this.buildEmbeds(data);
      console.log(`[PLAYERS] Generated ${embeds.length} embeds for ${data.players?.length || 0} players`);

      // Debug: Log embed structure (first embed only)
      if (embeds.length > 0 && embeds[0]) {
        console.log(`[PLAYERS] First embed title: "${embeds[0].data?.title || 'No title'}"`);
        console.log(`[PLAYERS] First embed fields: ${embeds[0].data?.fields?.length || 0}`);
      }

      const currentMessages = await this.ensureMessages();
      console.log(`[PLAYERS] Found ${currentMessages.length} existing messages`);

      // Adjust number of messages based on required embeds
      const requiredMessages = embeds.length;

      if (currentMessages.length < requiredMessages) {
        // Need more messages
        console.log(`[PLAYERS] Creating ${requiredMessages - currentMessages.length} additional messages`);
        const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
        if (!channel) {
          console.error('[PLAYERS] Channel not found, stopping monitor');
          this.stop();
          return;
        }

        for (let i = currentMessages.length; i < requiredMessages; i++) {
          try {
            const newMsg = await channel.send({ content: 'Loading...' });
            currentMessages.push(newMsg);
            this.messageIds.push(newMsg.id);
            // Add delay between message creations to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (err) {
            if (err?.message?.includes('rate limit')) {
              console.warn('[PLAYERS] Rate limited while creating message, waiting...');
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
              i--; // Retry this message creation
              continue;
            } else {
              console.error('[PLAYERS] Failed to create message:', err?.message || err);
              break; // Stop creating more messages on error
            }
          }
        }
        persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
      } else if (currentMessages.length > requiredMessages) {
        // Need fewer messages, delete extras
        console.log(`[PLAYERS] Deleting ${currentMessages.length - requiredMessages} extra messages`);
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
          console.log(`[PLAYERS] Attempting to edit message ${i} (ID: ${currentMessages[i].id})`);

          // Validate embed before editing
          if (!embeds[i] || typeof embeds[i] !== 'object') {
            console.error(`[PLAYERS] Invalid embed for message ${i}, skipping`);
            continue;
          }

          const editResult = await currentMessages[i].edit({ content: '', embeds: [embeds[i]] });
          console.log(`[PLAYERS] Successfully edited message ${i}, new timestamp: ${editResult.editedTimestamp}`);

          // Add small delay between edits to prevent rate limiting
          if (i < currentMessages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (err) {
          // Handle different error types
          if (err?.message?.includes('Unknown Message')) {
            console.warn(`[PLAYERS] Message ${i} was deleted, will recreate on next cycle`);
            // Remove from our tracking
            this.messageIds.splice(i, 1);
            currentMessages.splice(i, 1);
            persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
            i--; // Adjust index since we removed an item
          } else if (err?.message?.includes('rate limit') || err?.code === 50035) {
            console.warn(`[PLAYERS] Rate limited while editing message ${i}, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            i--; // Retry this message
            continue;
          } else if (err?.code === 50006) {
            console.error(`[PLAYERS] Empty message error for message ${i}, embed might be too large`);
            // Try to recreate the message
            try {
              const channel = await this.client.channels.fetch(this.channelId);
              const newMsg = await channel.send({ content: 'Recreating message due to size limit...', embeds: [embeds[i]] });
              this.messageIds[i] = newMsg.id;
              persistPlayersConfig(this.channelId, { url: this.url, messageIds: this.messageIds });
              console.log(`[PLAYERS] Recreated message ${i} with new ID: ${newMsg.id}`);
            } catch (recreateErr) {
              console.error(`[PLAYERS] Failed to recreate message ${i}:`, recreateErr?.message || recreateErr);
            }
          } else {
            console.error(`[PLAYERS] Failed to edit message ${i}:`, err?.message || err, `Code: ${err?.code}`);
          }
          // Continue with other messages even if one fails
        }
      }

      this.consecutiveErrors = 0; // Reset error counter on successful update
      console.log(`[PLAYERS] Update cycle completed successfully at ${new Date().toISOString()}`);

    } catch (err) {
      console.error('[PLAYERS] Update error:', err?.message || err);
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error('[PLAYERS] Too many consecutive errors, stopping monitor');
        this.stop();
      }
    } finally {
      this.updateInProgress = false;
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

