const { EmbedBuilder } = require('discord.js');
const { canUsePrefixCommand } = require('../utils/permissions');

module.exports = {
  name: 'how',
  description: 'List all servers the bot has joined',
  usage: '$how list',
  example: '$how list',
  async execute(message, args) {
    console.log(`[HOW] Command received from ${message.author.tag} (${message.author.id})`);

    // Check permission
    if (!canUsePrefixCommand(message.author.id, 'how')) {
      console.log(`[HOW] Permission denied for user ${message.author.tag}`);
      return message.reply('You do not have permission to use this command.');
    }

    const subcommand = args[0]?.toLowerCase();
    if (subcommand !== 'list') {
      return message.reply('Usage: `$how list`');
    }

    try {
      // Get all guilds the bot is in
      const guilds = message.client.guilds.cache;

      if (guilds.size === 0) {
        return message.reply('The bot is not in any servers.');
      }

      // Create embed with server list
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Bot Server List')
        .setDescription(`The bot is currently in ${guilds.size} server(s):`)
        .setTimestamp(new Date());

      // List servers (up to 25 in embed fields)
      let serverList = '';
      let fieldCount = 0;
      const maxFields = 25;

      for (const [guildId, guild] of guilds) {
        if (fieldCount >= maxFields) break;
        serverList += `${guild.name} (${guildId})\n`;
        fieldCount++;
      }

      if (serverList) {
        embed.addFields({
          name: 'Servers',
          value: `\`\`\`${serverList}\`\`\``,
          inline: false
        });
      }

      if (guilds.size > maxFields) {
        embed.setFooter({ text: `Showing first ${maxFields} servers out of ${guilds.size}` });
      }

      console.log(`[HOW] Sending server list with ${guilds.size} servers`);
      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[HOW] Error executing how command:', error);
      await message.reply('An error occurred while fetching server information.');
    }
  },
};