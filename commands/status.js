const { handleStatusCommand } = require('../utils/statusMonitor');

module.exports = {
  name: 'status',
  description: 'Configure FiveM server status updates in a channel',
  usage: '$status #channel',
  aliases: [],
  async execute(message, args) {
    return handleStatusCommand(message, args, message.client);
  }
};

