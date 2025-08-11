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
    try {
      const [infoRes, playersRes] = await Promise.all([
        fetch(`${base}/info.json`, { timeout: 10000 }),
        fetch(`${base}/players.json`, { timeout: 10000 }),
      ]);

      if (!infoRes.ok || !playersRes.ok) {
        throw new Error(`HTTP ${infoRes.status}/${playersRes.status}`);
      }

      const info = await infoRes.json();
      const players = await playersRes.json();

      const serverName = info?.vars?.sv_hostname || info?.server || this.domain || `${this.ip}:${this.port}`;
      const maxPlayers = Number(info?.vars?.sv_maxClients) || Number(info?.maxPlayers) || players?.length || 0;
      const currentPlayers = Array.isArray(players) ? players.length : 0;

      return {
        online: true,
        serverName,
        currentPlayers,
        maxPlayers,
      };
    } catch (err) {
      return { online: false };
    }
  }

  buildEmbed(status) {
    const color = status.online ? 0x57F287 : 0xED4245; // green/red
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(this.domain || `${this.ip}:${this.port}`)
      .setTimestamp(new Date());

    if (!status.online) {
      embed.setDescription('🔴 Offline');
      return embed;
    }

    embed
      .setDescription('🟢 Online')
      .addFields(
        { name: 'Server Name', value: `${status.serverName}`, inline: false },
        { name: 'Players', value: `${status.currentPlayers} / ${status.maxPlayers}`, inline: true },
        { name: 'Endpoint', value: `http://${this.ip}:${this.port}`, inline: true },
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

