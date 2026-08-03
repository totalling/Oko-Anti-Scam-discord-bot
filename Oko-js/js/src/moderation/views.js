'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const reviewStore = require('./reviewStore');
const style = require('./style');
const DETAILS_BUTTON_ID = 'scam_details';
const REVIEW_PUNISH_ID = 'scam_review_punish';
const REVIEW_RELEASE_ID = 'scam_review_release';
const STRONG_SIGNAL_PREFIXES = [
  'known scam domain',
  'impersonates watched name',
  'matches known scam image',
  '*win.',
];
function _isMod(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}
function _cleanReason(reason) {
  if (reason.startsWith('matches known scam image')) return 'known scam image match';
  const idx = reason.indexOf(': ');
  if (idx !== -1) {
    const label = reason.slice(0, idx);
    const value = reason.slice(idx + 2);
    if (label === 'known scam domain') return `known domain (${value})`;
    if (label === 'impersonates watched name') return `impersonates ${value}`;
    if (label.endsWith('scam-pattern domain')) return `suspicious domain (${value})`;
  }
  return reason;
}
function _summarizeReasons(reasons) {
  if (reasons.length === 0) return 'no specific signals recorded';
  const strong = reasons.filter((r) => STRONG_SIGNAL_PREFIXES.some((p) => r.startsWith(p)));
  const rest = reasons.filter((r) => !strong.includes(r));
  const ordered = [...strong, ...rest];
  const shown = ordered.slice(0, 3);
  const remaining = reasons.length - shown.length;
  let summary = shown.map(_cleanReason).join(', ');
  if (remaining > 0) summary += ` +${remaining} more`;
  return summary;
}
function scamLogComponents() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(DETAILS_BUTTON_ID)
      .setLabel('Details')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋')
  );
}
function reviewLogComponents() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(REVIEW_PUNISH_ID)
      .setLabel('Punish')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔨'),
    new ButtonBuilder()
      .setCustomId(REVIEW_RELEASE_ID)
      .setLabel('Release')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(DETAILS_BUTTON_ID)
      .setLabel('Details')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋')
  );
}
async function handleDetailsButton(interaction) {
  if (!_isMod(interaction)) {
    return interaction.reply(
      style.payload(style.commandReply(interaction, 'You need Manage Server permission to use this.', '🔒'), {
        ephemeral: true,
      })
    );
  }
  const review = reviewStore.getReview(interaction.message.id);
  if (!review) {
    return interaction.reply(
      style.payload(style.commandReply(interaction, 'No stored details for this entry.', '❌'), { ephemeral: true })
    );
  }
  const summary = _summarizeReasons(review.reasons);
  const message = review.content ? review.content.slice(0, 300) : '*(image only, no text)*';
  const description = `> **Signals:** ${summary}\n> **Message:** ${message}`.slice(0, 4000);
  return interaction.reply(style.payload(style.build(description), { ephemeral: true }));
}
module.exports = { DETAILS_BUTTON_ID, REVIEW_PUNISH_ID, REVIEW_RELEASE_ID, scamLogComponents, reviewLogComponents, handleDetailsButton };
