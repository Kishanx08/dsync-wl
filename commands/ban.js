const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user by their license identifier')
    .addStringOption(option =>
      option.setName('identifier')
        .setDescription('The license identifier of the user to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration of the ban (e.g., 1d, 2w, 1m, 1y)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    console.log(`[BAN] Command received from ${interaction.user.tag} (${interaction.user.id})`);
    await interaction.deferReply({ ephemeral: true });

    const identifier = interaction.options.getString('identifier');
    const reason = interaction.options.getString('reason');
    const durationStr = interaction.options.getString('duration');
    
    console.log(`[BAN] Processing ban for identifier: ${identifier}`);
    console.log(`[BAN] Reason: ${reason}`);
    console.log(`[BAN] Duration: ${durationStr}`);
    
    // Check if user is already banned
    console.log(`[BAN] Checking if user is already banned...`);
    const existingBan = await isUserBanned(identifier);
    if (existingBan) {
      console.log(`[BAN] User ${identifier} is already banned`);
      return interaction.editReply('This user is already banned.');
    }
    console.log(`[BAN] User ${identifier} is not currently banned`);

    // Parse duration
    console.log(`[BAN] Parsing ban duration...`);
    const expireTimestamp = parseDuration(durationStr);
    if (!expireTimestamp) {
      console.log(`[BAN] Invalid duration format: ${durationStr}`);
      return interaction.editReply('Invalid duration format. Use format like 1d, 2w, 1m, 1y');
    }

    // Get creator's identifier from database
    console.log(`[BAN] Getting creator's info from database...`);
    const creator = await getUserByDiscordId(interaction.user.id);
    if (!creator || !creator.license_identifier) {
      console.log(`[BAN] Error: Could not find creator's info in database for Discord ID: ${interaction.user.id}`);
      return interaction.editReply('Error: Could not find your user information in the database.');
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
      await interaction.editReply(response);
      
    } catch (error) {
      console.error('[BAN] Error executing ban command:', error);
      const errorMessage = 'An error occurred while processing the ban.';
      console.log(`[BAN] Sending error to Discord: ${errorMessage}`);
      await interaction.editReply(errorMessage);
    }
  },
};
