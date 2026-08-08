'use strict';
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
  ChannelType,
} = require('discord.js');
const { replyNoGuild } = require('./helpers');
const style = require('../moderation/style');
const pulseImage = require('../moderation/pulseImage');
const REFRESH_ID = 'pulse_voice_refresh';
const data = new SlashCommandBuilder()
  .setName('voicepulse')
  .setDescription('Show who is in voice right now');
function _collectChannels(guild) {
  const channels = guild.channels.cache.filter(
    (c) => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.members.size > 0
  );
  return [...channels.values()]
    .map((c) => ({ name: c.name, members: [...c.members.values()].map((m) => m.displayName) }))
    .sort((a, b) => b.members.length - a.members.length);
}
async function _buildPayload(guild) {
  const channels = _collectChannels(guild);
  const totalInVoice = channels.reduce((sum, c) => sum + c.members.length, 0);
  const buffer = await pulseImage.renderVoicePulse({
    guildName: guild.name,
    iconUrl: guild.iconURL({ size: 128, extension: 'png' }),
    totalInVoice,
    channels,
  });
  const filename = 'voicepulse.png';
  const container = style.build('🔊 Voice Pulse', { timestamp: true });
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
