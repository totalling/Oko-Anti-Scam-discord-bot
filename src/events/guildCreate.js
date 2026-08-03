'use strict';
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const style = require('../moderation/style');
const { getLogger } = require('../logger');
const logger = getLogger('scam_bot.welcome');
async function onGuildCreate(guild, ctx) {
  await ctx.updatePresence();
  const me = guild.members.me;
  let channel = guild.systemChannel;
  if (!channel || !channel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
    channel =
      guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.permissionsFor(me).has(PermissionFlagsBits.SendMessages)
      ) ?? null;
  }
  if (!channel) return;
  const description =
    '👋 **Thanks for adding me!**\n\n' +
    'I automatically detect and remove crypto/giveaway scam messages.\n\n' +
    '**Get started:**\n' +
    '> `/scam setlogchannel` — set where detections get logged\n' +
    '> `/scam toggle` — turn auto-moderation on/off (on by default)\n' +
    '> `/scam setpunishment` — choose ban, kick, or timeout for scammers\n' +
    '> `/scam honeypot setup` — set up a trap channel for scammers\n' +
    '> `/support` — get help in the support server';
  const container = style.build(description, { thumbnailUrl: me.displayAvatarURL() });
  try {
    await channel.send(style.payload(container));
  } catch (err) {
    logger.warn(`Could not send welcome message in guild ${guild.id}: ${err.message}`);
  }
}
module.exports = { onGuildCreate };
