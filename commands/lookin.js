const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { canUsePrefixCommand } = require('../utils/permissions');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'lookin',
  description: 'Look into servers and channels the bot has access to',
  usage: '$lookin <server_name> [channel_name]',
  example: '$lookin "My Server" or $lookin "My Server" general',
  async execute(message, args) {
    console.log(`[LOOKIN] Command received from ${message.author.tag} (${message.author.id})`);

    // Check permission
    if (!canUsePrefixCommand(message.author.id, 'lookin')) {
      console.log(`[LOOKIN] Permission denied for user ${message.author.tag}`);
      return message.reply('You do not have permission to use this command.');
    }

    if (args.length < 1) {
      return message.reply('Usage: `$lookin <server_name>` or `$lookin <server_name> <channel_name>`');
    }

    const serverName = args[0];
    const channelName = args[1]; // Optional

    try {
      // Find the guild by name
      const guild = message.client.guilds.cache.find(g =>
        g.name.toLowerCase().includes(serverName.toLowerCase())
      );

      if (!guild) {
        return message.reply(`Could not find a server matching "${serverName}". Use \`$how list\` to see available servers.`);
      }

      console.log(`[LOOKIN] Found guild: ${guild.name} (${guild.id})`);

      if (!channelName) {
        // List channels
        await listChannels(message, guild);
      } else {
        // Generate transcript
        await generateTranscript(message, guild, channelName);
      }

    } catch (error) {
      console.error('[LOOKIN] Error executing lookin command:', error);
      await message.reply('An error occurred while processing your request.');
    }
  },
};

async function listChannels(message, guild) {
  try {
    // Get all text and voice channels the bot can access
    const textChannels = guild.channels.cache
      .filter(channel => channel.type === 0) // TEXT CHANNEL
      .sort((a, b) => a.position - b.position);

    const voiceChannels = guild.channels.cache
      .filter(channel => channel.type === 2) // VOICE CHANNEL
      .sort((a, b) => a.position - b.position);

    if (textChannels.size === 0 && voiceChannels.size === 0) {
      return message.reply(`No channels found in ${guild.name}.`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`Channels in ${guild.name}`)
      .setDescription(`Found ${textChannels.size} text and ${voiceChannels.size} voice channel(s):`)
      .setTimestamp(new Date());

    if (textChannels.size > 0) {
      let textList = '';
      for (const [channelId, channel] of textChannels) {
        textList += `#${channel.name}\n`;
      }
      embed.addFields({
        name: 'Text Channels',
        value: `\`\`\`${textList}\`\`\``,
        inline: false
      });
    }

    if (voiceChannels.size > 0) {
      let voiceList = '';
      for (const [channelId, channel] of voiceChannels) {
        const memberCount = channel.members.size;
        voiceList += `${channel.name} (${memberCount} member${memberCount !== 1 ? 's' : ''})\n`;
      }
      embed.addFields({
        name: 'Voice Channels',
        value: `\`\`\`${voiceList}\`\`\``,
        inline: false
      });
    }

    console.log(`[LOOKIN] Sending channel list with ${textChannels.size} text and ${voiceChannels.size} voice channels`);
    await message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('[LOOKIN] Error listing channels:', error);
    await message.reply('An error occurred while fetching channels.');
  }
}

async function generateTranscript(message, guild, channelName) {
  try {
    // Find the channel by name
    const channel = guild.channels.cache.find(ch =>
      ch.type === 0 && ch.name.toLowerCase().includes(channelName.toLowerCase())
    );

    if (!channel) {
      return message.reply(`Could not find a text channel matching "${channelName}" in ${guild.name}.`);
    }

    // Check if bot can read messages
    if (!channel.permissionsFor(message.client.user).has('ReadMessageHistory')) {
      return message.reply('I do not have permission to read message history in that channel.');
    }

    console.log(`[LOOKIN] Fetching messages from #${channel.name} in ${guild.name}`);

    // Fetch last 50 messages
    const messages = await channel.messages.fetch({ limit: 50 });
    const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    if (sortedMessages.size === 0) {
      return message.reply('No messages found in that channel.');
    }

    // Generate HTML transcript
    const htmlContent = generateHTMLTranscript(sortedMessages, channel, guild);

    // Create temporary file
    const fileName = `transcript_${guild.name}_${channel.name}_${Date.now()}.html`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // Ensure temp directory exists
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write HTML to file
    fs.writeFileSync(filePath, htmlContent, 'utf8');

    // Send as attachment
    const attachment = new AttachmentBuilder(filePath, { name: fileName });

    await message.reply({
      content: `Here's the transcript of the last ${sortedMessages.size} messages from #${channel.name} in ${guild.name}:`,
      files: [attachment]
    });

    // Clean up temp file after sending
    setTimeout(() => {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('[LOOKIN] Error cleaning up temp file:', err);
      }
    }, 5000);

    console.log(`[LOOKIN] Generated and sent transcript with ${sortedMessages.size} messages`);

  } catch (error) {
    console.error('[LOOKIN] Error generating transcript:', error);
    await message.reply('An error occurred while generating the transcript.');
  }
}

function generateHTMLTranscript(messages, channel, guild) {
  const timestamp = new Date().toLocaleString();

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord Transcript - #${channel.name}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #36393f;
            color: #dcddde;
            margin: 0;
            padding: 20px;
        }
        .header {
            background-color: #2f3136;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }
        .message {
            background-color: #2f3136;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #7289da;
        }
        .message-author {
            font-weight: bold;
            color: #ffffff;
            margin-bottom: 5px;
        }
        .message-timestamp {
            color: #72767d;
            font-size: 0.8em;
            margin-bottom: 10px;
        }
        .message-content {
            line-height: 1.4;
        }
        .footer {
            text-align: center;
            margin-top: 20px;
            color: #72767d;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Discord Transcript</h1>
        <h2>Server: ${guild.name}</h2>
        <h3>Channel: #${channel.name}</h3>
        <p>Generated on ${timestamp}</p>
    </div>
`;

  messages.forEach(msg => {
    const authorName = msg.author ? msg.author.username : 'Unknown';
    const timestamp = new Date(msg.createdTimestamp).toLocaleString();
    const content = msg.content || '(No text content)';

    html += `
    <div class="message">
        <div class="message-author">${authorName}</div>
        <div class="message-timestamp">${timestamp}</div>
        <div class="message-content">${content.replace(/\n/g, '<br>')}</div>
    </div>
`;
  });

  html += `
    <div class="footer">
        <p>Transcript generated by Discord Bot</p>
    </div>
</body>
</html>
`;

  return html;
}