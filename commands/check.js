const { isUserBanned, getUserByDiscordId, pool } = require('../utils/mariadb');
const { canUsePrefixCommand } = require('../utils/permissions');

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
    
    // Log raw user data for debugging
    console.log(`[CHECK] Raw user data:`, JSON.stringify(user, null, 2));
    
    // Check which format we're using
    const isNewFormat = 'is_staff' in user;
    console.log(`[CHECK] Using ${isNewFormat ? 'new' : 'old'} format for permissions`);
    
    // Get staff status based on format
    let isStaff, isSeniorStaff, isSuperAdmin;
    
    if (isNewFormat) {
      isStaff = user.is_staff === 1 || user.is_staff === true;
      isSeniorStaff = user.is_senior_staff === 1 || user.is_senior_staff === true;
      isSuperAdmin = user.is_superadmin === 1 || user.is_superadmin === true;
      
      // In case any of the fields are null/undefined, default to false
      isStaff = isStaff || false;
      isSeniorStaff = isSeniorStaff || false;
      isSuperAdmin = isSuperAdmin || false;
      
      console.log(`[CHECK] New format permissions - Staff: ${isStaff}, Senior: ${isSeniorStaff}, SuperAdmin: ${isSuperAdmin}`);
    } else {
      isStaff = user.rank === 'staff';
      isSeniorStaff = user.rank === 'seniorstaff';
      isSuperAdmin = user.rank === 'superadmin';
      console.log(`[CHECK] Old format permissions - Rank: ${user.rank}`);
    }
    
    const staffInfo = {
      isStaff,
      isSeniorStaff,
      isSuperAdmin,
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
  usage: '$check <@user | user_id>',
  example: '$check @Kishan or $check 1234567890',
  async execute(message, args) {
    console.log(`[CHECK] Command received from ${message.author.tag} (${message.author.id})`);
    
    // Check permission via file-backed permissions
    if (!canUsePrefixCommand(message.author.id, 'check')) {
      console.log(`[CHECK] Permission denied for user ${message.author.tag}`);
      return message.reply('You do not have permission to use this command.');
    }

    // Accept mention or raw ID
    const targetId = (message.mentions.users.first()?.id) || (args[0] ? String(args[0]).replace(/\D/g, '') : null);
    if (!targetId) {
      console.log(`[CHECK] No valid target provided`);
      return message.reply('Please provide a user mention or ID. Example: `$check @username` or `$check <user_id>`');
    }

    try {
      console.log(`[CHECK] Checking status for user ${targetId})`);
      
      // Get user from database
      const userData = await getUserByDiscordId(targetId);
      if (!userData || !userData.license_identifier) {
        console.log(`[CHECK] No user data found for ${targetUser.tag}`);
        return message.reply('This user is not registered in the database.');
      }

      // Check ban status with detailed logging
      console.log(`[CHECK] Checking ban status for license: ${userData.license_identifier}`);
      const banInfo = await isUserBanned(userData.license_identifier);
      console.log(`[CHECK] Ban check result:`, JSON.stringify(banInfo, null, 2));
      const isBanned = banInfo !== null;
      
      // Log detailed ban information if banned
      if (isBanned) {
        console.log(`[CHECK] User is banned. Details:`, {
          reason: banInfo.reason,
          expires: banInfo.expire,
          expiresDate: banInfo.expire > 0 ? new Date(banInfo.expire * 1000).toISOString() : 'Never',
          creator: banInfo.creator_identifier,
          creationReason: banInfo.creation_reason,
          banHash: banInfo.ban_hash
        });
      }
      
      // Check whitelist status
      const isWhitelisted = await isUserWhitelisted(userData.license_identifier);
      
      // Get staff info
      const staffInfo = await getUserStaffInfo(userData.license_identifier);

      // Format the response
      let response = `**User Check for <@${targetId}>**\n`;
      response += `\`\`\`\n`;
      response += `Discord ID: ${targetId}\n`;
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
