'use strict';
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { EMOJI } = require('../constants');
const phashStore = require('../detection/phash');
const guildSettings = require('../moderation/guildSettings');
const lists = require('../moderation/lists');
const panels = require('../moderation/panels');
const style = require('../moderation/style');
const { isBotOwner, reply, replyNoGuild, hasManageGuild, replyNoPermission } = require('./helpers');
const OWNER_ONLY_SUBCOMMANDS = ['import', 'removehash'];
const data = new SlashCommandBuilder()
  .setName('scamlists')
  .setDescription('Manage scam blocklists, exemptions, and ignored channels')
  .addSubcommandGroup((group) =>
    group
      .setName('exempt')
      .setDescription('Exempt users or roles from scam auto-moderation in this server')
      .addSubcommand((sub) =>
        sub
          .setName('adduser')
          .setDescription('Exempt a user from scam auto-moderation')
          .addUserOption((opt) => opt.setName('user').setDescription('User to exempt').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('removeuser')
          .setDescription('Remove a user from the exemption list')
          .addUserOption((opt) => opt.setName('user').setDescription('User to remove').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('addrole')
          .setDescription('Exempt everyone with a role from scam auto-moderation')
          .addRoleOption((opt) => opt.setName('role').setDescription('Role to exempt').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('removerole')
          .setDescription('Remove a role from the exemption list')
          .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove').setRequired(true))
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName('ignorechannel')
      .setDescription('Exclude a channel from scam scanning entirely')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Stop scanning messages in a channel')
          .addChannelOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Channel to ignore')
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Resume scanning messages in a channel')
          .addChannelOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Channel to resume scanning')
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName('list')
      .setDescription('Browse the global scam blocklists')
      .addSubcommand((sub) =>
        sub
          .setName('domains')
          .setDescription('Browse known scam domains')
          .addIntegerOption((opt) => opt.setName('page').setDescription('Page number').setMinValue(1))
      )
      .addSubcommand((sub) =>
        sub
          .setName('names')
          .setDescription('Browse the impersonation watchlist')
          .addIntegerOption((opt) => opt.setName('page').setDescription('Page number').setMinValue(1))
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('import')
      .setDescription('[Bot owner only] Bulk-add domains or names from an uploaded text file (one per line)')
      .addAttachmentOption((opt) => opt.setName('file').setDescription('.txt file, one entry per line').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('kind')
          .setDescription('What kind of list to add to')
          .setRequired(true)
          .addChoices({ name: 'Scam domains', value: 'domain' }, { name: 'Watched names', value: 'name' })
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('removehash')
      .setDescription('[Bot owner only] Remove a perceptual image hash from the scam-image blocklist')
      .addStringOption((opt) => opt.setName('hash').setDescription('The hex hash to remove').setRequired(true))
  );
async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (OWNER_ONLY_SUBCOMMANDS.includes(sub)) {
    if (!(await isBotOwner(interaction.client, interaction.user.id))) return replyNoPermission(interaction);
  } else {
    if (!interaction.guild) return replyNoGuild(interaction);
    if (!hasManageGuild(interaction)) return replyNoPermission(interaction);
  }
  switch (sub) {
    case 'adduser': {
      const user = interaction.options.getUser('user', true);
      const added = await guildSettings.addExemptUserId(interaction.guild.id, user.id);
      return reply(
        interaction,
        added ? `${user} is now exempt from scam auto-moderation.` : `${user} is already exempt.`,
        added ? EMOJI.moderation : '⚠️'
      );
    }
    case 'removeuser': {
      const user = interaction.options.getUser('user', true);
      const removed = await guildSettings.removeExemptUserId(interaction.guild.id, user.id);
      return reply(
        interaction,
        removed ? `${user} is no longer exempt.` : `${user} wasn't on the exemption list.`,
        removed ? EMOJI.refresh : '⚠️'
      );
    }
    case 'addrole': {
      const role = interaction.options.getRole('role', true);
      const added = await guildSettings.addExemptRoleId(interaction.guild.id, role.id);
      return reply(
        interaction,
        added ? `Members with ${role} are now exempt from scam auto-moderation.` : `${role} is already exempt.`,
        added ? EMOJI.moderation : '⚠️'
      );
    }
    case 'removerole': {
      const role = interaction.options.getRole('role', true);
      const removed = await guildSettings.removeExemptRoleId(interaction.guild.id, role.id);
      return reply(
        interaction,
        removed ? `${role} is no longer exempt.` : `${role} wasn't on the exemption list.`,
        removed ? EMOJI.refresh : '⚠️'
      );
    }
    case 'add': {
      const channel = interaction.options.getChannel('channel', true);
      const added = await guildSettings.addIgnoredChannelId(interaction.guild.id, channel.id);
      return reply(
        interaction,
        added ? `${channel} will no longer be scanned for scams.` : `${channel} is already ignored.`,
        added ? EMOJI.moderation : '⚠️'
      );
    }
    case 'remove': {
      const channel = interaction.options.getChannel('channel', true);
      const removed = await guildSettings.removeIgnoredChannelId(interaction.guild.id, channel.id);
      return reply(
        interaction,
        removed ? `${channel} will be scanned again.` : `${channel} wasn't being ignored.`,
        removed ? EMOJI.refresh : '⚠️'
      );
    }
    case 'domains':
    case 'names': {
      const kind = sub === 'domains' ? 'domain' : 'name';
      const page = (interaction.options.getInteger('page') ?? 1) - 1;
      const container = panels.buildListPage(kind, page);
      return interaction.reply(style.payload(container, { ephemeral: true }));
    }
    case 'import': {
      const attachment = interaction.options.getAttachment('file', true);
      const kind = interaction.options.getString('kind', true);
      let text;
      try {
        const res = await fetch(attachment.url);
        text = await res.text();
      } catch {
        return reply(interaction, "Couldn't download that file.", '❌');
      }
      const values = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      const added = lists.addMany(kind, values);
      return reply(
        interaction,
        `Added ${added} new ${kind === 'domain' ? 'domain(s)' : 'name(s)'} (${values.length - added} were already listed).`,
        EMOJI.website
      );
    }
    case 'removehash': {
      const hash = interaction.options.getString('hash', true).trim().toLowerCase();
      const removed = await phashStore.removeHash(hash);
      return reply(
        interaction,
        removed ? `Hash \`${hash}\` removed from the scam-image blocklist.` : `Hash \`${hash}\` was not found.`,
        removed ? EMOJI.refresh : '⚠️'
      );
    }
  }
}
module.exports = { data, execute };
