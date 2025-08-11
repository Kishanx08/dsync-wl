const fs = require('fs');
const path = require('path');

// Users who can manage permissions via /give and /remove
const GIVE_ADMINS = new Set([
  '1057573344855207966',
  '574928032771604480',
  '526016778195828737',
]);

const PERMISSIONS_FILE = path.join(__dirname, '..', 'permissions.json');

function ensurePermissionsShape(obj) {
  return {
    prefix: {
      all: Array.isArray(obj?.prefix?.all) ? obj.prefix.all : [],
      seniorstaff: Array.isArray(obj?.prefix?.seniorstaff) ? obj.prefix.seniorstaff : [],
      staff: Array.isArray(obj?.prefix?.staff) ? obj.prefix.staff : [],
      superadmin: Array.isArray(obj?.prefix?.superadmin) ? obj.prefix.superadmin : [],
      ban: Array.isArray(obj?.prefix?.ban) ? obj.prefix.ban : [],
      unban: Array.isArray(obj?.prefix?.unban) ? obj.prefix.unban : [],
      check: Array.isArray(obj?.prefix?.check) ? obj.prefix.check : [],
    },
    whitelist: Array.isArray(obj?.whitelist) ? obj.whitelist : [],
  };
}

function readPermissions() {
  try {
    if (!fs.existsSync(PERMISSIONS_FILE)) {
      const initial = ensurePermissionsShape({});
      fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return ensurePermissionsShape(parsed);
  } catch (err) {
    // On any error, reset to default empty shape
    const fallback = ensurePermissionsShape({});
    try { fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(fallback, null, 2)); } catch (_) {}
    return fallback;
  }
}

function writePermissions(perms) {
  const safe = ensurePermissionsShape(perms);
  fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(safe, null, 2));
}

function isGiveAdmin(userId) {
  return GIVE_ADMINS.has(String(userId));
}

function givePermission(role, userId) {
  const id = String(userId);
  const perms = readPermissions();
  const r = role.toLowerCase();

  if (r === 'whitelist') {
    if (!perms.whitelist.includes(id)) perms.whitelist.push(id);
  } else {
    if (!perms.prefix[r]) perms.prefix[r] = [];
    if (!perms.prefix[r].includes(id)) perms.prefix[r].push(id);
  }
  writePermissions(perms);
  return perms;
}

function removePermission(role, userId) {
  const id = String(userId);
  const perms = readPermissions();
  const r = role.toLowerCase();

  if (r === 'whitelist') {
    perms.whitelist = perms.whitelist.filter(x => x !== id);
  } else if (perms.prefix[r]) {
    perms.prefix[r] = perms.prefix[r].filter(x => x !== id);
  }
  writePermissions(perms);
  return perms;
}

function canUsePrefixCommand(userId, commandName) {
  const id = String(userId);
  const name = String(commandName).toLowerCase();
  const perms = readPermissions();

  // Hardcoded bypass for admins
  if (isGiveAdmin(id)) return true;

  // If user is in prefix.all, they can use any prefix command
  if (perms.prefix.all.includes(id)) return true;

  // Command-specific lists
  const list = perms.prefix[name];
  if (Array.isArray(list) && list.includes(id)) return true;

  return false;
}

function canUseWhitelistCommands(userId) {
  const id = String(userId);
  const perms = readPermissions();
  // Hardcoded bypass for admins
  if (isGiveAdmin(id)) return true;
  return perms.whitelist.includes(id) || perms.prefix.all.includes(id);
}

module.exports = {
  isGiveAdmin,
  givePermission,
  removePermission,
  canUsePrefixCommand,
  canUseWhitelistCommands,
  readPermissions,
};

