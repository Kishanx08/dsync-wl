const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MARIADB_HOST || '',
  user: process.env.MARIADB_USER || '',
  password: process.env.MARIADB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || '',
  port: process.env.MARIADB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function addLicense(license_identifier) {
  const sql = 'INSERT INTO user_whitelist (license_identifier) VALUES (?)';
  try {
    const [result] = await pool.execute(sql, [license_identifier]);
    return result;
  } catch (err) {
    throw err;
  }
}

async function removeLicense(license_identifier) {
  const sql = 'DELETE FROM user_whitelist WHERE license_identifier = ?';
  try {
    const [result] = await pool.execute(sql, [license_identifier]);
    return result;
  } catch (err) {
    throw err;
  }
}

async function banUser(banData) {
  const sql = `
    INSERT INTO user_bans 
    (ban_hash, identifier, reason, timestamp, expire, creator_identifier, creation_reason) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  try {
    const [result] = await pool.execute(sql, [
      banData.ban_hash,
      banData.identifier,
      banData.reason,
      banData.timestamp,
      banData.expire,
      banData.creator_identifier,
      banData.creation_reason
    ]);
    return result;
  } catch (err) {
    console.error('Error banning user:', err);
    throw err;
  }
}

async function unbanUser(identifier) {
  const sql = 'DELETE FROM user_bans WHERE identifier = ?';
  try {
    const [result] = await pool.execute(sql, [identifier]);
    return result.affectedRows > 0;
  } catch (err) {
    console.error('Error unbanning user:', err);
    throw err;
  }
}

async function isUserBanned(identifier) {
  const sql = 'SELECT * FROM user_bans WHERE identifier = ? AND (expire > UNIX_TIMESTAMP() OR expire = 0) LIMIT 1';
  try {
    console.log(`[DATABASE] Executing ban check for identifier: ${identifier}`);
    console.log(`[DATABASE] SQL: ${sql}`);
    
    const [rows] = await pool.execute(sql, [identifier]);
    
    console.log(`[DATABASE] Ban check result for ${identifier}:`, {
      found: rows.length > 0,
      currentTime: Math.floor(Date.now() / 1000),
      row: rows[0] || 'No matching ban record'
    });
    
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('[DATABASE] Error checking user ban status:', err);
    throw err;
  }
}

async function getUserByDiscordId(discordId) {
  const sql = 'SELECT * FROM users WHERE discord_id = ? LIMIT 1';
  try {
    const [rows] = await pool.execute(sql, [discordId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('Error getting user by Discord ID:', err);
    throw err;
  }
}

module.exports = {
  pool,
  addLicense,
  removeLicense,
  banUser,
  unbanUser,
  isUserBanned,
  getUserByDiscordId
};