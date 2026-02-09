require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const { getMonitor } = require('./utils/statusMonitor');
const fs = require('fs');

const path = require('path');

// Import character updater to run on startup
require('./update-characters');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Collections to store commands
client.commands = new Collection();
client.slashCommands = new Collection();

// Load message commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load commands into collections
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  
  // Message commands (prefixed with $)
  if (command.name && command.execute) {
    client.commands.set(command.name, command);
  }
  
  // Slash commands
  if (command.data && command.execute) {
    client.slashCommands.set(command.data.name, command);
  }
}

// When the client is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Register slash commands
  try {
    console.log('Started refreshing application (/) commands.');
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    // Convert slash commands to JSON
    const slashCommands = [];
    for (const [name, command] of client.slashCommands) {
      slashCommands.push(command.data.toJSON());
    }
    
    // Register commands for all guilds (global commands)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: slashCommands },
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing application (/) commands:', error);
  }

  // Resume status monitor after restarts using persisted channel/message
  try {
    const monitor = getMonitor(client);
    await monitor.resumeFromStorage();
    if (monitor.channelId) {
      await monitor.update();
      monitor.start();
      console.log('[STATUS] Monitor resumed after startup');
    }
  } catch (err) {
    console.error('[STATUS] Failed to resume monitor:', err?.message || err);
  }

  // Resume players monitors after restarts
  try {
    const fs = require('fs');
    const path = require('path');
    const { getPlayersMonitor } = require('./utils/statusMonitor');
    const playersConfigPath = path.join(__dirname, 'data', 'playersConfig.json');
    if (fs.existsSync(playersConfigPath)) {
      const playersConfig = JSON.parse(fs.readFileSync(playersConfigPath, 'utf8'));
      for (const [channelId, config] of Object.entries(playersConfig)) {
        if (config.url) {
          const playersMonitor = getPlayersMonitor(client, channelId);
          playersMonitor.setUrl(config.url);
          await playersMonitor.resumeFromStorage();
          await playersMonitor.update();
          playersMonitor.start();
          console.log(`[PLAYERS] Monitor resumed for channel ${channelId}`);
        }
      }
    }
  } catch (err) {
    console.error('[PLAYERS] Failed to resume monitors:', err?.message || err);
  }

  // Load live forwarding configurations
  try {
    const { readLiveConfig } = require('./commands/live');
    const liveConfig = readLiveConfig();
    const activeForwarding = Object.keys(liveConfig).length;
    if (activeForwarding > 0) {
      console.log(`[LIVE] Loaded ${activeForwarding} live forwarding configuration(s)`);
    }
  } catch (err) {
    console.error('[LIVE] Failed to load forwarding config:', err?.message || err);
  }
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.slashCommands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

// Handle button interactions (e.g., Players list)
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'show_players') {
    try {
      const monitor = getMonitor(client);
      const names = await monitor.fetchPlayersList();

      if (names === null) {
        return interaction.reply({ content: 'Server is offline or unreachable right now.', ephemeral: true });
      }

      if (names.length === 0) {
        return interaction.reply({ content: 'No players are currently online.', ephemeral: true });
      }

      const list = names.slice(0, 100).join('\n');
      const extra = names.length > 100 ? `\n...and ${names.length - 100} more` : '';
      return interaction.reply({ content: `Current players (${names.length}):\n${list}${extra}`.slice(0, 1900), ephemeral: true });
    } catch (err) {
      console.error('[BUTTON] show_players error:', err?.message || err);
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: 'Failed to fetch players. Please try again shortly.', ephemeral: true });
      }
      return interaction.reply({ content: 'Failed to fetch players. Please try again shortly.', ephemeral: true });
    }
  }
});

// Handle message-based commands (prefixed with $)
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
    await message.reply('There was an error executing that command!');
  }
});

