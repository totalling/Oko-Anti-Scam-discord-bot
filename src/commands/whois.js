'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, ActivityType, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { EMOJI } = require('../constants');
const { replyNoGuild } = require('./helpers');
const style = require('../moderation/style');
const MAX_MEMBER_FETCH = 1000;
const STATUS_LABELS = {
  online: `${EMOJI.statusOnline} Online`,
  idle: `${EMOJI.statusIdle} Idle`,
  dnd: `${EMOJI.statusDnd} Do Not Disturb`,
  offline: `${EMOJI.statusOffline} Offline`,
  streaming: `${EMOJI.statusStreaming} Streaming`,
};
const ACTIVITY_TYPE_LABELS = {
  [ActivityType.Playing]: '**Playing**',
  [ActivityType.Streaming]: '**Streaming**',
  [ActivityType.Listening]: '**Listening to**',
  [ActivityType.Watching]: '**Watching**',
  [ActivityType.Competing]: '**Competing in**',
};
const NOTABLE_PERMISSIONS = [
  [PermissionFlagsBits.Administrator, 'Administrator'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.ModerateMembers, 'Timeout Members'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
  [PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'],
  [PermissionFlagsBits.ManageGuildExpressions, 'Manage Expressions'],
  [PermissionFlagsBits.ManageEvents, 'Manage Events'],
  [PermissionFlagsBits.ManageThreads, 'Manage Threads'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone'],
];
const data = new SlashCommandBuilder()
  .setName('whois')
  .setDescription('Show detailed information about a user')
  .addUserOption((opt) => opt.setName('user').setDescription('User to look up (defaults to you)'));
function _formatDate(ms) {
  const sec = Math.floor(ms / 1000);
  return `<t:${sec}:D> (<t:${sec}:R>)`;
}
function _formatEmoji(emoji) {
  if (!emoji) return '';
  if (emoji.id) return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  return emoji.name ?? '';
}
function _formatActivity(activity) {
  if (activity.type === ActivityType.Custom) {
    const text = [_formatEmoji(activity.emoji), activity.state].filter(Boolean).join(' ');
    return text || null;
  }
  const label = ACTIVITY_TYPE_LABELS[activity.type] ?? '**Playing**';
  const details = [activity.details, activity.state].filter(Boolean).join(' · ');
  return `${label} **${activity.name}**${details ? ` (${details})` : ''}`;
}
async function _resolveJoinPosition(guild, member) {
  const total = guild.memberCount;
  if (total > MAX_MEMBER_FETCH) return null;
  let members = guild.members.cache;
  if (members.size < total) {
    members = await guild.members.fetch().catch(() => members);
  }
  if (members.size < total * 0.95) return null;
  const sorted = [...members.values()].sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0));
  const index = sorted.findIndex((m) => m.id === member.id);
  return index === -1 ? null : { position: index + 1, total: sorted.length };
}
async function execute(interaction) {
  if (!interaction.guild) return replyNoGuild(interaction);
  await interaction.deferReply();
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const user = await interaction.client.users.fetch(targetUser.id, { force: true }).catch(() => targetUser);
  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  const lines = [];
  lines.push(`### ${EMOJI.preview} Whois: ${user.tag}`);
  lines.push(`> **User:** ${user} \`${user.id}\`${user.bot ? ' · **Bot**' : ''}`);
  if (member) {
    const presence = member.presence;
    const activities = presence?.activities ?? [];
    const isStreaming = activities.some((a) => a.type === ActivityType.Streaming);
    const statusKey = isStreaming ? 'streaming' : presence?.status;
    const status = STATUS_LABELS[statusKey] ?? STATUS_LABELS.offline;
    lines.push(`> **Status:** ${status}`);
    const activityLines = activities.map(_formatActivity).filter(Boolean);
    if (activityLines.length > 0) {
      lines.push(`> **Activity:** ${activityLines.join('\n> ')}`);
    }
    if (member.voice?.channel) {
      const others = Math.max(member.voice.channel.members.size - 1, 0);
      lines.push(
        `> 🔊 **In voice:** ${member.voice.channel}${others > 0 ? ` with ${others} other${others === 1 ? '' : 's'}` : ''}`
      );
    }
  }
  lines.push('');
  lines.push('**Dates**');
  lines.push(`> **Created:** ${_formatDate(user.createdTimestamp)}`);
  if (member?.joinedTimestamp) {
    lines.push(`> **Joined:** ${_formatDate(member.joinedTimestamp)}`);
    const joinInfo = await _resolveJoinPosition(interaction.guild, member);
    if (joinInfo) {
      lines.push(`> **Join position:** #${joinInfo.position} of ${joinInfo.total}`);
    }
  }
  const mutualGuilds = interaction.client.guilds.cache.filter((g) => g.members.cache.has(user.id)).size;
  if (mutualGuilds > 0) {
    lines.push(`> **Mutual servers:** ${mutualGuilds}`);
  }
  if (member) {
    const roles = member.roles.cache.filter((r) => r.id !== interaction.guild.id).sort((a, b) => b.position - a.position);
    if (roles.size > 0) {
      const shown = [...roles.values()].slice(0, 15).map((r) => `${r}`);
      const extra = roles.size - shown.length;
      lines.push('');
      lines.push(`**Roles (${roles.size})**`);
      lines.push(shown.join(', ') + (extra > 0 ? `, +${extra} more` : ''));
    }
    const permLabels = NOTABLE_PERMISSIONS.filter(([bit]) => member.permissions.has(bit)).map(([, label]) => label);
    if (permLabels.length > 0) {
      lines.push('');
      lines.push('**Key Permissions**');
      lines.push(
        permLabels.includes('Administrator') ? 'Administrator (all permissions)' : permLabels.join(', ')
      );
    }
  }
  const description = lines.join('\n');
  const container = style.build(description, {
    timestamp: true,
    thumbnailUrl: member ? member.displayAvatarURL({ size: 512 }) : user.displayAvatarURL({ size: 512 }),
  });
  const bannerUrl = user.bannerURL({ size: 512 });
  if (bannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl))
    );
  }
  return interaction.editReply(style.payload(container));
}
module.exports = { data, execute };
