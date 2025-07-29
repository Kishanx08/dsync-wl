const { SlashCommandBuilder } = require('discord.js');
const { removeLicense } = require('../utils/mariadb');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove_whitelist')
    .setDescription('Remove a license ID from the whitelist')
    .addStringOption(option =>
      option.setName('license_id')
        .setDescription('The license identifier to remove from whitelist')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const licenseId = interaction.options.getString('license_id');
    try {
      const result = await removeLicense(licenseId);
      if (result.affectedRows > 0) {
        await interaction.editReply({ content: `✅ License ID \`${licenseId}\` removed from whitelist.` });
      } else {
        await interaction.editReply({ content: '❌ License ID not found in whitelist.' });
      }
    } catch (err) {
      await interaction.editReply({ content: `❌ Error removing license: ${err.message}` });
    }
  },
}; 