const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    this.uptimeStartMs = null; // reset when offline, set when first detect online
    this.lastKnownServerName = null;
  }

  setChannel(channelId) {
    this.channelId = channelId;
  }

  setMessage(messageId) {
    this.messageId = messageId;
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
    // FiveM info.json/players.json are served over HTTP, not HTTPS
    const base = `http://172.105.48.231:30124`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      console.log(`[STATUS] Fetching info.json -> ${base}/info.json`);
      const infoRes = await fetch(`${base}/info.json`, { signal: controller.signal });
      console.log(`[STATUS] info.json HTTP status: ${infoRes.status}`);
      if (!infoRes.ok) throw new Error(`info.json HTTP ${infoRes.status}`);
      const info = await infoRes.json();
      console.log(`[STATUS] info.json parsed. Keys: ${Object.keys(info || {}).join(', ')}`);

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

      const vars = info?.vars || {};
      const serverName = vars.sv_hostname || vars.sv_projectName || this.domain || `${this.ip}:${this.port}`;
      const maxPlayers = Number(vars.sv_maxClients) || 0;
      const currentPlayers = Array.isArray(players) ? players.length : 0;
      const version = info?.server || 'unknown';
      console.log(`[STATUS] ONLINE. serverName="${serverName}", players=${currentPlayers}/${maxPlayers}, version=${version}`);

      // Remember last known server name for offline display
      this.lastKnownServerName = serverName;

      return {
        online: true,
        serverName,
        currentPlayers,
        maxPlayers,
        version,
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
      embed.addFields({ name: 'Status', value: '🔴 Offline', inline: false });
      return embed;
    }

    const uptimeText = this.uptimeStartMs
      ? formatDuration(Date.now() - this.uptimeStartMs)
      : '0m';

    embed.addFields(
      { name: 'Status', value: '🟢 Online', inline: false },
      { name: 'Players', value: `${status.currentPlayers} / ${status.maxPlayers}`, inline: true },
      { name: 'Uptime', value: `${uptimeText}`, inline: true },
      { name: 'Version', value: `${status.version}`, inline: true },
      { name: 'Last Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    );

    return embed;
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
    return placeholder;
  }

  async update() {
    try {
      const status = await this.fetchServerData();
      if (status.online) {
        if (!this.uptimeStartMs) this.uptimeStartMs = Date.now();
        console.log('[STATUS] Update: server ONLINE');
      } else {
        this.uptimeStartMs = null;
        console.log('[STATUS] Update: server OFFLINE');
      }

      const embed = this.buildEmbed(status);
      const connectRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Connect')
          .setStyle(ButtonStyle.Link)
          .setURL('https://cfx.re/join/rzdaox')
      );
      const msg = await this.ensureMessage();
      if (!msg) return;
      await msg.edit({ content: '', embeds: [embed], components: [connectRow] });
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
};

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

