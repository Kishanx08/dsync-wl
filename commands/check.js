const fs = require('fs');
const path = require('path');

function loadCharacters() {
  try {
    const filePath = path.join(__dirname, '../data/characters.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading characters data:', error);
    return [];
  }
}

function searchByCharacterId(characters, id) {
  return characters.find(char => char.character_id === parseInt(id));
}

function searchByLicense(characters, license) {
  // Handle both formats: with and without 'license:' prefix
  const cleanLicense = license.replace('license:', '');
  return characters.filter(char => 
    char.licence_identifier === license || 
    char.licence_identifier === `license:${cleanLicense}` ||
    char.licence_identifier === cleanLicense
  );
}

function searchByPhoneNumber(characters, phone) {
  return characters.find(char => char.phone_number === phone);
}

function searchByName(characters, name) {
  const searchTerms = name.toLowerCase().split(' ').filter(term => term.length > 0);
  
  return characters.filter(char => {
    const firstName = char.first_name.toLowerCase();
    const lastName = char.last_name.toLowerCase();
    const fullName = `${firstName} ${lastName}`;
    
    // If multiple search terms, all must match somewhere in the name
    if (searchTerms.length > 1) {
      return searchTerms.every(term => 
        firstName.includes(term) || 
        lastName.includes(term) || 
        fullName.includes(term)
      );
    }
    
    // Single search term - match if it appears in first name, last name, or full name
    const term = searchTerms[0];
    return firstName.includes(term) || 
           lastName.includes(term) || 
           fullName.includes(term);
  });
}

function formatCharacterProfile(character) {
  return `**Character Profile**
\`\`\`
Character ID: ${character.character_id}
Full Name: ${character.first_name} ${character.last_name}
Phone Number: ${character.phone_number}
Date of Birth: ${character.date_of_birth}
License ID: ${character.licence_identifier}
Job: ${character.job_name || 'N/A'}${character.department_name ? ` (${character.department_name})` : ''}${character.position_name ? ` - ${character.position_name}` : ''}
\`\`\``;
}

module.exports = {
  name: 'check',
  aliases: ['ck'],
  description: 'Check character information from the database',
  usage: '$check <cid | license | ld | num | number | name> <value>',
  examples: [
    '$check cid 5861',
    '$check license license:371bb351c24c5477d42481ba601a4b81d3c03268',
    '$check license 371bb351c24c5477d42481ba601a4b81d3c03268',
    '$check ld license:371bb351c24c5477d42481ba601a4b81d3c03268',
    '$check ld 371bb351c24c5477d42481ba601a4b81d3c03268',
    '$check num 444-9818',
    '$check number 444-9818',
    '$check name "Krishna Soni"'
  ],
  async execute(message, args) {
    if (!args[0]) {
      return message.reply('Please provide a search type. Usage: `$check <cid | license | ld | num | number | name> <value>`');
    }

    const searchType = args[0].toLowerCase();

    // Handle list command
    if (searchType === 'list') {
      const helpMessage = `**$check Command Usage Guide**

\`\`\`
$check cid {character_id}     - Search by Character ID
  Example: $check cid 5861

$check license {license}     - Search by License (full form)
  Example: $check license license:371bb351c24c5477d42481ba601a4b81d3c03268
  Example: $check license 371bb351c24c5477d42481ba601a4b81d3c03268

$check ld {license}          - Search by License (short form)
  Example: $check ld license:371bb351c24c5477d42481ba601a4b81d3c03268
  Example: $check ld 371bb351c24c5477d42481ba601a4b81d3c03268

$check num {phone_number}    - Search by Phone Number
  Example: $check num 444-9818

$check number {phone_number} - Search by Phone Number (full form)
  Example: $check number 444-9818

$check name {name}          - Search by Name (supports partial names)
  Example: $check name "Krishna Soni"
  Example: $check name Krishna
  Example: $check name Soni
  Example: $check name Ahuja

Alias: $ck works the same as $check
\`\`\`

`;
      
      return message.reply(helpMessage);
    }

    const searchValue = args.slice(1).join(' ');

    if (!searchValue) {
      return message.reply('Please provide a search value. Usage: `$check <cid | license | ld | num | number | name> <value>`');
    }

    try {
      const characters = loadCharacters();
      
      if (characters.length === 0) {
        return message.reply('Character data is not available at the moment. Please try again later.');
      }

      let results = [];

      switch (searchType) {
        case 'cid':
          results = searchByCharacterId(characters, searchValue);
          if (results) {
            results = [results];
          }
          break;
          
        case 'license':
        case 'ld':
          results = searchByLicense(characters, searchValue);
          break;
          
        case 'num':
        case 'number':
          results = searchByPhoneNumber(characters, searchValue);
          if (results) {
            results = [results];
          }
          break;
          
        case 'name':
          results = searchByName(characters, searchValue);
          break;
          
        default:
          return message.reply('Invalid search type. Use: `cid`, `license`, `ld`, `num`, `number`, or `name`');
      }

      if (!results || results.length === 0) {
        return message.reply(`No characters found for ${searchType}: ${searchValue}`);
      }

      if (results.length === 1) {
        return message.reply(formatCharacterProfile(results[0]));
      }

      // Multiple results
      let response = `**Found ${results.length} characters matching "${searchValue}"**\n\n`;
      
      // Limit to first 10 results to avoid message length issues
      const limitedResults = results.slice(0, 10);
      
      limitedResults.forEach((char, index) => {
        response += `${index + 1}. **${char.first_name} ${char.last_name}** (ID: ${char.character_id})\n`;
        response += `   Phone: ${char.phone_number} | Job: ${char.job_name || 'N/A'}\n\n`;
      });

      if (results.length > 10) {
        response += `... and ${results.length - 10} more results. Please be more specific.`;
      }

      return message.reply(response);

    } catch (error) {
      console.error('Error executing check command:', error);
      return message.reply('An error occurred while searching for character information.');
    }
  }
};
