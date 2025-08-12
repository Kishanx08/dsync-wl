const { pool } = require('../utils/mariadb');
const { canUsePrefixCommand } = require('../utils/permissions');
const { resolveTargetDiscordId } = require('../utils/argParsing');

async function manageRole(guild, memberId, roleName, shouldHaveRole) {
    if (!guild) return;
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (!member) {
        console.log(`[RoleManager] Could not find member with ID ${memberId}`);
        return;
    }

    let role = guild.roles.cache.find(r => r.name === roleName);

    if (shouldHaveRole) {
        if (!role) {
            try {
                console.log(`[RoleManager] Role '${roleName}' not found, creating it.`);
                role = await guild.roles.create({ name: roleName, reason: 'Auto-created by bot for permissions.' });
            } catch (e) {
                console.error(`[RoleManager] Failed to create role ${roleName}`, e);
                return; 
            }
        }
        if (role) {
            if (!member.roles.cache.has(role.id)) {
                console.log(`[RoleManager] Adding role '${roleName}' to ${member.user.tag}`);
                await member.roles.add(role).catch(e => console.error(`[RoleManager] Failed to add role ${roleName} to ${member.user.tag}`, e));
            }
        }
    } else { 
        if (role) {
            if (member.roles.cache.has(role.id)) {
                console.log(`[RoleManager] Removing role '${roleName}' from ${member.user.tag}`);
                await member.roles.remove(role).catch(e => console.error(`[RoleManager] Failed to remove role ${roleName} from ${member.user.tag}`, e));
            }
        }
    }
}

module.exports = {
    name: 'seniorstaff',
    description: 'Toggle senior staff status for a user',
    usage: '$seniorstaff @user | <user_id>',
    aliases: ['ss'],
    
    async execute(message, args) {
        if (!canUsePrefixCommand(message.author.id, 'seniorstaff')) {
            return message.reply('❌ You do not have permission to use this command.');
        }
        // Resolve target from mention or ID
        const discordId = resolveTargetDiscordId(message, args);
        if (!discordId) {
            return message.reply('❌ Please provide a user mention or ID. Usage: `$seniorstaff @user` or `$seniorstaff <user_id>`');
        }

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
            
            await manageRole(message.guild, discordId, 'seniorstaff perms', newValue === 1);

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