// Handle live message forwarding
client.on('messageCreate', async message => {
  // Ignore messages from bots and DMs
  if (message.author.bot || !message.guild) return;

  try {
    const { readLiveConfig } = require('./commands/live');
    const liveConfig = readLiveConfig();

    // Check for both channel-specific and server-wide forwarding
    let config = null;
    const channelSpecificKey = `${message.guild.id}_${message.channel.id}`;
    const serverWideKey = `${message.guild.id}_server`;

    if (liveConfig[channelSpecificKey]) {
      config = liveConfig[channelSpecificKey];
    } else if (liveConfig[serverWideKey]) {
      config = liveConfig[serverWideKey];
    }

    if (!config) return; // No forwarding configured

    // Don't forward messages from the target channel to avoid loops
    if (message.channel.id === config.targetChannelId) return;

    // Get target channel
    const targetChannel = await client.channels.fetch(config.targetChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== 0) return;

    // Check if bot can send messages in target channel
    if (!targetChannel.permissionsFor(client.user).has('SendMessages')) return;

    // Create embed for the forwarded message
    const embed = new EmbedBuilder()
      .setColor(message.member?.displayColor || 0x5865F2) // Use role color or Discord blurple
      .setAuthor({
        name: `${message.author.username}#${message.author.discriminator}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true, size: 256 })
      })
      .addFields(
        { name: 'User ID', value: `\`${message.author.id}\``, inline: true },
        { name: 'Server', value: message.guild.name, inline: true },
        { name: 'Channel', value: `#${message.channel.name}`, inline: true }
      )
      .setTimestamp(message.createdTimestamp)
      .setFooter({
        text: `Live Forward • ${config.type === 'server' ? 'Server-wide' : 'Channel-specific'}`,
        iconURL: message.guild.iconURL({ dynamic: true, size: 32 })
      });

    // Handle message content and attachments
    let content = message.content || '';
    const attachments = message.attachments;
    const embeds = message.embeds;

    // Handle message replies
    if (message.reference) {
      try {
        const referencedMessage = await message.fetchReference();
        embed.addFields({
          name: '🔁 Replying to',
          value: `${referencedMessage.author.username}: ${referencedMessage.content?.substring(0, 100) || '*No content*'}${referencedMessage.content?.length > 100 ? '...' : ''}`,
          inline: false
        });
      } catch (err) {
        embed.addFields({
          name: '🔁 Replying to',
          value: '*Could not fetch referenced message*',
          inline: false
        });
      }
    }

    // Handle forwarded messages
    if (message.messageSnapshots && message.messageSnapshots.length > 0) {
      const snapshot = message.messageSnapshots[0];
      embed.addFields({
        name: '📤 Forwarded Message',
        value: `From: ${snapshot.author?.username || 'Unknown'}\nContent: ${snapshot.content?.substring(0, 200) || '*No content*'}${snapshot.content?.length > 200 ? '...' : ''}`,
        inline: false
      });
    }

    // Add text content if present
    if (content) {
      // Truncate if too long for embed description
      if (content.length > 4096) {
        content = content.substring(0, 4093) + '...';
      }
      embed.setDescription(content);
    } else if (attachments.size === 0 && embeds.length === 0 && !message.reference && !message.messageSnapshots) {
      embed.setDescription('*No text content*');
    }

    // Handle attachments (images, files, videos)
    if (attachments.size > 0) {
      const attachment = attachments.first();
      const isImage = attachment.contentType?.startsWith('image/');
      const isVideo = attachment.contentType?.startsWith('video/');

      if (isImage) {
        embed.setImage(attachment.url);
      } else if (isVideo) {
        embed.addFields({
          name: 'Video',
          value: `[${attachment.name}](${attachment.url})`,
          inline: false
        });
      } else {
        embed.addFields({
          name: 'Attachment',
          value: `[${attachment.name}](${attachment.url}) (${Math.round(attachment.size / 1024)} KB)`,
          inline: false
        });
      }

      // Add additional attachments if any
      if (attachments.size > 1) {
        const otherAttachments = attachments.map(att => `[${att.name}](${att.url})`).slice(1);
        embed.addFields({
          name: 'Additional Files',
          value: otherAttachments.join('\n'),
          inline: false
        });
      }
    }

    // Handle original embeds from the message
    if (embeds.length > 0) {
      // Add a note about original embeds
      embed.addFields({
        name: 'Original Embeds',
        value: `This message contained ${embeds.length} embed(s)`,
        inline: false
      });
    }

    // Handle stickers
    if (message.stickers.size > 0) {
      const stickerNames = message.stickers.map(s => s.name).join(', ');
      embed.addFields({
        name: 'Stickers',
        value: stickerNames,
        inline: false
      });
    }

    // Prepare message to send
    const messageOptions = { embeds: [embed] };

    // If the original message had embeds, try to include them (but limit to avoid hitting limits)
    if (embeds.length > 0 && embeds.length <= 2) {
      // Clone the original embeds and modify them slightly
      const forwardedEmbeds = embeds.map(originalEmbed => {
        const newEmbed = EmbedBuilder.from(originalEmbed);
        // Add a small footer to indicate it's forwarded
        newEmbed.setFooter({
          text: `Forwarded from ${message.guild.name}#${message.channel.name}`,
          iconURL: message.guild.iconURL({ dynamic: true, size: 16 })
        });
        return newEmbed;
      });

      messageOptions.embeds = [embed, ...forwardedEmbeds];
    }

    // Send the message to target channel
    await targetChannel.send(messageOptions);

    console.log(`[LIVE] Forwarded ${config.type} message from ${message.author.tag} in ${message.guild.name}#${message.channel.name} to #${targetChannel.name}`);

  } catch (error) {
    console.error('[LIVE] Error forwarding message:', error);
  }
});

