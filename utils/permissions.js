const fs = require('fs');
const path = require('path');

const PERMISSIONS_FILE = path.join(__dirname, '..', 'permissions.json');
const ADMIN_IDS = ['1057573344855207966', '574928032771604480'];

// Initialize permissions file if it doesn't exist
if (!fs.existsSync(PERMISSIONS_FILE)) {
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify({}, null, 2));
}

function readPermissions() {
    try {
        const data = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading permissions file:', error);
        return {};
    }
}

function writePermissions(permissions) {
    try {
        fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(permissions, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing permissions file:', error);
        return false;
    }
}

function hasPermission(userId, commandName) {
    if (ADMIN_IDS.includes(userId)) return true; // Global admins have all permissions
    
    const permissions = readPermissions();
    const userPerms = permissions[userId] || [];
    return userPerms.includes(commandName);
}

function setPermission(userId, commandName, allowed) {
    const permissions = readPermissions();
    
    if (!permissions[userId]) {
        if (!allowed) return true; // No need to add if not allowing
        permissions[userId] = [];
    }
    
    const userPerms = new Set(permissions[userId]);
    
    if (allowed) {
        userPerms.add(commandName);
    } else {
        userPerms.delete(commandName);
    }
    
    permissions[userId] = Array.from(userPerms);
    return writePermissions(permissions);
}

function getUserPermissions(userId) {
    const permissions = readPermissions();
    return permissions[userId] || [];
}

module.exports = {
    hasPermission,
    setPermission,
    getUserPermissions,
    ADMIN_IDS
};
