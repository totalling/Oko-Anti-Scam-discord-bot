'use strict';
const { PermissionFlagsBits } = require('discord.js');
const style = require('../moderation/style');
async function isBotOwner(client, userId) {
  const app = await client.application.fetch();
  const owner = app.owner;
  if (!owner) return false;
  if (owner.members) return owner.members.has(userId); 
  return owner.id === userId;
}
function reply(interaction, message, emoji = '✅') {
  return interaction.reply(style.payload(style.commandReply(interaction, message, emoji), { ephemeral: true }));
}
function replyNoGuild(interaction) {
  return reply(interaction, 'This only works in a server.', '❌');
}
function hasManageGuild(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}
function replyNoPermission(interaction) {
  return reply(interaction, "You don't have permission to use this command.", '🔒');
}
module.exports = { isBotOwner, reply, replyNoGuild, hasManageGuild, replyNoPermission };