// Handle message edits
client.on('messageUpdate', async (oldMessage, newMessage) => {
  // Ignore messages from bots and DMs
  if (newMessage.author.bot || !newMessage.guild) return;

  try {
    const { readLiveConfig } = require('./commands/live');
    const liveConfig = readLiveConfig();

    // Check for both channel-specific and server-wide forwarding
    let config = null;
    const channelSpecificKey = `${newMessage.guild.id}_${newMessage.channel.id}`;
    const serverWideKey = `${newMessage.guild.id}_server`;

    if (liveConfig[channelSpecificKey]) {
      config = liveConfig[channelSpecificKey];
    } else if (liveConfig[serverWideKey]) {
      config = liveConfig[serverWideKey];
    }

    if (!config) return; // No forwarding configured

    // Don't forward messages from the target channel to avoid loops
    if (newMessage.channel.id === config.targetChannelId) return;

    // Get target channel
    const targetChannel = await client.channels.fetch(config.targetChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== 0) return;

    // Check if bot can send messages in target channel
    if (!targetChannel.permissionsFor(client.user).has('SendMessages')) return;

    // Create embed for the edited message
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C) // Yellow for edits
      .setAuthor({
        name: `${newMessage.author.username}#${newMessage.author.discriminator}`,
        iconURL: newMessage.author.displayAvatarURL({ dynamic: true, size: 256 })
      })
      .setTitle('📝 Message Edited')
      .addFields(
        { name: 'User ID', value: `\`${newMessage.author.id}\``, inline: true },
        { name: 'Server', value: newMessage.guild.name, inline: true },
        { name: 'Channel', value: `#${newMessage.channel.name}`, inline: true }
      )
      .setTimestamp(new Date())
      .setFooter({
        text: `Live Forward • ${config.type === 'server' ? 'Server-wide' : 'Channel-specific'}`,
        iconURL: newMessage.guild.iconURL({ dynamic: true, size: 32 })
      });

    // Add old content
    if (oldMessage.content) {
      const oldContent = oldMessage.content.length > 1024 ? 
        oldMessage.content.substring(0, 1021) + '...' : oldMessage.content;
      embed.addFields({
        name: '🔴 Old Content',
        value: oldContent || '*No content*',
        inline: false
      });
    }

    // Add new content
    if (newMessage.content) {
      const newContent = newMessage.content.length > 1024 ? 
        newMessage.content.substring(0, 1021) + '...' : newMessage.content;
      embed.addFields({
        name: '🟢 New Content',
        value: newContent || '*No content*',
        inline: false
      });
    }

    // Send the embed to target channel
    await targetChannel.send({ embeds: [embed] });

    console.log(`[LIVE] Forwarded message edit from ${newMessage.author.tag} in ${newMessage.guild.name}#${newMessage.channel.name}`);

  } catch (error) {
    console.error('[LIVE] Error forwarding message edit:', error);
  }
});

