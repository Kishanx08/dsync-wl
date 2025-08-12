const fs = require('fs');
const path = require('path');

const LOG_CHANNEL_ID = '1404494706976624723';
const DATA_PATH = path.join(__dirname, '..', 'data', 'whitelistPosts.json');

function ensureDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch (_) {
    return {};
  }
}

function writeStore(store) {
  try {
    ensureDir();
    fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[WLLOG] Failed to write store:', err?.message || err);
  }
}

async function logWhitelistAddition(client, licenseId, user) {
  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return null;
    const whitelistedBy = user ? ` by <@${user.id}>` : '';
    const content = `✅ Whitelisted license ID \`${licenseId}\`${whitelistedBy}`;
    const message = await channel.send({ content });

    const store = readStore();
    store[licenseId] = {
      channelId: channel.id,
      messageId: message.id,
      timestamp: Date.now(),
    };
    writeStore(store);
    return message;
  } catch (err) {
    console.error('[WLLOG] Failed to log whitelist addition:', err?.message || err);
    return null;
  }
}

async function reactRemovalIfLogged(client, licenseId) {
  try {
    const store = readStore();
    const entry = store[licenseId];
    if (!entry || !entry.channelId || !entry.messageId) return false;
    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    if (!channel) return false;
    const message = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (!message) return false;
    await message.react('❌');
    return true;
  } catch (err) {
    console.error('[WLLOG] Failed to react to removal:', err?.message || err);
    return false;
  }
}

module.exports = {
  LOG_CHANNEL_ID,
  logWhitelistAddition,
  reactRemovalIfLogged,
};


