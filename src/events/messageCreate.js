'use strict';
const { PermissionFlagsBits } = require('discord.js');
const pipeline = require('../detection/pipeline');
const heuristics = require('../detection/heuristics');
const actions = require('../moderation/actions');
const guildSettings = require('../moderation/guildSettings');
const historyStore = require('../moderation/historyStore');
const activityStore = require('../moderation/activityStore');
const antiNuke = require('../moderation/antiNuke');
const { fetchImageBytes } = require('../attachments');
const INVITE_PATTERN = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
function _honeypotTrigger(message) {
  if (INVITE_PATTERN.test(message.content)) return 'posted a Discord invite link';
  if (message.attachments.size > 0) return 'posted an image/attachment';
  const { reasons } = heuristics.scoreText(message.content);
  if (reasons.length > 0) return `sent a scam-pattern message (${reasons[0]})`;
  return null;
}
async function _handleHoneypot(message) {
  try {
    await message.delete();
  } catch {
  }
  const member = message.member;
  if (!member) return;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
  const trigger = _honeypotTrigger(message);
  if (!trigger) return;
  const punishment = guildSettings.getHoneypotPunishment(message.guild.id);
  const punished = await actions.applyPunishment(member, punishment, `Triggered honeypot trap channel (${trigger})`);
  await historyStore.record(member.id, {
    guildId: message.guild.id,
    type: 'honeypot',
    detail: punished
      ? `${trigger} in honeypot channel: ${punishment}`
      : `${trigger} in honeypot channel, punishment failed (missing permissions)`,
  });
}
async function onMessageCreate(message, ctx) {
  if (message.author.bot || !message.guild) return;
  activityStore.recordMessage(message.guild.id, message.author.id, message.channel.id);
  await antiNuke.handleMessage(message, ctx.client);
  const honeypotChannelId = guildSettings.getHoneypotChannelId(message.guild.id);
  if (honeypotChannelId && message.channel.id === String(honeypotChannelId)) {
    await _handleHoneypot(message);
    return;
  }
  if (!message.content && message.attachments.size === 0) return;
  if (!guildSettings.isEnabled(message.guild.id)) return;
  if (guildSettings.getIgnoredChannelIds(message.guild.id).includes(message.channel.id)) return;
  if (guildSettings.getExemptUserIds(message.guild.id).includes(message.author.id)) return;
  const exemptRoleIds = guildSettings.getExemptRoleIds(message.guild.id);
  if (exemptRoleIds.length > 0 && message.member?.roles.cache.some((r) => exemptRoleIds.includes(r.id))) return;
  const imageBytesList = await fetchImageBytes(message);
  if (!message.content.trim() && imageBytesList.length === 0) return;
  const result = await pipeline.scan(message.content, imageBytesList, ctx.cfg);
  if (!result.isScam) return;
  await actions.takeAction(message, result, imageBytesList, ctx.cfg, ctx.client);
}
module.exports = { onMessageCreate };
