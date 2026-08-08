'use strict';
const { AuditLogEvent } = require('discord.js');
const guildSettings = require('./guildSettings');
const historyStore = require('./historyStore');
const actions = require('./actions');
const style = require('./style');
const DESTRUCTIVE_ACTIONS = new Set([
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.RoleUpdate,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.BotAdd,
]);
const ACTION_LABELS = {
  [AuditLogEvent.ChannelDelete]: 'deleted a channel',
  [AuditLogEvent.RoleDelete]: 'deleted a role',
  [AuditLogEvent.RoleUpdate]: "edited a role's permissions",
  [AuditLogEvent.MemberBanAdd]: 'banned a member',
  [AuditLogEvent.MemberKick]: 'kicked a member',
  [AuditLogEvent.MemberRoleUpdate]: "changed a member's roles",
  [AuditLogEvent.WebhookCreate]: 'created a webhook',
  [AuditLogEvent.BotAdd]: 'added a bot',
};
const MASS_MENTION_THRESHOLD = 5;
const PUNISHMENT_VERBS = { ban: 'banned', kick: 'kicked', timeout: 'timed out' };
const _windows = new Map();
function _trim(list, cutoff) {
  while (list.length > 0 && list[0].at < cutoff) list.shift();
}
function _isVanityChange(entry) {
  return entry.action === AuditLogEvent.GuildUpdate && Boolean(entry.changes?.some((c) => c.key === 'vanity_url_code'));
}
function _auditLabel(entry) {
  if (_isVanityChange(entry)) return 'changed the server vanity invite';
  return ACTION_LABELS[entry.action] ?? 'performed a destructive action';
}
async function handleAuditLogEntry(entry, guild, client) {
  if (!DESTRUCTIVE_ACTIONS.has(entry.action) && !_isVanityChange(entry)) return;
  await _track(guild, client, entry.executorId, _auditLabel(entry));
}
async function handleMessage(message, client) {
  if (message.author.bot || !message.guild) return;
  if (!guildSettings.getAntiNukeEnabled(message.guild.id)) return;
  const mentionsEveryone = message.mentions.everyone;
  const mentionCount = message.mentions.users.size;
  if (!mentionsEveryone && mentionCount < MASS_MENTION_THRESHOLD) return;
  const label = mentionsEveryone ? 'pinged @everyone/@here' : `mass-pinged ${mentionCount} members in one message`;
  await _track(message.guild, client, message.author.id, label);
}
async function _track(guild, client, executorId, label) {
  if (!executorId) return;
  if (executorId === client.user.id) return;
  if (executorId === guild.ownerId) return;
  if (!guildSettings.getAntiNukeEnabled(guild.id)) return;
  if (guildSettings.getAntiNukeExemptUserIds(guild.id).includes(executorId)) return;
  const member = await guild.members.fetch(executorId).catch(() => null);
  if (member) {
    const exemptRoleIds = guildSettings.getAntiNukeExemptRoleIds(guild.id);
    if (exemptRoleIds.length > 0 && member.roles.cache.some((r) => exemptRoleIds.includes(r.id))) return;
  }
  const windowMs = guildSettings.getAntiNukeWindowSeconds(guild.id) * 1000;
  const threshold = guildSettings.getAntiNukeThreshold(guild.id);
  const key = `${guild.id}:${executorId}`;
  const now = Date.now();
  const list = _windows.get(key) ?? [];
  list.push({ label, at: now });
  _trim(list, now - windowMs);
  _windows.set(key, list);
  if (list.length < threshold) return;
  _windows.set(key, []);
  await _respond(guild, executorId, member, list);
}
async function _respond(guild, executorId, member, triggerList) {
  let rolesStripped = false;
  if (member) {
    try {
      await member.roles.set([], 'Anti-nuke: destructive action burst detected');
      rolesStripped = true;
    } catch {
    }
  }
  const punishment = guildSettings.getAntiNukePunishment(guild.id);
  let punished = false;
  if (member) {
    punished = await actions.applyPunishment(
      member,
      punishment,
      `Anti-nuke triggered: ${triggerList.length} destructive actions in a short window`
    );
  }
  const verb = PUNISHMENT_VERBS[punishment] ?? punishment;
  await historyStore.record(executorId, {
    guildId: guild.id,
    type: 'antinuke',
    detail: `${triggerList.length} destructive actions${rolesStripped ? ', roles stripped' : ''}${punished ? `, ${verb}` : ''}`,
  });
  const logChannelId = guildSettings.getLogChannelId(guild.id);
  const channel = logChannelId ? guild.channels.cache.get(String(logChannelId)) : null;
  if (!channel) return;
  const actionSummary = triggerList.map((a) => a.label).join(', ');
  const response = !member
    ? 'user left before a response could be applied'
    : `roles ${rolesStripped ? 'stripped' : "couldn't be stripped (missing permissions)"}, ${punished ? verb : 'punishment failed (missing permissions)'}`;
  const description =
    `🛡️ **Anti-nuke triggered**\n` +
    `> **User:** <@${executorId}> \`${executorId}\`\n` +
    `> **Actions:** ${triggerList.length} in the configured window: ${actionSummary}\n` +
    `> **Response:** ${response}`;
  await channel.send(style.payload(style.build(description, { timestamp: true })));
}
module.exports = { handleAuditLogEntry, handleMessage };
