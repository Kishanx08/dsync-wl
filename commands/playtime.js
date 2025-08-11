const { SlashCommandBuilder } = require('discord.js');
const { getUserByDiscordId } = require('../utils/mariadb');

function formatMinutes(totalMinutes) {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return { minutes, hours, rem };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playtime')
    .setDescription("Show your playtime as stored in the server's database"),

  async execute(interaction) {
    try {
      const discordId = interaction.user.id;
      const user = await getUserByDiscordId(discordId);

      if (!user) {
        return interaction.reply({ content: '❌ Could not find your user record in the database.', ephemeral: true });
      }

      const minutes = user.playtime || 0;
      const { hours, rem } = formatMinutes(minutes);

      const response = `🕒 Playtime for <@${discordId}>\n` +
        '```\n' +
        `Total Minutes: ${minutes}\n` +
        `Formatted: ${hours} hour(s) ${rem} minute(s)\n` +
        '```';

      return interaction.reply({ content: response });
    } catch (err) {
      console.error('[PLAYTIME] Error:', err);
      return interaction.reply({ content: '❌ An error occurred while fetching playtime.', ephemeral: true });
    }
  },
};

