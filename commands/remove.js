const { SlashCommandBuilder } = require('discord.js');
const {
  isGiveAdmin,
  removePermission,
} = require('../utils/permissions');

const ROLE_CHOICES = [
  { name: 'all (access to all prefix commands)', value: 'all' },
  { name: 'senior staff (prefix: $seniorstaff)', value: 'seniorstaff' },
  { name: 'staff (prefix: $staff)', value: 'staff' },
  { name: 'superadmin (prefix: $superadmin)', value: 'superadmin' },
  { name: 'ban (prefix: $ban)', value: 'ban' },
  { name: 'unban (prefix: $unban)', value: 'unban' },
  { name: 'check (prefix: $check)', value: 'check' },
  { name: 'whitelist (use /add_whitelist and /remove_whitelist)', value: 'whitelist' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Revoke access to a role/command set from a user')
    .addStringOption(option =>
      option
        .setName('role')
        .setDescription('Select the role/command access to revoke')
        .setRequired(true)
        .addChoices(...ROLE_CHOICES)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Target user (mention)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('user_id')
        .setDescription('Target user ID (if mention not used)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const requesterId = interaction.user.id;
    if (!isGiveAdmin(requesterId)) {
      return interaction.editReply({ content: '❌ You are not authorized to use this command.' });
    }

    const role = interaction.options.getString('role');
    const user = interaction.options.getUser('user');
    const userIdInput = interaction.options.getString('user_id');
    const targetId = user ? user.id : (userIdInput ? userIdInput.trim() : null);

    if (!targetId) {
      return interaction.editReply({ content: '❌ Please provide a target user via mention or user_id.' });
    }

    removePermission(role, targetId);

    return interaction.editReply({
      content: `✅ Revoked access for '${role}' from <@${targetId}> (${targetId}).`,
    });
  },
};

