const { pool } = require('../utils/mariadb');

module.exports = {
    name: 'seniorstaff',
    description: 'Toggle senior staff status for a user',
    usage: '$seniorstaff @user',
    aliases: ['ss'],
    
    async execute(message, args) {
        // Check if a user was mentioned
        if (!message.mentions.users.size) {
            return message.reply('❌ Please mention a user. Usage: `$seniorstaff @user`');
        }
        
        const user = message.mentions.users.first();
        const discordId = user.id;

        try {
            // Get current is_senior_staff value
            const [rows] = await pool.execute(
                'SELECT is_senior_staff FROM users WHERE discord_id = ? LIMIT 1',
                [discordId]
            );
            
            if (rows.length === 0) {
                return message.reply('❌ User not found in the database.');
            }
            
            const current = rows[0].is_senior_staff === 1 ? 1 : 0;
            const newValue = current === 1 ? 0 : 1;
            
            await pool.execute(
                'UPDATE users SET is_senior_staff = ? WHERE discord_id = ?',
                [newValue, discordId]
            );
            
            if (newValue === 1) {
                return message.reply(`✅ <@${discordId}> is now a senior staff member!`);
            } else {
                return message.reply(`⚠️ <@${discordId}> is no longer a senior staff member.`);
            }
        } catch (err) {
            console.error(err);
            return message.reply('❌ Database error: ' + err.message);
        }
    }
};
