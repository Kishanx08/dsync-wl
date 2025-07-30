require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
const { handleSuperadminCommand } = require('./commands/superadmin');

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// Register slash commands on ready
discordReady = false;
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Register commands globally (or use guild-specific for testing)
  await client.application.commands.set(client.commands.map(cmd => cmd.data));
  console.log('Slash commands registered.');
  discordReady = true;
});

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '❌ There was an error executing this command.' });
    } else {
      await interaction.reply({ content: '❌ There was an error executing this command.', ephemeral: true });
    }
  }
});

client.on('messageCreate', async (message) => {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  // Prefix check
  if (!message.content.startsWith('$')) return;

  // Parse command and args
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'superadmin') {
    await handleSuperadminCommand(message, args);
  }
  // ...other prefix commands
});

client.login(process.env.DISCORD_TOKEN); 