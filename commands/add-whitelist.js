const { SlashCommandBuilder } = require('discord.js');
const { addLicense } = require('../utils/mariadb');
const { logWhitelistAddition } = require('../utils/whitelistLogger');
const { canUseWhitelistCommands } = require('../utils/permissions');

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
    if (!canUseWhitelistCommands(interaction.user.id)) {
      return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
    }
    
    const licenseId = interaction.options.getString('license_id');

    await interaction.deferReply();

    try {
      const result = await addLicense(licenseId);
      
      // Check if license was already in the database
      if (result.affectedRows === 0) {
        await interaction.editReply({ content: `❌ This license ID is already whitelisted.` });
      } else {
        await interaction.editReply({ content: `✅ License ID \`${licenseId}\` added to whitelist.` });
        // Post in the log channel
        setImmediate(() => logWhitelistAddition(interaction.client, licenseId, interaction.user));
      }
    } catch (err) {
      await interaction.editReply({ content: `❌ Error adding license: ${err.message}` });
    }
  },
};