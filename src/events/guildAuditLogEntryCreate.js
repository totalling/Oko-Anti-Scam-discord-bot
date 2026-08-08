'use strict';
const antiNuke = require('../moderation/antiNuke');
async function onGuildAuditLogEntryCreate(entry, guild, ctx) {
  await antiNuke.handleAuditLogEntry(entry, guild, ctx.client);
}
module.exports = { onGuildAuditLogEntryCreate };
