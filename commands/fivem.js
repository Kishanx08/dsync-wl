const { EmbedBuilder, ChannelType } = require('discord.js');
const { getPlayersMonitor, stopPlayersMonitor } = require('../utils/statusMonitor');

module.exports = {
  name: 'fivem',
  description: 'Monitor FiveM server players in a specified channel',
  async execute(message, args) {
    // Delete the command message instantly
    await message.delete().catch(() => {});

    // Check if user has administrator permissions in the server
    if (!message.member.permissions.has('Administrator')) {
      return message.reply({ content: '❌ You need administrator permissions to use this command.', flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'stop') {
      // Stop monitoring
      const channelMention = message.mentions.channels.first();
      if (!channelMention) {
        return message.reply({ content: 'Usage: `$fivem stop <#channel>`', flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
      }

      const channelId = channelMention.id;
      const stopped = stopPlayersMonitor(channelId);

      if (stopped) {
        return message.reply({ content: `✅ Players monitor stopped for <#${channelId}>.`, flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
      } else {
        return message.reply({ content: `❌ No active players monitor found for <#${channelId}>.`, flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
      }
    }

    // Parse arguments: URL and channel mention
    if (args.length < 2) {
      return message.reply({ content: 'Usage: `$fivem <players.json URL> <#channel>` or `$fivem stop <#channel>`\nExample: `$fivem http://45.79.124.203:30120/players.json #players-channel`', flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }

    const url = args[0];
    const channelMention = message.mentions.channels.first();
    if (!channelMention) {
      return message.reply({ content: 'Please mention a valid channel.', flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }

    const channelId = channelMention.id;

    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://') || (!url.endsWith('/players.json') && !url.endsWith('/op-framework/connections.json'))) {
      return message.reply({ content: 'Invalid URL. It must be a valid players endpoint (e.g., http://ip:port/players.json or http://ip:port/op-framework/connections.json).', flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }

    // Get or create monitor for this channel
    const monitor = getPlayersMonitor(message.client, channelId);
    monitor.setUrl(url);
    monitor.setChannel(channelId);

    // Initial update
    await monitor.update();

    // Start monitoring
    monitor.start();

    return message.reply({ content: `<:tick:1469692733433057381> Players monitor configured for <#${channelId}>. Updating every 5 seconds.`, flags: 64 }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
  },
};