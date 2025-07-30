const { setPermission, ADMIN_IDS } = require('../utils/permissions');

module.exports = {
    name: 'giveperms',
    aliases: ['gp'],
    description: 'Manage user command permissions',
    usage: '<@user> <command> <true/false>',
    adminOnly: true,
    
    async execute(message, args) {
        // Check if user is an admin
        if (!ADMIN_IDS.includes(message.author.id)) {
            return message.reply('❌ You do not have permission to use this command.');
        }

        // Check if user is mentioned
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Please mention a user to modify permissions for.\nUsage: `$giveperms @user command true/false`');
        }

        // Get command and permission value
        const commandName = args[1]?.toLowerCase();
        const allow = args[2]?.toLowerCase();

        if (!commandName || (allow !== 'true' && allow !== 'false')) {
            return message.reply('❌ Invalid syntax. Usage: `$giveperms @user command true/false`');
        }

        // Prevent modifying permissions for other admins
        if (ADMIN_IDS.includes(targetUser.id) && targetUser.id !== message.author.id) {
            return message.reply('❌ You cannot modify permissions for other admins.');
        }

        try {
            // Update permissions
            const success = setPermission(targetUser.id, commandName, allow === 'true');
            
            if (!success) {
                throw new Error('Failed to update permissions');
            }

            return message.reply(`✅ Updated permissions for <@${targetUser.id}>: \`${commandName}\` ${allow === 'true' ? '✅ allowed' : '❌ denied'}`);

        } catch (error) {
            console.error('Error in giveperms command:', error);
            return message.reply('❌ An error occurred while updating permissions.');
        }
    }
};
