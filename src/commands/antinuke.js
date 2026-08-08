'use strict';
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} = require('discord.js');
const { EMOJI, ACCENT_COLOR } = require('../constants');
const guildSettings = require('../moderation/guildSettings');
const style = require('../moderation/style');
const { reply, replyNoGuild, hasAdministrator, replyNoPermission } = require('./helpers');
const PUNISHMENT_LABELS = { ban: 'Ban', kick: 'Kick', timeout: 'Timeout / Mute' };
const ENABLED_COLOR = 0x3ba55d;
const WATCHES_TEXT =
  'Channel deletes, role deletes/edits, bans, kicks, member role changes, webhook creates, bot adds, ' +
  'vanity URL changes, and mass pings (`@everyone`/`@here` or 5+ users mentioned in one message).';
function _text(content) {
  return new TextDisplayBuilder().setContent(content);
}
function _separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}
function _buildStatusContainer(guildId) {
  const enabled = guildSettings.getAntiNukeEnabled(guildId);
  const threshold = guildSettings.getAntiNukeThreshold(guildId);
  const windowSeconds = guildSettings.getAntiNukeWindowSeconds(guildId);
  const punishment = guildSettings.getAntiNukePunishment(guildId);
  const exemptUsers = guildSettings.getAntiNukeExemptUserIds(guildId);
  const exemptRoles = guildSettings.getAntiNukeExemptRoleIds(guildId);
  const container = new ContainerBuilder().setAccentColor(enabled ? ENABLED_COLOR : ACCENT_COLOR);
  container.addTextDisplayComponents(_text(`### 🛡️ Anti-nuke\n**Protection**\n${enabled ? '🟢 ON' : '⚪ OFF'}`));
  container.addSeparatorComponents(_separator());
  container.addTextDisplayComponents(
    _text(`**Trigger**\n${threshold}+ destructive actions within ${windowSeconds}s`),
    _text(`**Response**\nStrip roles, then **${PUNISHMENT_LABELS[punishment]}**`)
  );
  container.addSeparatorComponents(_separator());
  container.addTextDisplayComponents(
    _text(`**Exempt users**\n${exemptUsers.length > 0 ? exemptUsers.map((id) => `<@${id}>`).join(', ') : 'None'}`),
    _text(`**Exempt roles**\n${exemptRoles.length > 0 ? exemptRoles.map((id) => `<@&${id}>`).join(', ') : 'None'}`)
  );
  container.addSeparatorComponents(_separator());
  container.addTextDisplayComponents(_text(`**Coverage**\n${WATCHES_TEXT}`));
  container.addSeparatorComponents(_separator());
  container.addTextDisplayComponents(
    _text(
      '-# The server owner and Oko itself are always exempt.\n' +
        '-# Only the server owner can manage the exempt list, even other Administrators cannot.\n' +
        '-# Requires Oko to have the View Audit Log permission to see who performed each action.'
    )
  );
  return container;
}
const data = new SlashCommandBuilder()
  .setName('antinuke')
  .setDescription('Protect this server from a compromised or malicious admin/mod account')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('toggle')
      .setDescription('Enable or disable anti-nuke protection for this server')
      .addBooleanOption((opt) => opt.setName('enabled').setDescription('Turn anti-nuke on or off').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('threshold')
      .setDescription('Destructive actions within the time window needed to trigger a response (default 5)')
      .addIntegerOption((opt) =>
        opt.setName('value').setDescription('Number of actions, 2-20').setMinValue(2).setMaxValue(20).setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('window')
      .setDescription('Time window, in seconds, actions are counted within (default 10)')
      .addIntegerOption((opt) =>
        opt.setName('seconds').setDescription('Window length, 3-300 seconds').setMinValue(3).setMaxValue(300).setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('setpunishment')
      .setDescription('What happens to the account once anti-nuke triggers (roles are always stripped first)')
      .addStringOption((opt) =>
        opt
          .setName('punishment')
          .setDescription('Action to take once triggered')
          .setRequired(true)
          .addChoices(
            { name: 'Ban', value: 'ban' },
            { name: 'Kick', value: 'kick' },
            { name: 'Timeout / Mute', value: 'timeout' }
          )
      )
  )
  .addSubcommand((sub) => sub.setName('status').setDescription("Show this server's anti-nuke settings"))
  .addSubcommandGroup((group) =>
    group
      .setName('exempt')
      .setDescription('[Server owner only] Manage who is trusted and never triggers anti-nuke')
      .addSubcommand((sub) =>
        sub
          .setName('adduser')
          .setDescription('Exempt a user from anti-nuke')
          .addUserOption((opt) => opt.setName('user').setDescription('User to trust').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('removeuser')
          .setDescription('Remove a user from the anti-nuke exemption list')
          .addUserOption((opt) => opt.setName('user').setDescription('User to remove').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('addrole')
          .setDescription('Exempt everyone with a role from anti-nuke')
          .addRoleOption((opt) => opt.setName('role').setDescription('Role to trust').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('removerole')
          .setDescription('Remove a role from the anti-nuke exemption list')
          .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove').setRequired(true))
      )
  );
async function execute(interaction) {
  if (!interaction.guild) return replyNoGuild(interaction);
  if (!hasAdministrator(interaction)) return replyNoPermission(interaction);
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  if (group === 'exempt') {
    if (interaction.user.id !== interaction.guild.ownerId) {
      return reply(
        interaction,
        'Only the **server owner** can manage the anti-nuke exempt list. This is intentional: if an admin ' +
          "account gets compromised, it must not be able to exempt itself (or an accomplice) and disable its own defenses.",
        '🔒'
      );
    }
    switch (sub) {
      case 'adduser': {
        const user = interaction.options.getUser('user', true);
        const added = await guildSettings.addAntiNukeExemptUserId(guildId, user.id);
        return reply(
          interaction,
          added ? `${user} is now exempt from anti-nuke.` : `${user} is already exempt.`,
          added ? EMOJI.moderation : '⚠️'
        );
      }
      case 'removeuser': {
        const user = interaction.options.getUser('user', true);
        const removed = await guildSettings.removeAntiNukeExemptUserId(guildId, user.id);
        return reply(
          interaction,
          removed ? `${user} is no longer exempt from anti-nuke.` : `${user} wasn't exempt.`,
          removed ? EMOJI.refresh : '⚠️'
        );
      }
      case 'addrole': {
        const role = interaction.options.getRole('role', true);
        const added = await guildSettings.addAntiNukeExemptRoleId(guildId, role.id);
        return reply(
          interaction,
          added ? `Everyone with ${role} is now exempt from anti-nuke.` : `${role} is already exempt.`,
          added ? EMOJI.moderation : '⚠️'
        );
      }
      case 'removerole': {
        const role = interaction.options.getRole('role', true);
        const removed = await guildSettings.removeAntiNukeExemptRoleId(guildId, role.id);
        return reply(
          interaction,
          removed ? `${role} is no longer exempt from anti-nuke.` : `${role} wasn't exempt.`,
          removed ? EMOJI.refresh : '⚠️'
        );
      }
    }
    return;
  }
  switch (sub) {
    case 'toggle': {
      const enabled = interaction.options.getBoolean('enabled', true);
      await guildSettings.setAntiNukeEnabled(guildId, enabled);
      const container = _buildStatusContainer(guildId);
      container.addSeparatorComponents(_separator());
      container.addTextDisplayComponents(
        _text(`${EMOJI.moderation} Anti-nuke is now **${enabled ? 'enabled' : 'disabled'}**.`)
      );
      return interaction.reply(style.payload(container, { ephemeral: true }));
    }
    case 'threshold': {
      const value = interaction.options.getInteger('value', true);
      await guildSettings.setAntiNukeThreshold(guildId, value);
      return reply(
        interaction,
        `Anti-nuke now triggers after **${value}** destructive actions within the configured time window.`,
        EMOJI.moderation
      );
    }
    case 'window': {
      const seconds = interaction.options.getInteger('seconds', true);
      await guildSettings.setAntiNukeWindowSeconds(guildId, seconds);
      return reply(interaction, `Anti-nuke now counts destructive actions within a **${seconds}s** window.`, EMOJI.moderation);
    }
    case 'setpunishment': {
      const punishment = interaction.options.getString('punishment', true);
      await guildSettings.setAntiNukePunishment(guildId, punishment);
      return reply(
        interaction,
        `Anti-nuke punishment is now **${PUNISHMENT_LABELS[punishment]}** (roles are always stripped first, regardless).`,
        EMOJI.moderation
      );
    }
    case 'status': {
      return interaction.reply(style.payload(_buildStatusContainer(guildId), { ephemeral: true }));
    }
  }
}
module.exports = { data, execute };
