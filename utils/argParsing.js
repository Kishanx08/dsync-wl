function resolveTargetDiscordId(message, args) {
  if (message.mentions && message.mentions.users && message.mentions.users.size) {
    const user = message.mentions.users.first();
    if (user && user.id) return String(user.id);
  }

  if (Array.isArray(args) && args.length > 0) {
    const raw = String(args[0]);
    // Strip non-digits to support formats like <@123>, <@!123>
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 0) return digits;
  }

  return null;
}

module.exports = {
  resolveTargetDiscordId,
};

