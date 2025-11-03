const { EmbedBuilder, ChannelType } = require('discord.js');
const { getPlayersMonitor } = require('../utils/statusMonitor');

module.exports = {
  name: 'fivem',
  description: 'Monitor FiveM server players in a specified channel',
  async execute(message, args) {
    // Check permissions (assuming same as status command)
    const { isGiveAdmin } = require('../utils/permissions');
    if (!isGiveAdmin(message.author.id)) {
      return message.reply('❌ You are not authorized to use this command.');
    }

    // Parse arguments: URL and channel mention
    if (args.length < 2) {
      return message.reply('Usage: `$fivem <players.json URL> <#channel>`\nExample: `$fivem http://45.79.124.203:30120/players.json #players-channel`');
    }

    const url = args[0];
    const channelMention = message.mentions.channels.first();
    if (!channelMention) {
      return message.reply('Please mention a valid channel.');
    }

    const channelId = channelMention.id;

    // Validate URL format
    if (!url.startsWith('http://') || !url.endsWith('/players.json')) {
      return message.reply('Invalid URL. It must be a valid players.json endpoint (e.g., http://ip:port/players.json).');
    }

    // Get or create monitor for this channel
    const monitor = getPlayersMonitor(message.client, channelId);
    monitor.setUrl(url);
    monitor.setChannel(channelId);

    // Initial update
    await monitor.update();

    // Start monitoring
    monitor.start();

    return message.reply(`✅ Players monitor configured for <#${channelId}> with URL: ${url}. Updating every 5 seconds.`);
  },
};