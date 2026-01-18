const { EmbedBuilder } = require('discord.js');
const { canUsePrefixCommand } = require('../utils/permissions');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'liveConfig.json');

module.exports = {
  name: 'live',
  description: 'Set up live message forwarding from another server/channel',
  usage: '$live <server_name> [channel_name] or $live stop',
  example: '$live "My Server" general or $live "My Server" (for all channels) or $live stop',
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
    if (args.length < 1) {
      return message.reply('Usage: `$live <server_name> [channel_name]` or `$live stop`\nIf no channel specified, forwards from all text channels in the server.');
    }

    const serverName = args[0];
    const channelName = args[1]; // Optional - if not provided, forward from all channels
    const targetChannelId = message.channel.id; // Where to forward messages

    try {
      // Find the source guild
      const sourceGuild = message.client.guilds.cache.find(g =>
        g.name.toLowerCase().includes(serverName.toLowerCase())
      );

      if (!sourceGuild) {
        return message.reply(`❌ Could not find a server matching "${serverName}". Use \`$how list\` to see available servers.`);
      }

      // Check if bot can send messages in target channel
      if (!message.channel.permissionsFor(message.client.user).has('SendMessages')) {
        return message.reply('❌ I do not have permission to send messages in this channel.');
      }

      const config = readLiveConfig();
      let configKey, configData, responseMessage;

      if (channelName) {
        // Channel-specific forwarding
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

        configKey = `${sourceGuild.id}_${sourceChannel.id}`;
        configData = {
          sourceGuildId: sourceGuild.id,
          sourceGuildName: sourceGuild.name,
          sourceChannelId: sourceChannel.id,
          sourceChannelName: sourceChannel.name,
          targetChannelId: targetChannelId,
          targetChannelName: message.channel.name,
          type: 'channel', // Specify this is channel-specific
          startedBy: message.author.id,
          startedAt: new Date().toISOString()
        };
        responseMessage = `✅ Live message forwarding configured!\n**From:** ${sourceGuild.name} #${sourceChannel.name}\n**To:** #${message.channel.name}\n\nAll new messages will be forwarded here. Use \`$live stop\` to stop.`;

      } else {
        // Server-wide forwarding
        // Check permissions for all text channels
        const textChannels = sourceGuild.channels.cache.filter(ch => ch.type === 0);
        let hasPermission = false;
        for (const [_, channel] of textChannels) {
          if (channel.permissionsFor(message.client.user).has('ReadMessageHistory')) {
            hasPermission = true;
            break;
          }
        }

        if (!hasPermission) {
          return message.reply('❌ I do not have permission to read messages in any text channels of that server.');
        }

        configKey = `${sourceGuild.id}_server`;
        configData = {
          sourceGuildId: sourceGuild.id,
          sourceGuildName: sourceGuild.name,
          targetChannelId: targetChannelId,
          targetChannelName: message.channel.name,
          type: 'server', // Specify this is server-wide
          startedBy: message.author.id,
          startedAt: new Date().toISOString()
        };
        responseMessage = `✅ Live message forwarding configured!\n**From:** ${sourceGuild.name} (all channels)\n**To:** #${message.channel.name}\n\nAll new messages from all text channels will be forwarded here. Use \`$live stop\` to stop.`;
      }

      config[configKey] = configData;
      writeLiveConfig(config);

      console.log(`[LIVE] Started ${configData.type} forwarding from ${sourceGuild.name} to ${message.channel.name}`);
      await message.reply(responseMessage);

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