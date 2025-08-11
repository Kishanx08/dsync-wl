const { unbanUser, isUserBanned, getUserByDiscordId } = require('../utils/mariadb');
const { canUsePrefixCommand } = require('../utils/permissions');

module.exports = {
  name: 'unban',
  description: 'Remove a ban from a user by their license identifier',
  usage: '$unban <license_identifier> <reason>',
  example: '$unban license:123456 Mistake in ban',
  async execute(message, args) {
    console.log(`[UNBAN] Command received from ${message.author.tag} (${message.author.id})`);
    
    // Permission via file-backed permissions
    const hasPermission = canUsePrefixCommand(message.author.id, 'unban');
    if (!hasPermission) {
      console.log(`[UNBAN] Permission denied for user ${message.author.tag} (${message.author.id})`);
      return message.reply('You do not have permission to use this command.');
    }

    // Check if all required arguments are provided
    if (args.length < 2) {
      return message.reply(`Incorrect syntax. Usage: \`${this.usage}\`\nExample: \`${this.example}\``);
    }

    const identifier = args[0].replace('license:', '');
    const reason = args.slice(1).join(' ');
    
    console.log(`[UNBAN] Processing unban for identifier: ${identifier}`);
    console.log(`[UNBAN] Reason: ${reason}`);
    
    try {
      // Check if user is actually banned
      console.log(`[UNBAN] Checking if user is banned...`);
      const isBanned = await isUserBanned(identifier);
      if (!isBanned) {
        console.log(`[UNBAN] User ${identifier} is not currently banned`);
        return message.reply('This user is not currently banned.');
      }
      
      console.log(`[UNBAN] User ${identifier} is currently banned, proceeding with unban...`);
      
      // Get creator's identifier from database
      console.log(`[UNBAN] Getting creator's info from database...`);
      const creator = await getUserByDiscordId(message.author.id);
      if (!creator || !creator.license_identifier) {
        console.log(`[UNBAN] Error: Could not find creator's info in database for Discord ID: ${message.author.id}`);
        return message.reply('Error: Could not find your user information in the database.');
      }
      console.log(`[UNBAN] Creator's license identifier: ${creator.license_identifier}`);
      
      // Remove the ban
      console.log(`[UNBAN] Removing ban for ${identifier}...`);
      await unbanUser(identifier);
      console.log(`[UNBAN] Successfully removed ban for ${identifier}`);
      
      const response = `✅ Successfully unbanned user with identifier: ${identifier}\n` +
                     `Reason: ${reason}`;
      
      console.log(`[UNBAN] Sending response to Discord:`, response);
      await message.reply(response);
      
    } catch (error) {
      console.error('[UNBAN] Error executing unban command:', error);
      const errorMessage = 'An error occurred while processing the unban.';
      console.log(`[UNBAN] Sending error to Discord: ${errorMessage}`);
      await message.reply(errorMessage);
    }
  },
};
