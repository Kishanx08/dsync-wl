const { pool } = require('../utils/mariadb');

// List of authorized user IDs who can use this command
const AUTHORIZED_USERS = new Set([
  '1057573344855207966', // kishann9
  '526016778195828737',  // joshi_8
  '574928032771604480'   // dsyncdakku
]);

module.exports = {
  name: 'all',
  description: 'Grant superadmin, staff, and senior staff roles to a user',
  usage: '$all <@user>',
  example: '$all @username',
  async execute(message, args) {
    console.log(`[ALL] Command received from ${message.author.tag} (${message.author.id})`);
    
    // Check if the user is authorized to use this command
    if (!AUTHORIZED_USERS.has(message.author.id)) {
      console.log(`[ALL] Unauthorized access attempt by ${message.author.tag}`);
      return message.reply('❌ You are not authorized to use this command.');
    }

    // Check if a user was mentioned
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
      console.log(`[ALL] No user mentioned`);
      return message.reply('Please mention a user to grant all roles. Example: `$all @username`');
    }

    try {
      console.log(`[ALL] Granting all roles to ${targetUser.tag} (${targetUser.id})`);
      
      // Get user from database
      const [userRows] = await pool.execute(
        'SELECT * FROM users WHERE discord_id = ? LIMIT 1',
        [targetUser.id]
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
          [targetUser.id]
        );
      } else {
        // Update using rank string
        updateResult = await pool.execute(
          'UPDATE users SET `rank` = ? WHERE discord_id = ?',
          ['superadmin', targetUser.id]
        );
      }
      
      console.log(`[ALL] Roles updated for ${targetUser.tag}:`, updateResult[0]);
      
      // Get updated user data
      const [updatedUser] = await pool.execute(
        'SELECT * FROM users WHERE discord_id = ? LIMIT 1',
        [targetUser.id]
      );
      
      console.log(`[ALL] Updated user data:`, updatedUser[0]);
      
      const response = `✅ Successfully granted all roles to ${targetUser.tag}\n` +
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
