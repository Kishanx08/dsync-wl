const { EmbedBuilder, ChannelType } = require('discord.js');
const { getPlayersMonitor, stopPlayersMonitor } = require('../utils/statusMonitor');

module.exports = {
  name: 'fivem',
  description: 'Monitor FiveM server players in a specified channel',
  async execute(message, args) {
    // Check if user has administrator permissions in the server
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ You need administrator permissions to use this command.');
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'stop') {
      // Stop monitoring
      const channelMention = message.mentions.channels.first();
      if (!channelMention) {
        return message.reply('Usage: `$fivem stop <#channel>`');
      }

      const channelId = channelMention.id;
      const stopped = stopPlayersMonitor(channelId);

      if (stopped) {
        return message.reply(`✅ Players monitor stopped for <#${channelId}>.`);
      } else {
        return message.reply(`❌ No active players monitor found for <#${channelId}>.`);
      }
    }

    // Parse arguments: URL and channel mention
    if (args.length < 2) {
      return message.reply('Usage: `$fivem <players.json URL> <#channel>` or `$fivem stop <#channel>`\nExample: `$fivem http://45.79.124.203:30120/players.json #players-channel`');
    }

    const url = args[0];
    const channelMention = message.mentions.channels.first();
    if (!channelMention) {
      return message.reply('Please mention a valid channel.');
    }

    const channelId = channelMention.id;

    // Validate URL format
    if (!url.startsWith('http://') || (!url.endsWith('/players.json') && !url.endsWith('/op-framework/connections.json'))) {
      return message.reply('Invalid URL. It must be a valid players endpoint (e.g., http://ip:port/players.json or http://ip:port/op-framework/connections.json).');
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