'use strict';
const { PermissionFlagsBits } = require('discord.js');
const pipeline = require('../detection/pipeline');
const actions = require('../moderation/actions');
const guildSettings = require('../moderation/guildSettings');
const { fetchImageBytes } = require('../attachments');
const { getLogger } = require('../logger');
const logger = getLogger('scam_bot.listener');
async function _handleHoneypot(message) {
  try {
    await message.delete();
  } catch {
  }
  const member = message.member;
  if (!member) return;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    logger.debug(`Honeypot triggered by moderator ${member.id} — ignoring`);
    return;
  }
  const punishment = guildSettings.getHoneypotPunishment(message.guild.id);
  const punished = await actions.applyPunishment(member, punishment, 'Triggered honeypot trap channel');
  logger.info(`Honeypot triggered: user=${member.id} punishment=${punishment} success=${punished}`);
}
async function onMessageCreate(message, ctx) {
  if (message.author.bot || !message.guild) return;
  const honeypotChannelId = guildSettings.getHoneypotChannelId(message.guild.id);
  if (honeypotChannelId && message.channel.id === String(honeypotChannelId)) {
    await _handleHoneypot(message);
    return;
  }
  if (!message.content && message.attachments.size === 0) return;
  if (!guildSettings.isEnabled(message.guild.id)) return;
  const imageBytesList = await fetchImageBytes(message);
  if (!message.content.trim() && imageBytesList.length === 0) return;
  const result = await pipeline.scan(message.content, imageBytesList, ctx.cfg);
  if (!result.isScam) return;
  const action = await actions.takeAction(message, result, imageBytesList, ctx.cfg, ctx.client);
  logger.info(
    `Scam flagged user=${message.author.id} conf=${result.confidence.toFixed(2)} action=${action} signals=${result.reasons.length}`
  );
  logger.debug(`reasons=${JSON.stringify(result.reasons)}`);
}
module.exports = { onMessageCreate };
