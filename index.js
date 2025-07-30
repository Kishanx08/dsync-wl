require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { hasPermission, ADMIN_IDS } = require('./utils/permissions');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds
  ]
});

// Collection to store commands
client.commands = new Collection();
const slashCommands = [];

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.name, command);
  if (command.data) {
    slashCommands.push(command.data.toJSON());
  }
}

// When the client is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Register slash commands
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing application (/) commands:', error);
  }
});

// Handle prefix commands
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
    // Check if user is a server admin (which we want to prevent from bypassing)
    const member = await message.guild.members.fetch(message.author.id);
    if (member.permissions.has('ADMINISTRATOR')) {
        return message.reply('❌ Server admins cannot use bot commands. Please ask a bot admin for assistance.');
    }

    // Check permissions for admin-only commands
    if (command.adminOnly && !ADMIN_IDS.includes(message.author.id)) {
        return message.reply('❌ You do not have permission to use this command.');
    }

    // Check command permissions
    if (!ADMIN_IDS.includes(message.author.id) && !hasPermission(message.author.id, command.name)) {
        return message.reply('❌ You do not have permission to use this command.');
    }
    await command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.reply('❌ There was an error executing that command.');
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    // Check if user is a server admin (which we want to prevent from bypassing)
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.permissions.has('ADMINISTRATOR')) {
        return interaction.reply({ 
            content: '❌ Server admins cannot use bot commands. Please ask a bot admin for assistance.',
            ephemeral: true 
        });
    }

    // Check permissions for admin-only commands
    if (command.adminOnly && !ADMIN_IDS.includes(interaction.user.id)) {
        return interaction.reply({ 
            content: '❌ You do not have permission to use this command.',
            ephemeral: true 
        });
    }

    // Check command permissions
    if (!ADMIN_IDS.includes(interaction.user.id) && !hasPermission(interaction.user.id, interaction.commandName)) {
        return interaction.reply({
            content: '❌ You do not have permission to use this command.',
            ephemeral: true
        });
    }
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ 
      content: '❌ There was an error executing that command!', 
      ephemeral: true 
    });
  }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);