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
const activityStore = require('../moderation/activityStore');
const pulseImage = require('../moderation/pulseImage');
const REFRESH_ID = 'pulse_server_refresh';
const data = new SlashCommandBuilder()
  .setName('serverpulse')
  .setDescription("Show a live snapshot of this server's activity");
async function _buildPayload(guild) {
  const memberCount = guild.memberCount;
  const onlineCount = guild.presences.cache.filter((p) => p.status !== 'offline').size;
  const hourlyBuckets = activityStore.getHourlyBuckets(guild.id, 24);
  const messages24h = hourlyBuckets.reduce((sum, b) => sum + b.count, 0);
  const messagesTotal = activityStore.getTotal(guild.id);
  const topUserEntries = activityStore.getTopUsers(guild.id, 3);
  const topUsers = await Promise.all(
    topUserEntries.map(async (u) => {
      const member = await guild.members.fetch(u.userId).catch(() => null);
      return { name: member ? member.displayName : `User ${u.userId}`, count: u.count };
    })
  );
  const buffer = await pulseImage.renderServerPulse({
    guildName: guild.name,
    iconUrl: guild.iconURL({ size: 128, extension: 'png' }),
    memberCount,
    onlineCount,
    messages24h,
    messagesTotal,
    hourlyBuckets,
    topUsers,
  });
  const filename = 'serverpulse.png';
  const container = style.build('📈 Server Pulse', { timestamp: true });
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
