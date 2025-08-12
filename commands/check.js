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
    
    // Helper to normalize DB truthy values (1/0, '1'/'0', true/false)
    const toBoolean = (value) => {
      if (value === true || value === false) return value;
      if (value === 1 || value === 0) return value === 1;
      if (value === '1' || value === '0') return value === '1';
      // Fallback: treat non-null/non-undefined non-zero numbers as true
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return false;
    };

    // Helpers to format unix timestamps provided in seconds or milliseconds
    const toMsEpoch = (value) => {
      if (value === null || value === undefined) return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return null;
      return num < 1e12 ? num * 1000 : num; // assume seconds if below ~Sat Sep 09 2001 in ms
    };
    const formatEpoch = (value) => {
      const ms = toMsEpoch(value);
      return ms ? new Date(ms).toLocaleString() : 'Unknown';
    };

    // Get staff status based on format
    let isStaff, isSeniorStaff, isSuperAdmin;
    
    if (isNewFormat) {
      isStaff = toBoolean(user.is_staff);
      isSeniorStaff = toBoolean(user.is_senior_staff);
      // Support both column names: is_super_admin (preferred) and is_superadmin (legacy)
      const rawSuperAdminA = user.is_super_admin;
      const rawSuperAdminB = user.is_superadmin;
      isSuperAdmin = toBoolean(rawSuperAdminA) || toBoolean(rawSuperAdminB);
      
      // In case any of the fields are null/undefined, default to false
      isStaff = isStaff || false;
      isSeniorStaff = isSeniorStaff || false;
      isSuperAdmin = isSuperAdmin || false;
      
      console.log(`[CHECK] New format permissions - Staff: ${isStaff}, Senior: ${isSeniorStaff}, SuperAdmin: ${isSuperAdmin}`);
      console.log(`[CHECK] Raw superadmin fields - is_super_admin:`, rawSuperAdminA, `| is_superadmin:`, rawSuperAdminB);
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
      lastSeen: formatEpoch(user.last_seen) || 'Never',
      lastConnection: formatEpoch(user.last_connection) || 'Unknown',
      playTime: user.playtime || '0 minutes',
      joinDate: formatEpoch(user.join_date),
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
  example: '$check @Kishan or $check 1057573344855207966',
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
        console.log(`[CHECK] No user data found for ${targetId}`);
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
        response += `- Last Connection: ${staffInfo.lastConnection}\n`;
        response += `- Play Time: ${staffInfo.playTime}\n`;
      }
      
      response += `\`\`\``;
      
      console.log(`[CHECK] Sending user check results for ${targetId}`);
      await message.reply(response);
      
    } catch (error) {
      console.error('[CHECK] Error executing check command:', error);
      await message.reply('An error occurred while checking user information.');
    }
  },
};
