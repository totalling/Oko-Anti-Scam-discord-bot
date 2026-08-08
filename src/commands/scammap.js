'use strict';
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { replyNoGuild } = require('./helpers');
const style = require('../moderation/style');
const scamMapStore = require('../moderation/scamMapStore');
const pulseImage = require('../moderation/pulseImage');
const REFRESH_ID = 'pulse_scammap_refresh';
const data = new SlashCommandBuilder()
  .setName('scammap')
  .setDescription("Show this server's scam-catch history as a contribution-style calendar");
async function _buildPayload(guild) {
  const days = scamMapStore.getCounts(guild.id);
  const totalCatches = scamMapStore.getTotal(guild.id);
  const buffer = await pulseImage.renderScamMap({
    guildName: guild.name,
    iconUrl: guild.iconURL({ size: 128, extension: 'png' }),
    days,
    totalCatches,
  });
  const filename = 'scammap.png';
  const container = style.build('🗺️ Scam Map', { timestamp: true });
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${filename}`))
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(REFRESH_ID).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    )
  );
  return style.payload(container, { files: [new AttachmentBuilder(buffer, { name: filename })] });
}
async function execute(interaction) {
  if (!interaction.guild) return replyNoGuild(interaction);
  await interaction.deferReply();
  await interaction.editReply(await _buildPayload(interaction.guild));
}
async function handleRefreshButton(interaction) {
  if (!interaction.guild) return;
  await interaction.deferUpdate();
  await interaction.editReply(await _buildPayload(interaction.guild));
}
module.exports = { data, execute, REFRESH_ID, handleRefreshButton };
