const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { EmbedBuilder, ChannelType } = require('discord.js');
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
    const base = `http://${this.ip}:${this.port}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const infoRes = await fetch(`${base}/info.json`, { signal: controller.signal });
      if (!infoRes.ok) throw new Error(`info.json HTTP ${infoRes.status}`);
      const info = await infoRes.json();

      // If we got here, server is considered online
      let players = [];
      try {
        const playersRes = await fetch(`${base}/players.json`, { signal: controller.signal });
        if (playersRes.ok) players = await playersRes.json();
      } catch (_) {}

      const vars = info?.vars || {};
      const serverName = vars.sv_hostname || vars.sv_projectName || this.domain || `${this.ip}:${this.port}`;
      const maxPlayers = Number(vars.sv_maxClients) || 0;
      const currentPlayers = Array.isArray(players) ? players.length : 0;
      const version = info?.server || 'unknown';

      return {
        online: true,
        serverName,
        currentPlayers,
        maxPlayers,
        version,
      };
    } catch (_) {
      return { online: false };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  buildEmbed(status) {
    const color = status.online ? 0x57F287 : 0xED4245; // green/red
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(this.domain || `${this.ip}:${this.port}`)
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
      { name: 'Server Name', value: `${status.serverName}`, inline: false },
      { name: 'Players', value: `${status.currentPlayers} / ${status.maxPlayers}`, inline: true },
      { name: 'Version', value: `${status.version}`, inline: true },
      { name: 'Uptime', value: `${uptimeText}`, inline: true },
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
      } else {
        this.uptimeStartMs = null;
      }

      const embed = this.buildEmbed(status);
      const msg = await this.ensureMessage();
      if (!msg) return;
      await msg.edit({ content: '', embeds: [embed] });
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

