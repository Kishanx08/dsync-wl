const { SlashCommandBuilder } = require('discord.js');
const { addLicense } = require('../utils/mariadb');
const { logWhitelistAddition } = require('../utils/whitelistLogger');
const { canUseWhitelistCommands } = require('../utils/permissions');

// Simple in-memory lock to prevent race conditions
const lockedLicenses = new Set();

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

    // --- Lock Mechanism ---
    if (lockedLicenses.has(licenseId)) {
      return interaction.reply({ 
        content: 'Another operation for this license ID is already in progress. Please try again in a moment.',
        ephemeral: true 
      });
    }
    lockedLicenses.add(licenseId);
    // --- End Lock Mechanism ---

    await interaction.deferReply({ ephemeral: true });

    try {
      await addLicense(licenseId);
      await interaction.editReply({ content: `✅ License ID \`${licenseId}\` added to whitelist.` });
      // Post in the log channel
      setImmediate(() => logWhitelistAddition(interaction.client, licenseId, interaction.user));
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        await interaction.editReply({ content: '❌ This license ID is already whitelisted.' });
      } else {
        await interaction.editReply({ content: `❌ Error adding license: ${err.message}` });
      }
    } finally {
      // --- Unlock ---
      lockedLicenses.delete(licenseId);
      // --- End Unlock ---
    }
  },
};