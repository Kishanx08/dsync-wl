const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { EmbedBuilder } = require('discord.js');
const { canUsePrefixCommand } = require('../utils/permissions');

module.exports = {
  name: 'search',
  aliases: ['sh'],
  description: 'Search for players by ID or name from the FiveM server',
  usage: '$search <id|name> or $sh <id|name>',
  example: '$search 123 or $sh John',
  async execute(message, args) {
    console.log(`[SEARCH] Command received from ${message.author.tag} (${message.author.id})`);

    // Get search term
    const searchTerm = args.join(' ').trim();
    if (!searchTerm) {
      console.log(`[SEARCH] No search term provided`);
      return message.reply('Please provide a player ID or name to search for. Example: `$search 123` or `$search John`');
    }

    try {
      console.log(`[SEARCH] Searching for: "${searchTerm}"`);

      // Fetch players data from the configured FiveM server
      const players = await fetchPlayersData();
      if (!players) {
        console.log(`[SEARCH] Failed to fetch players data`);
        return message.reply('Unable to fetch players data from the server. Please try again later.');
      }

      console.log(`[SEARCH] Fetched ${players.length} players from server`);

      // Search for matches
      const matches = findPlayerMatches(players, searchTerm);

      if (matches.length === 0) {
        console.log(`[SEARCH] No matches found for "${searchTerm}"`);
        return message.reply(`No players found matching "${searchTerm}".`);
      }

      // Build response embed
      const embed = buildSearchEmbed(matches, searchTerm);

      console.log(`[SEARCH] Found ${matches.length} matches, sending response`);
      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[SEARCH] Error executing search command:', error);
      await message.reply('An error occurred while searching for players.');
    }
  },
};

async function fetchPlayersData() {
  // Use the new connections.json endpoint
  const url = 'http://45.79.124.203:30120/op-framework/connections.json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    console.log(`[SEARCH] Fetching connections.json from ${url}`);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Discord-Bot/1.0',
        'Accept': 'application/json',
      }
    });

    if (!res.ok) {
      console.error(`[SEARCH] HTTP error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    
    // Handle the new API format
    let players = [];
    if (data?.statusCode === 200 && Array.isArray(data?.data)) {
      players = data.data;
      console.log(`[SEARCH] Successfully fetched ${players.length} players`);
    } else {
      console.error('[SEARCH] Invalid connections.json format');
      return [];
    }

    return players;

  } catch (err) {
    console.error('[SEARCH] Error fetching players data:', err?.message || err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function findPlayerMatches(players, searchTerm) {
  const matches = [];
  const searchLower = searchTerm.toLowerCase();

  // First try exact ID match (source instead of id)
  const exactIdMatch = players.find(p => p.source && p.source.toString() === searchTerm);
  if (exactIdMatch) {
    matches.push(exactIdMatch);
  }

  // Then try partial name matches (if not already found by ID)
  if (matches.length === 0) {
    const nameMatches = players.filter(p =>
      (p.playerName || p.name) && (p.playerName || p.name).toLowerCase().includes(searchLower)
    );
    matches.push(...nameMatches);
  }

  return matches.slice(0, 10); // Limit to 10 results
}

function buildSearchEmbed(matches, searchTerm) {
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Player Search Results')
    .setThumbnail('https://kishann.x02.me/i/5ZVW.png')
    .setTimestamp(new Date());

  if (matches.length === 1) {
    // Single result - show detailed info
    const player = matches[0];
    embed.addFields(
      { name: 'Player ID', value: `${player.source || player.id || 'N/A'}`, inline: true },
      { name: 'Player Name', value: `${player.playerName || player.name || 'Unknown'}`, inline: true },
      { name: 'Joined', value: `${player.joined ? '✅' : '❌'}`, inline: true }
    );

    // Add license identifier if available
    if (player.licenseIdentifier || player.license) {
      embed.addFields({ 
        name: 'License Identifier', 
        value: `\`\`\`${player.licenseIdentifier || player.license}\`\`\``, 
        inline: false 
      });
    }

    embed.setDescription(`Found 1 player matching "${searchTerm}"`);
  } else {
    // Multiple results - show list
    const playerList = matches
      .map(p => {
        const name = p.playerName || p.name || 'Unknown';
        const id = p.source || p.id || 'N/A';
        const license = p.licenseIdentifier || p.license || null;
        return license ? `${id}: ${name} (${license})` : `${id}: ${name}`;
      })
      .join('\n');

    embed.addFields(
      { name: 'Players Found', value: `${matches.length}`, inline: true },
      { name: 'Search Term', value: `"${searchTerm}"`, inline: true },
      { name: 'Player List', value: `\`\`\`${playerList}\`\`\``, inline: false }
    );

    embed.setDescription(`Found ${matches.length} players matching "${searchTerm}"`);
  }

  return embed;
}