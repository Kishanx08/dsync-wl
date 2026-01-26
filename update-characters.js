const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const url = 'https://pd-server.legacyroleplay.in/public/characters';
const headers = {
  'Referer': 'https://lrpin.legacymdt.top',
  'Origin': 'https://lrpin.legacymdt.top',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
};

async function updateCharacters() {
  try {
    console.log('Fetching characters data...');
    const response = await axios.get(url, { headers });
    const data = response.data;
    // Assume data is an array of objects
    const filePath = path.join(__dirname, 'data/characters.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log('Characters data updated successfully at', new Date().toISOString());
  } catch (error) {
    console.error('Error updating characters:', error.message);
  }
}

// Schedule to run every 7 days at midnight (0 0 */7 * *)
cron.schedule('0 0 */7 * *', () => {
  console.log('Running scheduled update...');
  updateCharacters();
});

// Run once on start
updateCharacters();

console.log('Character update script started. Will run every 7 days.');
