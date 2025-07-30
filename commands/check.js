const { isUserBanned, getUserByDiscordId, pool } = require('../utils/mariadb');

async function isUserWhitelisted(license_identifier) {
  const sql = 'SELECT * FROM user_whitelist WHERE license_identifier = ? LIMIT 1';
  try {
    const [rows] = await pool.execute(sql, [license_identifier]);
    return rows.length > 0;
  } catch (err) {
    console.error('Error checking whitelist status:', err);
    return false;
  }
}

async function getUserStaffInfo(license_identifier) {
  const sql = 'SELECT * FROM users WHERE license_identifier = ? LIMIT 1';
  try {
    const [rows] = await pool.execute(sql, [license_identifier]);
    if (rows.length === 0) return null;
    
    const user = rows[0];
    
    // Check if using boolean columns (0/1) or rank string
    const isNewFormat = 'is_staff' in user;
    
    const staffInfo = {
      // Check for both old rank string and new boolean columns
      isStaff: isNewFormat ? user.is_staff === 1 : (user.rank === 'staff'),
      isSeniorStaff: isNewFormat ? user.is_senior_staff === 1 : (user.rank === 'seniorstaff'),
      isSuperAdmin: isNewFormat ? user.is_superadmin === 1 : (user.rank === 'superadmin'),
      lastSeen: user.last_seen ? new Date(user.last_seen).toLocaleString() : 'Never',
      playTime: user.playtime || '0 minutes',
      joinDate: user.join_date ? new Date(user.join_date).toLocaleString() : 'Unknown',
      // Add raw data for debugging
      _raw: user
    };
    
    return staffInfo;
  } catch (err) {
    console.error('Error getting user staff info:', err);
    return null;
  }
}

module.exports = {
  name: 'check',
  description: 'Check user status including ban, whitelist, and staff permissions',
  usage: '$check <@user>',
  example: '$check @Kishan',
  async execute(message, args) {
    console.log(`[CHECK] Command received from ${message.author.tag} (${message.author.id})`);
    
    // Check if user has permission
    if (!message.member.roles.cache.some(role => ['seniorstaff', 'staff', 'superadmin'].includes(role.name.toLowerCase()))) {
      console.log(`[CHECK] Permission denied for user ${message.author.tag}`);
      return message.reply('You do not have permission to use this command.');
    }

    // Check if user was mentioned
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
      console.log(`[CHECK] No user mentioned`);
      return message.reply('Please mention a user to check. Example: `$check @username`');
    }

    try {
      console.log(`[CHECK] Checking status for user ${targetUser.tag} (${targetUser.id})`);
      
      // Get user from database
      const userData = await getUserByDiscordId(targetUser.id);
      if (!userData || !userData.license_identifier) {
        console.log(`[CHECK] No user data found for ${targetUser.tag}`);
        return message.reply('This user is not registered in the database.');
      }

      // Check ban status
      console.log(`[CHECK] Checking ban status for license: ${userData.license_identifier}`);
      const banInfo = await isUserBanned(userData.license_identifier);
      console.log(`[CHECK] Ban check result:`, banInfo);
      const isBanned = banInfo !== null;
      
      // Check whitelist status
      const isWhitelisted = await isUserWhitelisted(userData.license_identifier);
      
      // Get staff info
      const staffInfo = await getUserStaffInfo(userData.license_identifier);

      // Format the response
      let response = `**User Check for ${targetUser.tag}**\n`;
      response += `\`\`\`\n`;
      response += `Discord ID: ${targetUser.id}\n`;
      response += `License ID: ${userData.license_identifier || 'N/A'}\n`;
      response += `\n`;
      response += `Ban Status: ${isBanned ? '❌ BANNED' : '✅ Not Banned'}\n`;
      
      if (isBanned) {
        const expireDate = banInfo.expire > 0 ? new Date(banInfo.expire * 1000).toLocaleString() : 'Permanent';
        response += `- Reason: ${banInfo.reason || 'No reason provided'}\n`;
        response += `- Banned Until: ${expireDate}\n`;
        response += `- Banned By: ${banInfo.creator_identifier || 'Unknown'}\n`;
      }
      
      response += `\n`;
      response += `Whitelist Status: ${isWhitelisted ? '✅ Whitelisted' : '❌ Not Whitelisted'}\n`;
      
      if (staffInfo) {
        response += `\n`;
        response += `Staff Status:\n`;
        response += `- Staff: ${staffInfo.isStaff ? '✅' : '❌'}\n`;
        response += `- Senior Staff: ${staffInfo.isSeniorStaff ? '✅' : '❌'}\n`;
        response += `- Super Admin: ${staffInfo.isSuperAdmin ? '✅' : '❌'}\n`;
        response += `- Join Date: ${staffInfo.joinDate}\n`;
        response += `- Last Seen: ${staffInfo.lastSeen}\n`;
        response += `- Play Time: ${staffInfo.playTime}\n`;
      }
      
      response += `\`\`\``;
      
      console.log(`[CHECK] Sending user check results for ${targetUser.tag}`);
      await message.reply(response);
      
    } catch (error) {
      console.error('[CHECK] Error executing check command:', error);
      await message.reply('An error occurred while checking user information.');
    }
  },
};
