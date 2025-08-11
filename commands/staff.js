const { pool } = require('../utils/mariadb');
const { canUsePrefixCommand } = require('../utils/permissions');

module.exports = {
    name: 'staff',
    description: 'Toggle staff status for a user',
    usage: '$staff @user',
    aliases: ['s'],
    
    async execute(message, args) {
        if (!canUsePrefixCommand(message.author.id, 'staff')) {
            return message.reply('❌ You do not have permission to use this command.');
        }
        // Check if a user was mentioned
        if (!message.mentions.users.size) {
            return message.reply('❌ Please mention a user. Usage: `$staff @user`');
        }
        
        const user = message.mentions.users.first();
        const discordId = user.id;

        try {
            // Get current is_staff value
            const [rows] = await pool.execute(
                'SELECT is_staff FROM users WHERE discord_id = ? LIMIT 1',
                [discordId]
            );
            
            if (rows.length === 0) {
                return message.reply('❌ User not found in the database.');
            }
            
            const current = rows[0].is_staff === 1 ? 1 : 0;
            const newValue = current === 1 ? 0 : 1;
            
            await pool.execute(
                'UPDATE users SET is_staff = ? WHERE discord_id = ?',
                [newValue, discordId]
            );
            
            if (newValue === 1) {
                return message.reply(`✅ <@${discordId}> is now a staff member!`);
            } else {
                return message.reply(`⚠️ <@${discordId}> is no longer a staff member.`);
            }
        } catch (err) {
            console.error(err);
            return message.reply('❌ Database error: ' + err.message);
        }
    }
};
