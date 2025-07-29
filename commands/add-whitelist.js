const { SlashCommandBuilder } = require('discord.js');
const { addLicense } = require('../utils/mariadb');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_whitelist')
    .setDescription('Add a license ID to the whitelist')
    .addStringOption(option =>
      option.setName('license_id')
        .setDescription('The license identifier to whitelist')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const licenseId = interaction.options.getString('license_id');
    try {
      await addLicense(licenseId);
      await interaction.editReply({ content: `✅ License ID \`${licenseId}\` added to whitelist.` });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        await interaction.editReply({ content: '❌ This license ID is already whitelisted.' });
      } else {
        await interaction.editReply({ content: `❌ Error adding license: ${err.message}` });
      }
    }
  },
}; 