// Handle message deletions
client.on('messageDelete', async message => {
  // Ignore messages from bots and DMs
  if (message.author.bot || !message.guild) return;

  try {
    const { readLiveConfig } = require('./commands/live');
    const liveConfig = readLiveConfig();

    // Check for both channel-specific and server-wide forwarding
    let config = null;
    const channelSpecificKey = `${message.guild.id}_${message.channel.id}`;
    const serverWideKey = `${message.guild.id}_server`;

    if (liveConfig[channelSpecificKey]) {
      config = liveConfig[channelSpecificKey];
    } else if (liveConfig[serverWideKey]) {
      config = liveConfig[serverWideKey];
    }

    if (!config) return; // No forwarding configured

    // Don't forward messages from the target channel to avoid loops
    if (message.channel.id === config.targetChannelId) return;

    // Get target channel
    const targetChannel = await client.channels.fetch(config.targetChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== 0) return;

    // Check if bot can send messages in target channel
    if (!targetChannel.permissionsFor(client.user).has('SendMessages')) return;

    // Create embed for the deleted message
    const embed = new EmbedBuilder()
      .setColor(0xED4245) // Red for deletions
      .setAuthor({
        name: `${message.author.username}#${message.author.discriminator}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true, size: 256 })
      })
      .setTitle('🗑️ Message Deleted')
      .addFields(
        { name: 'User ID', value: `\`${message.author.id}\``, inline: true },
        { name: 'Server', value: message.guild.name, inline: true },
        { name: 'Channel', value: `#${message.channel.name}`, inline: true }
      )
      .setTimestamp(new Date())
      .setFooter({
        text: `Live Forward • ${config.type === 'server' ? 'Server-wide' : 'Channel-specific'}`,
        iconURL: message.guild.iconURL({ dynamic: true, size: 32 })
      });

    // Add deleted content if available
    if (message.content) {
      const content = message.content.length > 1024 ? 
        message.content.substring(0, 1021) + '...' : message.content;
      embed.addFields({
        name: '📄 Deleted Content',
        value: content,
        inline: false
      });
    }

    // Add attachment info if any
    if (message.attachments.size > 0) {
      const attachmentNames = message.attachments.map(att => att.name).join(', ');
      embed.addFields({
        name: '📎 Deleted Attachments',
        value: attachmentNames,
        inline: false
      });
    }

    // Send the embed to target channel
    await targetChannel.send({ embeds: [embed] });

    console.log(`[LIVE] Forwarded message deletion from ${message.author.tag} in ${message.guild.name}#${message.channel.name}`);

  } catch (error) {
    console.error('[LIVE] Error forwarding message deletion:', error);
  }
});

// Handle poll answers
client.on('pollVoteAdd', async (poll, user, answerId) => {
  // Ignore polls from DMs and bots
  if (!poll.message.guild || user.bot) return;

  try {
    const { readLiveConfig } = require('./commands/live');
    const liveConfig = readLiveConfig();

    // Check for both channel-specific and server-wide forwarding
    let config = null;
    const channelSpecificKey = `${poll.message.guild.id}_${poll.message.channel.id}`;
    const serverWideKey = `${poll.message.guild.id}_server`;

    if (liveConfig[channelSpecificKey]) {
      config = liveConfig[channelSpecificKey];
    } else if (liveConfig[serverWideKey]) {
      config = liveConfig[serverWideKey];
    }

    if (!config) return; // No forwarding configured

    // Don't forward polls from the target channel to avoid loops
    if (poll.message.channel.id === config.targetChannelId) return;

    // Get target channel
    const targetChannel = await client.channels.fetch(config.targetChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== 0) return;

    // Check if bot can send messages in target channel
    if (!targetChannel.permissionsFor(client.user).has('SendMessages')) return;

    // Find the answer text
    const answer = poll.answers.find(a => a.answerId === answerId);
    const answerText = answer ? answer.text : 'Unknown option';

    // Create embed for the poll vote
    const embed = new EmbedBuilder()
      .setColor(0x5865F2) // Blue for polls
      .setAuthor({
        name: `${user.username}#${user.discriminator}`,
        iconURL: user.displayAvatarURL({ dynamic: true, size: 256 })
      })
      .setTitle('📊 Poll Vote Added')
      .setDescription(`Voted for: **${answerText}**`)
      .addFields(
        { name: 'User ID', value: `\`${user.id}\``, inline: true },
        { name: 'Server', value: poll.message.guild.name, inline: true },
        { name: 'Channel', value: `#${poll.message.channel.name}`, inline: true }
      )
      .addFields({
        name: 'Poll Question',
        value: poll.question.text || '*No question*',
        inline: false
      })
      .setTimestamp(new Date())
      .setFooter({
        text: `Live Forward • ${config.type === 'server' ? 'Server-wide' : 'Channel-specific'}`,
        iconURL: poll.message.guild.iconURL({ dynamic: true, size: 32 })
      });

    // Send the embed to target channel
    await targetChannel.send({ embeds: [embed] });

    console.log(`[LIVE] Forwarded poll vote from ${user.tag} in ${poll.message.guild.name}#${poll.message.channel.name}`);

  } catch (error) {
    console.error('[LIVE] Error forwarding poll vote:', error);
  }
});

