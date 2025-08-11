const { pool } = require('../utils/mariadb');
const { canUsePrefixCommand } = require('../utils/permissions');
const { resolveTargetDiscordId } = require('../utils/argParsing');

module.exports = {
    name: 'superadmin',
    description: 'Toggle superadmin status for a user',
    usage: '$superadmin @user | <user_id>',
    aliases: ['sa'],
    
    async execute(message, args) {
        if (!canUsePrefixCommand(message.author.id, 'superadmin')) {
            return message.reply('❌ You do not have permission to use this command.');
        }
        // Resolve target from mention or ID
        const discordId = resolveTargetDiscordId(message, args);
        if (!discordId) {
            return message.reply('❌ Please provide a user mention or ID. Usage: `$superadmin @user` or `$superadmin <user_id>`');
        }

        try {
            // Get current is_super_admin value
            const [rows] = await pool.execute(
                'SELECT is_super_admin FROM users WHERE discord_id = ? LIMIT 1',
                [discordId]
            );
            
            if (rows.length === 0) {
                return message.reply('❌ User not found in the database.');
            }
            
            const current = rows[0].is_super_admin === 1 ? 1 : 0;
            const newValue = current === 1 ? 0 : 1;
            
            await pool.execute(
                'UPDATE users SET is_super_admin = ? WHERE discord_id = ?',
                [newValue, discordId]
            );
            
            if (newValue === 1) {
                return message.reply(`✅ <@${discordId}> is now a superadmin!`);
            } else {
                return message.reply(`⚠️ <@${discordId}> is no longer a superadmin.`);
            }
        } catch (err) {
            console.error(err);
            return message.reply('❌ Database error: ' + err.message);
        }
    }
};