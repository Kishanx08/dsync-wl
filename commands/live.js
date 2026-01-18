const { EmbedBuilder } = require('discord.js');
const { canUsePrefixCommand } = require('../utils/permissions');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'liveConfig.json');

module.exports = {
  name: 'live',
  description: 'Set up live message forwarding from another server/channel',
  usage: '$live <server_name> <channel_name> or $live stop',
  example: '$live "My Server" general or $live stop',
  async execute(message, args) {
    console.log(`[LIVE] Command received from ${message.author.tag} (${message.author.id})`);

    // Check permission
    if (!canUsePrefixCommand(message.author.id, 'live')) {
      console.log(`[LIVE] Permission denied for user ${message.author.tag}`);
      return message.reply('You do not have permission to use this command.');
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'stop') {
      // Stop all forwarding
      try {
        const config = readLiveConfig();
        const stoppedCount = Object.keys(config).length;

        // Clear config
        writeLiveConfig({});

        console.log(`[LIVE] Stopped ${stoppedCount} forwarding configurations`);
        return message.reply(`✅ Stopped ${stoppedCount} live message forwarding configuration(s).`);
      } catch (error) {
        console.error('[LIVE] Error stopping forwarding:', error);
        return message.reply('❌ Error stopping live forwarding.');
      }
    }

    // Start forwarding
    if (args.length < 2) {
      return message.reply('Usage: `$live <server_name> <channel_name>` or `$live stop`');
    }

    const serverName = args[0];
    const channelName = args[1];
    const targetChannelId = message.channel.id; // Where to forward messages

    try {
      // Find the source guild
      const sourceGuild = message.client.guilds.cache.find(g =>
        g.name.toLowerCase().includes(serverName.toLowerCase())
      );

      if (!sourceGuild) {
        return message.reply(`❌ Could not find a server matching "${serverName}". Use \`$how list\` to see available servers.`);
      }

      // Find the source channel
      const sourceChannel = sourceGuild.channels.cache.find(ch =>
        ch.type === 0 && ch.name.toLowerCase().includes(channelName.toLowerCase())
      );

      if (!sourceChannel) {
        return message.reply(`❌ Could not find a text channel matching "${channelName}" in ${sourceGuild.name}.`);
      }

      // Check if bot can read messages in source channel
      if (!sourceChannel.permissionsFor(message.client.user).has('ReadMessageHistory')) {
        return message.reply('❌ I do not have permission to read messages in that channel.');
      }

      // Check if bot can send messages in target channel
      if (!message.channel.permissionsFor(message.client.user).has('SendMessages')) {
        return message.reply('❌ I do not have permission to send messages in this channel.');
      }

      // Store configuration
      const config = readLiveConfig();
      const configKey = `${sourceGuild.id}_${sourceChannel.id}`;

      config[configKey] = {
        sourceGuildId: sourceGuild.id,
        sourceGuildName: sourceGuild.name,
        sourceChannelId: sourceChannel.id,
        sourceChannelName: sourceChannel.name,
        targetChannelId: targetChannelId,
        targetChannelName: message.channel.name,
        startedBy: message.author.id,
        startedAt: new Date().toISOString()
      };

      writeLiveConfig(config);

      console.log(`[LIVE] Started forwarding from ${sourceGuild.name}#${sourceChannel.name} to ${message.channel.name}`);
      await message.reply(`✅ Live message forwarding configured!\n**From:** ${sourceGuild.name} #${sourceChannel.name}\n**To:** #${message.channel.name}\n\nAll new messages will be forwarded here. Use \`$live stop\` to stop.`);

    } catch (error) {
      console.error('[LIVE] Error setting up forwarding:', error);
      await message.reply('❌ An error occurred while setting up live forwarding.');
    }
  },
};

function readLiveConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) || {};
  } catch (error) {
    console.error('[LIVE] Error reading config:', error);
    return {};
  }
}

function writeLiveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('[LIVE] Error writing config:', error);
  }
}

// Export functions for use in index.js
module.exports.readLiveConfig = readLiveConfig;
module.exports.writeLiveConfig = writeLiveConfig;