// Handle thread creation
client.on('threadCreate', async thread => {
  // Ignore threads from DMs
  if (!thread.guild) return;

  try {
    const { readLiveConfig } = require('./commands/live');
    const liveConfig = readLiveConfig();

    // Only check for server-wide forwarding for threads
    const serverWideKey = `${thread.guild.id}_server`;
    const config = liveConfig[serverWideKey];

    if (!config) return; // No server-wide forwarding configured

    // Don't forward threads from the target channel to avoid loops
    if (thread.parentId === config.targetChannelId) return;

    // Get target channel
    const targetChannel = await client.channels.fetch(config.targetChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== 0) return;

    // Check if bot can send messages in target channel
    if (!targetChannel.permissionsFor(client.user).has('SendMessages')) return;

    // Create embed for the thread
    const embed = new EmbedBuilder()
      .setColor(0x5865F2) // Blue for threads
      .setAuthor({
        name: `${thread.owner?.user?.username || 'Unknown'}#${thread.owner?.user?.discriminator || '0000'}`,
        iconURL: thread.owner?.user?.displayAvatarURL({ dynamic: true, size: 256 })
      })
      .setTitle('🧵 Thread Created')
      .setDescription(thread.name)
      .addFields(
        { name: 'Thread ID', value: `\`${thread.id}\``, inline: true },
        { name: 'Server', value: thread.guild.name, inline: true },
        { name: 'Parent Channel', value: `#${thread.parent?.name || 'Unknown'}`, inline: true }
      )
      .addFields({
        name: 'Thread Type',
        value: thread.type === 12 ? 'Private Thread' : 'Public Thread',
        inline: true
      })
      .setTimestamp(new Date())
      .setFooter({
        text: 'Live Forward • Server-wide',
        iconURL: thread.guild.iconURL({ dynamic: true, size: 32 })
      });

    // Send the embed to target channel
    await targetChannel.send({ embeds: [embed] });

    console.log(`[LIVE] Forwarded thread creation in ${thread.guild.name}#${thread.parent?.name}`);

  } catch (error) {
    console.error('[LIVE] Error forwarding thread creation:', error);
  }
});

// Handle live voice state forwarding
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const { readLiveConfig } = require('./commands/live');
    const liveConfig = readLiveConfig();

    // Only forward for server-wide configurations
    const serverWideKey = `${newState.guild.id}_server`;
    const config = liveConfig[serverWideKey];

    if (!config) return; // No server-wide forwarding configured

    // Get target channel
    const targetChannel = await client.channels.fetch(config.targetChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== 0) return;

    // Check if bot can send messages in target channel
    if (!targetChannel.permissionsFor(client.user).has('SendMessages')) return;

    const member = newState.member || oldState.member;
    if (!member) return;

    let eventType = '';
    let description = '';
    let color = 0x57F287; // Green for join

    if (!oldState.channel && newState.channel) {
      // Joined voice channel
      eventType = 'Voice Join';
      description = `${member.user.username} joined ${newState.channel.name}`;
    } else if (oldState.channel && !newState.channel) {
      // Left voice channel
      eventType = 'Voice Leave';
      description = `${member.user.username} left ${oldState.channel.name}`;
      color = 0xED4245; // Red for leave
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      // Moved between channels
      eventType = 'Voice Move';
      description = `${member.user.username} moved from ${oldState.channel.name} to ${newState.channel.name}`;
      color = 0xFEE75C; // Yellow for move
    } else if (oldState.mute !== newState.mute || oldState.deaf !== newState.deaf) {
      // Mute/deaf change
      eventType = 'Voice State Change';
      let changes = [];
      if (oldState.mute !== newState.mute) {
        changes.push(newState.mute ? 'muted' : 'unmuted');
      }
      if (oldState.deaf !== newState.deaf) {
        changes.push(newState.deaf ? 'deafened' : 'undeafened');
      }
      description = `${member.user.username} was ${changes.join(' and ')} in ${newState.channel?.name || oldState.channel.name}`;
      color = 0x5865F2; // Blue for state change
    } else {
      return; // No significant change
    }

    // Create embed for the forwarded event
    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: `${member.user.username}#${member.user.discriminator}`,
        iconURL: member.user.displayAvatarURL({ dynamic: true, size: 256 })
      })
      .setTitle(eventType)
      .setDescription(description)
      .addFields(
        { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
        { name: 'Server', value: newState.guild.name, inline: true }
      )
      .setTimestamp(new Date())
      .setFooter({
        text: `Live Forward • Server-wide Voice`,
        iconURL: newState.guild.iconURL({ dynamic: true, size: 32 })
      });

    // Send the embed to target channel
    await targetChannel.send({ embeds: [embed] });

    console.log(`[LIVE] Forwarded voice event: ${eventType} for ${member.user.tag} in ${newState.guild.name}`);

  } catch (error) {
    console.error('[LIVE] Error forwarding voice event:', error);
  }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);