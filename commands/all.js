const { pool } = require('../utils/mariadb');
const { canUsePrefixCommand } = require('../utils/permissions');
const { resolveTargetDiscordId } = require('../utils/argParsing');

module.exports = {
  name: 'all',
  description: 'Grant superadmin, staff, and senior staff roles to a user',
  usage: '$all <@user | user_id>',
  example: '$all @username or $all 1234567890',
  async execute(message, args) {
    console.log(`[ALL] Command received from ${message.author.tag} (${message.author.id})`);
    
    // Permission via file-backed permissions (role: 'all')
    if (!canUsePrefixCommand(message.author.id, 'all')) {
      console.log(`[ALL] Unauthorized access attempt by ${message.author.tag}`);
      return message.reply('❌ You are not authorized to use this command.');
    }

    const targetId = resolveTargetDiscordId(message, args);
    if (!targetId) {
      console.log(`[ALL] No valid target provided`);
      return message.reply('Please provide a user mention or ID. Example: `$all @username` or `$all <user_id>`');
    }

    try {
      console.log(`[ALL] Granting all roles to ${targetId}`);
      
      // Get user from database
      const [userRows] = await pool.execute(
        'SELECT * FROM users WHERE discord_id = ? LIMIT 1',
        [targetId]
      );
      
      if (userRows.length === 0) {
        console.log(`[ALL] User not found in database`);
        return message.reply('❌ User not found in the database.');
      }
      
      const user = userRows[0];
      
      // Check which format the database is using
      const isNewFormat = 'is_staff' in user;
      
      let updateResult;
      
      if (isNewFormat) {
        // Update using boolean columns
        updateResult = await pool.execute(
          'UPDATE users SET is_staff = 1, is_senior_staff = 1, is_superadmin = 1 WHERE discord_id = ?',
          [targetId]
        );
      } else {
        // Update using rank string
        updateResult = await pool.execute(
          'UPDATE users SET `rank` = ? WHERE discord_id = ?',
          ['superadmin', targetId]
        );
      }
      
      console.log(`[ALL] Roles updated for ${targetId}:`, updateResult[0]);
      
      // Get updated user data
      const [updatedUser] = await pool.execute(
        'SELECT * FROM users WHERE discord_id = ? LIMIT 1',
        [targetId]
      );
      
      console.log(`[ALL] Updated user data:`, updatedUser[0]);
      
      const response = `✅ Successfully granted all roles to <@${targetId}>\n` +
                     `\`\`\`\n` +
                     `Super Admin: ✅\n` +
                     `Senior Staff: ✅\n` +
                     `Staff: ✅\n`;
      
      if (isNewFormat) {
        response += `Using new format (boolean columns)\n`;
      } else {
        response += `Using old format (rank string)\n`;
      }
      
      response += `\`\`\``;
      
      await message.reply(response);
      
    } catch (error) {
      console.error('[ALL] Error executing all command:', error);
      await message.reply('❌ An error occurred while updating user roles.');
    }
  },
};
