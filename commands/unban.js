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
    console.log(`[UNBAN] Command received from ${interaction.user.tag} (${interaction.user.id})`);
    await interaction.deferReply({ ephemeral: true });

    const identifier = interaction.options.getString('identifier');
    const reason = interaction.options.getString('reason');

    console.log(`[UNBAN] Processing unban for identifier: ${identifier}`);
    console.log(`[UNBAN] Reason: ${reason}`);

    try {
      // Check if user is actually banned
      console.log(`[UNBAN] Checking if user is currently banned...`);
      const existingBan = await isUserBanned(identifier);
      
      if (!existingBan) {
        console.log(`[UNBAN] User ${identifier} is not currently banned`);
        return interaction.editReply('This user is not currently banned.');
      }
      
      console.log(`[UNBAN] Found existing ban for user ${identifier}:`, JSON.stringify(existingBan, null, 2));

      // Get admin's identifier from database for logging
      console.log(`[UNBAN] Getting admin's info from database...`);
      const admin = await getUserByDiscordId(interaction.user.id);
      
      if (!admin || !admin.license_identifier) {
        console.log(`[UNBAN] Error: Could not find admin's info in database for Discord ID: ${interaction.user.id}`);
        return interaction.editReply('Error: Could not find your user information in the database.');
      }
      
      console.log(`[UNBAN] Admin's license identifier: ${admin.license_identifier}`);

      // Remove the ban
      console.log(`[UNBAN] Removing ban for user ${identifier}...`);
      const result = await unbanUser(identifier);
      
      if (result) {
        const successMessage = `✅ Successfully unbanned user with identifier: ${identifier}\n` +
                            `Reason: ${reason}`;
        
        console.log(`[UNBAN] Successfully removed ban for ${identifier}`);
        console.log(`[UNBAN] Sending response to Discord:`, successMessage);
        
        await interaction.editReply(successMessage);
      } else {
        const errorMessage = 'Failed to unban user. The user might not be banned or an error occurred.';
        console.log(`[UNBAN] ${errorMessage}`);
        await interaction.editReply(errorMessage);
      }
    } catch (error) {
      console.error('[UNBAN] Error executing unban command:', error);
      const errorMessage = 'An error occurred while processing the unban.';
      console.log(`[UNBAN] Sending error to Discord: ${errorMessage}`);
      await interaction.editReply(errorMessage);
    }
  },
};
