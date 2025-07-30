const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { unbanUser, isUserBanned, getUserByDiscordId } = require('../utils/mariadb');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their license identifier')
    .addStringOption(option =>
      option.setName('identifier')
        .setDescription('The license identifier of the user to unban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the unban')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const identifier = interaction.options.getString('identifier');
    const reason = interaction.options.getString('reason');

    try {
      // Check if user is actually banned
      const existingBan = await isUserBanned(identifier);
      if (!existingBan) {
        return interaction.editReply('This user is not currently banned.');
      }

      // Get admin's identifier from database for logging
      const admin = await getUserByDiscordId(interaction.user.id);
      if (!admin || !admin.license_identifier) {
        return interaction.editReply('Error: Could not find your user information in the database.');
      }

      // Remove the ban
      const result = await unbanUser(identifier);
      
      if (result) {
        await interaction.editReply(`✅ Successfully unbanned user with identifier: ${identifier}\n` +
                                 `Reason: ${reason}`);
      } else {
        await interaction.editReply('Failed to unban user. The user might not be banned or an error occurred.');
      }
    } catch (error) {
      console.error('Error executing unban command:', error);
      await interaction.editReply('An error occurred while processing the unban.');
    }
  },
};
