const { MessageEmbed } = require('discord.js');
const { hasPermission, ADMIN_IDS } = require('../utils/permissions');

module.exports = {
    name: 'check',
    description: 'Check a user\'s permissions',
    aliases: ['perms', 'permissions'],
    usage: '[@user]',
    
    async execute(message, args) {
        // Get the target user (default to the message author)
        const targetUser = message.mentions.users.first() || message.author;
        const isSelf = targetUser.id === message.author.id;
        
        // Check if the command user has permission to check others
        if (targetUser.id !== message.author.id && !ADMIN_IDS.includes(message.author.id)) {
            return message.reply('❌ You can only check your own permissions.');
        }

        try {
            // Check for special roles
            const isAdmin = ADMIN_IDS.includes(targetUser.id);
            const hasSuperAdmin = hasPermission(targetUser.id, 'superadmin');
            const hasStaff = hasPermission(targetUser.id, 'staff');
            const hasSeniorStaff = hasPermission(targetUser.id, 'seniorstaff');
            
            // Get all command permissions
            const allCommands = Array.from(message.client.commands.keys());
            const allowedCommands = allCommands.filter(cmd => {
                // Skip special commands
                if (['giveperms', 'check'].includes(cmd)) return false;
                return hasPermission(targetUser.id, cmd);
            });

            // Create embed
            const embed = new MessageEmbed()
                .setColor('#0099ff')
                .setTitle(`🔍 ${isSelf ? 'Your' : `${targetUser.username}'s`} Permissions`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addField('👑 Bot Admin', isAdmin ? '✅ Yes' : '❌ No', true)
                .addField('🛡️ Super Admin', hasSuperAdmin ? '✅ Yes' : '❌ No', true)
                .addField('👔 Staff', hasStaff ? '✅ Yes' : '❌ No', true)
                .addField('👨‍💼 Senior Staff', hasSeniorStaff ? '✅ Yes' : '❌ No', true);

            // Add allowed commands if any
            if (allowedCommands.length > 0) {
                embed.addField('🔧 Allowed Commands', `\`${allowedCommands.join('`, `')}\``, false);
            } else {
                embed.addField('🔧 Allowed Commands', 'None', false);
            }

            // Add note for admins
            if (isAdmin) {
                embed.setFooter('Note: Bot Admins have access to all commands');
            }

            await message.channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error in check command:', error);
            message.reply('❌ An error occurred while checking permissions.');
        }
    }
};
