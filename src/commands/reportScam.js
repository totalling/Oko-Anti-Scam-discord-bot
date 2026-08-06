'use strict';
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { EMOJI } = require('../constants');
const guildSettings = require('../moderation/guildSettings');
const reportStore = require('../moderation/reportStore');
const reviewStore = require('../moderation/reviewStore');
const style = require('../moderation/style');
const { scamLogComponents } = require('../moderation/views');
const data = new ContextMenuCommandBuilder()
  .setName('Report Scam')
  .setType(ApplicationCommandType.Message);
async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const editReply = (message, emoji = '✅') =>
    interaction.editReply(style.payload(style.commandReply(interaction, message, emoji)));
  if (!interaction.guild) {
    return editReply('This only works in a server.', '❌');
  }
  const message = interaction.targetMessage;
  if (message.author.id === interaction.user.id) {
    return editReply("You can't report your own message.", '❌');
  }
  if (message.author.bot) {
    return editReply(
      'That message was posted by a bot or webhook. Ask a moderator to handle it with **Mark as Known Scam** instead.',
      '⚠️'
    );
  }
  if (!message.content && message.attachments.size === 0) {
    return editReply("That message has no text or attachments, so there's nothing to report.", '⚠️');
  }
  const logChannelId = guildSettings.getLogChannelId(interaction.guild.id);
  const logChannel = logChannelId ? interaction.guild.channels.cache.get(String(logChannelId)) : null;
  if (!logChannel) {
    return editReply(
      "This server hasn't set up a scam log channel yet, so there's nowhere to send the report. Ask a moderator to run `/scam setlogchannel`.",
      '❌'
    );
  }
  if (reportStore.isReported(message.id)) {
    return editReply('This message has already been reported. Moderators can see it in the log channel.', '⚠️');
  }
  const content = message.content ? message.content.slice(0, 300) : '*(image only, no text)*';
  const description =
    `> ${EMOJI.report} **Scam reported** in ${message.channel}\n` +
    `> **Author:** ${message.author} \`${message.author.id}\`\n` +
    `> **Reported by:** ${interaction.user}\n` +
    `> **Message:** ${message.url}\n` +
    `> **Content:** ${content}`;
  const container = style.build(description, { timestamp: true });
  container.addActionRowComponents(scamLogComponents());
  const logMessage = await logChannel.send(style.payload(container));
  await reviewStore.saveReview(logMessage.id, {
    guildId: interaction.guild.id,
    authorId: message.author.id,
    confidence: 0,
    reasons: [`reported by ${interaction.user.tag}`],
    content: message.content,
  });
  await reportStore.markReported(message.id, {
    reporterId: interaction.user.id,
    guildId: interaction.guild.id,
  });
  return editReply('Thanks, your report has been sent to the moderators.', EMOJI.report);
}
module.exports = { data, execute };
