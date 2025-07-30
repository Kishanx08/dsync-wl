require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Collection to store commands
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.name, command);
}

// When the client is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Handle messages
client.on('messageCreate', async message => {
  // Ignore messages from bots and DMs
  if (message.author.bot || !message.guild) return;

  // Check for command prefix
  if (!message.content.startsWith('$')) return;

  // Parse command and arguments
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // Get the command
  const command = client.commands.get(commandName) || 
                 client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.reply('❌ There was an error executing that command.');
  }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);