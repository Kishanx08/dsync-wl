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

module.exports = {
  pool,
  addLicense,
  removeLicense
}; 