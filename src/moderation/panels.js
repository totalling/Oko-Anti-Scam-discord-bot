'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const blacklist = require('./blacklist');
const guildSettings = require('./guildSettings');
const lists = require('./lists');
const style = require('./style');
const DASHBOARD_PREFIX = 'scam_dash:';
const SIM_ADD_PREFIX = 'scam_sim_add:';
const BL_REMOVE_PREFIX = 'scam_bl_remove:';
const APPEAL_APPROVE_PREFIX = 'scam_appeal_approve:';
const APPEAL_DENY_PREFIX = 'scam_appeal_deny:';
const LIST_PAGE_PREFIX = 'scam_list:';
const LIST_PAGE_SIZE = 25;
const PUNISHMENT_LABELS = { ban: 'Ban', kick: 'Kick', timeout: 'Timeout / Mute' };
const PUNISHMENT_ORDER = ['ban', 'kick', 'timeout'];
async function _isBotOwner(client, userId) {
  const app = await client.application.fetch();
  const owner = app.owner;
  if (!owner) return false;
  if (owner.members) return owner.members.has(userId);
  return owner.id === userId;
}
function _noPermission(interaction) {
  return interaction.reply(
    style.payload(style.commandReply(interaction, 'You need Manage Server permission to use this.', '🔒'), {
      ephemeral: true,
    })
  );
}
function _noOwnerPermission(interaction) {
  return interaction.reply(
    style.payload(style.commandReply(interaction, "You don't have permission to use this.", '🔒'), {
      ephemeral: true,
    })
  );
}
function buildDashboard(guildId, cfg) {
  const enabled = guildSettings.isEnabled(guildId);
  const reviewMode = guildSettings.getReviewMode(guildId);
  const punishment = guildSettings.getPunishment(guildId);
  const globalBl = guildSettings.getGlobalBlacklistEnabled(guildId);
  const threshold = guildSettings.getThreshold(guildId);
  const logChannelId = guildSettings.getLogChannelId(guildId);
  const description =
    '### Scam-moderation dashboard\n' +
    `> **Auto-moderation:** ${enabled ? 'ON' : 'OFF'}\n` +
    `> **Review mode:** ${reviewMode ? 'ON' : 'OFF'}\n` +
    `> **Punishment:** ${PUNISHMENT_LABELS[punishment]}\n` +
    `> **Global blacklist:** ${globalBl ? 'ON' : 'OFF'}\n` +
    `> **Threshold:** ${threshold !== null ? `${threshold} (override)` : `${cfg.confidenceBanThreshold} (bot default)`}\n` +
    `> **Log channel:** ${logChannelId ? `<#${logChannelId}>` : 'not set'}`;
  const container = style.build(description, { timestamp: true });
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${DASHBOARD_PREFIX}toggle_enabled`)
        .setLabel(enabled ? 'Disable auto-mod' : 'Enable auto-mod')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${DASHBOARD_PREFIX}toggle_review`)
        .setLabel(reviewMode ? 'Disable review mode' : 'Enable review mode')
        .setStyle(reviewMode ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${DASHBOARD_PREFIX}cycle_punishment`)
        .setLabel(`Punishment: ${PUNISHMENT_LABELS[punishment]} (cycle)`)
        .setStyle(ButtonStyle.Secondary)
    )
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${DASHBOARD_PREFIX}toggle_globalbl`)
        .setLabel(globalBl ? 'Disable global blacklist' : 'Enable global blacklist')
        .setStyle(globalBl ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${DASHBOARD_PREFIX}refresh`).setLabel('Refresh').setStyle(ButtonStyle.Secondary)
    )
  );
  return container;
}
async function handleDashboardButton(interaction, ctx) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return _noPermission(interaction);
  const guildId = interaction.guildId;
  const action = interaction.customId.slice(DASHBOARD_PREFIX.length);
  if (action === 'toggle_enabled') {
    await guildSettings.setEnabled(guildId, !guildSettings.isEnabled(guildId));
  } else if (action === 'toggle_review') {
    await guildSettings.setReviewMode(guildId, !guildSettings.getReviewMode(guildId));
  } else if (action === 'cycle_punishment') {
    const next = PUNISHMENT_ORDER[(PUNISHMENT_ORDER.indexOf(guildSettings.getPunishment(guildId)) + 1) % PUNISHMENT_ORDER.length];
    await guildSettings.setPunishment(guildId, next);
  } else if (action === 'toggle_globalbl') {
    await guildSettings.setGlobalBlacklistEnabled(guildId, !guildSettings.getGlobalBlacklistEnabled(guildId));
  }
  await interaction.update(style.payload(buildDashboard(guildId, ctx.cfg)));
}
function simulateAddButtonRow(domain) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SIM_ADD_PREFIX}${domain}`)
      .setLabel(`Add ${domain} to blocklist`)
      .setStyle(ButtonStyle.Danger)
  );
}
async function handleSimulateAddButton(interaction) {
  if (!(await _isBotOwner(interaction.client, interaction.user.id))) return _noOwnerPermission(interaction);
  const domain = interaction.customId.slice(SIM_ADD_PREFIX.length);
  const added = lists.add('domain', domain);
  await interaction.update(
    style.payload(
      style.build(added ? `\`${domain}\` added to the scam-domain blocklist.` : `\`${domain}\` is already blocklisted.`)
    )
  );
}
function blacklistLookupRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BL_REMOVE_PREFIX}${userId}`)
      .setLabel('Remove from blacklist')
      .setStyle(ButtonStyle.Danger)
  );
}
async function handleBlacklistRemoveButton(interaction) {
  if (!(await _isBotOwner(interaction.client, interaction.user.id))) return _noOwnerPermission(interaction);
  const userId = interaction.customId.slice(BL_REMOVE_PREFIX.length);
  const entry = blacklist.getEntry(userId);
  if (!entry) {
    return interaction.update(style.payload(style.build(`\`${userId}\` is no longer on the global blacklist.`)));
  }
  await blacklist.remove(userId);
  return interaction.update(
    style.payload(style.build(`\`${userId}\` removed from the global blacklist (was: ${entry.reason}).`))
  );
}
function appealRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPEAL_APPROVE_PREFIX}${userId}`)
      .setLabel('Approve & unblacklist')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${APPEAL_DENY_PREFIX}${userId}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
  );
}
async function handleAppealButton(interaction, approve) {
  if (!(await _isBotOwner(interaction.client, interaction.user.id))) return _noOwnerPermission(interaction);
  const prefix = approve ? APPEAL_APPROVE_PREFIX : APPEAL_DENY_PREFIX;
  const userId = interaction.customId.slice(prefix.length);
  if (!approve) {
    return interaction.update(style.payload(style.build(`Appeal denied for \`${userId}\`. They remain on the global blacklist.`)));
  }
  const entry = blacklist.getEntry(userId);
  if (entry) await blacklist.remove(userId);
  return interaction.update(
    style.payload(
      style.build(
        `Appeal approved. \`${userId}\` removed from the global blacklist. ` +
          'Servers that already punished them will NOT undo it automatically.'
      )
    )
  );
}
function buildListPage(kind, page) {
  const entries = lists.list(kind);
  const totalPages = Math.max(1, Math.ceil(entries.length / LIST_PAGE_SIZE));
  page = Math.min(Math.max(page, 0), totalPages - 1);
  const pageEntries = entries.slice(page * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE + LIST_PAGE_SIZE);
  const title = kind === 'domain' ? 'Scam domains' : 'Watched names';
  const body = pageEntries.length > 0 ? pageEntries.map((e) => `> \`${e}\``).join('\n') : '> *(empty)*';
  const description = `### ${title} (${entries.length} total, page ${page + 1}/${totalPages})\n${body}`;
  const container = style.build(description);
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LIST_PAGE_PREFIX}${kind}:${page - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`${LIST_PAGE_PREFIX}${kind}:${page + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )
  );
  return container;
}
async function handleListPageButton(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return _noPermission(interaction);
  const rest = interaction.customId.slice(LIST_PAGE_PREFIX.length);
  const [kind, pageStr] = rest.split(':');
  await interaction.update(style.payload(buildListPage(kind, parseInt(pageStr, 10) || 0)));
}
module.exports = {
  DASHBOARD_PREFIX,
  SIM_ADD_PREFIX,
  BL_REMOVE_PREFIX,
  APPEAL_APPROVE_PREFIX,
  APPEAL_DENY_PREFIX,
  LIST_PAGE_PREFIX,
  buildDashboard,
  handleDashboardButton,
  simulateAddButtonRow,
  handleSimulateAddButton,
  blacklistLookupRow,
  handleBlacklistRemoveButton,
  appealRow,
  handleAppealButton,
  buildListPage,
  handleListPageButton,
};
