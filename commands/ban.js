const { banUser, isUserBanned, getUserByDiscordId } = require('../utils/mariadb');
const { v4: uuidv4 } = require('uuid');

// Helper function to parse duration string (e.g., 1d, 2w, 1m) to seconds
function parseDuration(durationStr) {
  console.log(`[BAN] Parsing duration: ${durationStr}`);
  const duration = parseInt(durationStr);
  const unit = durationStr.replace(/\d+/g, '').toLowerCase();
  
  if (isNaN(duration)) {
    console.log(`[BAN] Invalid duration format: ${durationStr}`);
    return null;
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  let seconds;
  switch(unit) {
    case 'm': // minutes
      seconds = now + (duration * 60);
      console.log(`[BAN] Duration: ${duration} minutes`);
      break;
    case 'h': // hours
      seconds = now + (duration * 3600);
      console.log(`[BAN] Duration: ${duration} hours`);
      break;
    case 'd': // days
      seconds = now + (duration * 86400);
      console.log(`[BAN] Duration: ${duration} days`);
      break;
    case 'w': // weeks
      seconds = now + (duration * 604800);
      console.log(`[BAN] Duration: ${duration} weeks`);
      break;
    case 'y': // years
      seconds = now + (duration * 31536000);
      console.log(`[BAN] Duration: ${duration} years`);
      break;
    default: // default to days if no unit specified
      seconds = now + (duration * 86400);
      console.log(`[BAN] Default duration: ${duration} days`);
  }
  
  console.log(`[BAN] Expiration timestamp: ${seconds} (${new Date(seconds * 1000).toISOString()})`);
  return seconds;
}

module.exports = {
  name: 'ban',
  description: 'Ban a user by their license identifier',
  usage: '$ban <license_identifier> <duration> <reason>',
  example: '$ban license:123456 7d Cheating',
  async execute(message, args) {
    console.log(`[BAN] Command received from ${message.author.tag} (${message.author.id})`);
    
    // Debug: Log all roles the user has
    console.log(`[BAN] User roles:`, message.member.roles.cache.map(role => role.name));
    
    // Check if user has permission (case-insensitive check)
    const hasPermission = message.member.roles.cache.some(role => {
      const roleName = role.name.toLowerCase();
      return ['seniorstaff', 'staff', 'superadmin'].some(allowedRole => 
        roleName === allowedRole.toLowerCase()
      );
    });
    
    if (!hasPermission) {
      console.log(`[BAN] Permission denied for user ${message.author.tag} (${message.author.id})`);
      return message.reply('You do not have permission to use this command.');
    }

    // Check if all required arguments are provided
    if (args.length < 3) {
      return message.reply(`Incorrect syntax. Usage: \`${this.usage}\`\nExample: \`${this.example}\``);
    }

    const identifier = args[0].replace('license:', '');
    const durationStr = args[1];
    const reason = args.slice(2).join(' ');
    
    console.log(`[BAN] Processing ban for identifier: ${identifier}`);
    console.log(`[BAN] Duration: ${durationStr}`);
    console.log(`[BAN] Reason: ${reason}`);
    
    // Check if user is already banned
    console.log(`[BAN] Checking if user is already banned...`);
    const existingBan = await isUserBanned(identifier);
    if (existingBan) {
      console.log(`[BAN] User ${identifier} is already banned`);
      return message.reply('This user is already banned.');
    }
    console.log(`[BAN] User ${identifier} is not currently banned`);

    // Parse duration
    console.log(`[BAN] Parsing ban duration...`);
    const expireTimestamp = parseDuration(durationStr);
    if (!expireTimestamp) {
      console.log(`[BAN] Invalid duration format: ${durationStr}`);
      return message.reply('Invalid duration format. Use format like 1d, 2w, 1m, 1y');
    }

    // Get creator's identifier from database
    console.log(`[BAN] Getting creator's info from database...`);
    const creator = await getUserByDiscordId(message.author.id);
    if (!creator || !creator.license_identifier) {
      console.log(`[BAN] Error: Could not find creator's info in database for Discord ID: ${message.author.id}`);
      return message.reply('Error: Could not find your user information in the database.');
    }
    console.log(`[BAN] Creator's license identifier: ${creator.license_identifier}`);

    try {
      const banData = {
        ban_hash: uuidv4(),
        identifier: identifier,
        reason: reason,
        timestamp: Math.floor(Date.now() / 1000),
        expire: expireTimestamp,
        creator_identifier: creator.license_identifier,
        creation_reason: 'DISCORD_BAN_COMMAND'
      };
      
      console.log(`[BAN] Creating ban record:`, JSON.stringify(banData, null, 2));
      
      // Create ban record
      await banUser(banData);
      console.log(`[BAN] Successfully created ban record for ${identifier}`);

      // Format the ban duration for display
      const durationText = durationStr.endsWith('d') ? `${durationStr} day(s)` :
                         durationStr.endsWith('w') ? `${durationStr} week(s)` :
                         durationStr.endsWith('m') ? `${durationStr} month(s)` :
                         durationStr.endsWith('y') ? `${durationStr} year(s)` :
                         `${durationStr} day(s)`;

      const response = `✅ Successfully banned user with identifier: ${identifier}\n` +
                     `Reason: ${reason}\n` +
                     `Duration: ${durationText}`;
      
      console.log(`[BAN] Sending response to Discord:`, response);
      await message.reply(response);
      
    } catch (error) {
      console.error('[BAN] Error executing ban command:', error);
      const errorMessage = 'An error occurred while processing the ban.';
      console.log(`[BAN] Sending error to Discord: ${errorMessage}`);
      await message.reply(errorMessage);
    }
  },
};
