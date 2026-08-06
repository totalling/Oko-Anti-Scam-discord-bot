'use strict';
const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
} = require('discord.js');
const phashStore = require('../detection/phash');
const actions = require('../moderation/actions');
const blacklist = require('../moderation/blacklist');
const style = require('../moderation/style');
const { EMOJI } = require('../constants');
const { fetchImageBytes } = require('../attachments');
const data = new ContextMenuCommandBuilder()
  .setName('Mark as Known Scam')
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
async function execute(interaction, ctx) {
  await interaction.deferReply({ ephemeral: true });
  const message = interaction.targetMessage;
  const imageBytesList = await fetchImageBytes(message);
  for (const data of imageBytesList) {
    const phashHex = await phashStore.computePhash(data);
    if (phashHex) {
      await phashStore.addHash(phashHex, 'manual', String(interaction.user.id));
    }
  }
  const result = {
    isScam: true,
    confidence: 1.0,
    reasons: [`manually marked as scam by ${interaction.user.tag}`],
    hashMatched: false,
    imageHashes: [],
  };
  const action = await actions.takeAction(message, result, imageBytesList, ctx.cfg, interaction.client);
  const blacklisted = Boolean(blacklist.getEntry(message.author.id));
  const msg =
    `${message.author} (\`${message.author.id}\`): ${action}` +
    `${blacklisted ? ', added to the global blacklist' : ''}. ` +
    `${imageBytesList.length} image hash(es) learned.`;
  return interaction.editReply(style.payload(style.commandReply(interaction, msg, EMOJI.moderation)));
}
module.exports = { data, execute };
