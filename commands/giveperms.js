const { SlashCommandBuilder } = require('discord.js');
const { setPermission, ADMIN_IDS, hasPermission } = require('../utils/permissions');

module.exports = {
    name: 'giveperms',
    description: 'Manage user command permissions',
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName('giveperms')
        .setDescription('Manage user command permissions')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to manage permissions for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command to grant/revoke')
                .setRequired(true)
                .setAutocomplete(true))
        .addBooleanOption(option =>
            option.setName('allow')
                .setDescription('Whether to allow or deny the command')
                .setRequired(true)),

    async execute(interaction) {
        // Only allow specific admin users
        if (!ADMIN_IDS.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const commandName = interaction.options.getString('command');
        const allow = interaction.options.getBoolean('allow');

        // Prevent modifying permissions for other admins
        if (ADMIN_IDS.includes(targetUser.id) && targetUser.id !== interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot modify permissions for other admins.',
                ephemeral: true
            });
        }

        try {
            // Update permissions
            const success = setPermission(targetUser.id, commandName, allow);
            
            if (!success) {
                throw new Error('Failed to update permissions');
            }

            return interaction.reply({
                content: `✅ Updated permissions for <@${targetUser.id}>: \`${commandName}\` ${allow ? '✅ allowed' : '❌ denied'}`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in giveperms command:', error);
            return interaction.reply({
                content: '❌ An error occurred while updating permissions.',
                ephemeral: true
            });
        }
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const commands = Array.from(interaction.client.commands.keys())
            .filter(cmd => cmd !== 'giveperms') // Don't allow modifying giveperms
            .filter(cmd => cmd.toLowerCase().includes(focusedValue))
            .slice(0, 25); // Discord limits to 25 choices

        await interaction.respond(
            commands.map(command => ({
                name: command,
                value: command
            }))
        );
    }
};
