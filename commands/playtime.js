const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserByDiscordId } = require('../utils/mariadb');

function formatMinutes(totalMinutes) {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0;
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  return { days, hours };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playtime')
    .setDescription("Show a user's playtime from the server database")
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to check (optional). Defaults to you.')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const discordId = targetUser.id;
      const user = await getUserByDiscordId(discordId);

      if (!user) {
        return interaction.reply({ content: `❌ Could not find a user record for <@${discordId}> in the database.` });
      }

      const minutes = user.playtime || 0;
      const { days, hours } = formatMinutes(minutes);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: `${targetUser.tag}`, iconURL: targetUser.displayAvatarURL({ size: 128 }) })
        .setTitle('Playtime')
        .setDescription('Playtime as recorded by the server')
        .addFields(
          { name: 'Days', value: `${days}`, inline: true },
          { name: 'Hours', value: `${hours}`, inline: true },
        )
        .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[PLAYTIME] Error:', err);
      return interaction.reply({ content: '❌ An error occurred while fetching playtime.' });
    }
  },
};

