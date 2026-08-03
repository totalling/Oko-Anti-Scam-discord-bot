'use strict';
const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { DATA_DIR, HONEYPOT_CHANNEL_NAME } = require('../constants');
const phashStore = require('../detection/phash');
const guildSettings = require('../moderation/guildSettings');
const style = require('../moderation/style');
const { isBotOwner, reply, replyNoGuild, hasManageGuild, replyNoPermission } = require('./helpers');
const SCAM_DOMAINS_FILE = path.join(DATA_DIR, 'scam_domains.txt');
const WATCHED_NAMES_FILE = path.join(DATA_DIR, 'watched_names.txt');
const PUNISHMENT_LABELS = { ban: 'Ban', kick: 'Kick', timeout: 'Timeout / Mute' };
const PUNISHMENT_VERBS = { ban: 'banned', kick: 'kicked', timeout: 'timed out / muted' };
const punishmentOption = (option, description) =>
  option
    .setName('punishment')
    .setDescription(description)
    .setRequired(true)
    .addChoices(
      { name: 'Ban', value: 'ban' },
      { name: 'Kick', value: 'kick' },
      { name: 'Timeout / Mute', value: 'timeout' }
    );
const data = new SlashCommandBuilder()
  .setName('scam')
  .setDescription('Scam-detection moderation tools')
  .addSubcommand((sub) =>
    sub
      .setName('adddomain')
      .setDescription('[Bot owner only] Add a domain to the scam-domain blocklist')
      .addStringOption((opt) => opt.setName('domain').setDescription('Domain to blocklist').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('removedomain')
      .setDescription('[Bot owner only] Remove a domain from the scam-domain blocklist')
      .addStringOption((opt) => opt.setName('domain').setDescription('Domain to remove').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('addname')
      .setDescription('[Bot owner only] Add a public figure/brand name to the impersonation watchlist')
      .addStringOption((opt) => opt.setName('name').setDescription('Name to watch').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('toggle')
      .setDescription('Enable or disable scam auto-moderation in this server')
      .addBooleanOption((opt) =>
        opt.setName('enabled').setDescription('Turn scam detection on or off for this server').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('review')
      .setDescription('Require moderator review before punishing — offenders are timed out pending review')
      .addBooleanOption((opt) =>
        opt
          .setName('enabled')
          .setDescription('Hold scammers in a timeout until a moderator reviews them in the log channel')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('setlogchannel')
      .setDescription("Set the channel where this server's scam detections get logged")
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription("Leave empty to clear — detections won't be logged anywhere until a channel is set")
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('setpunishment')
      .setDescription('Choose what happens to users caught by scam auto-moderation')
      .addStringOption((opt) =>
        punishmentOption(opt, 'What to do to a user caught by auto-moderation (scam links/images/messages)')
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('globalblacklist')
      .setDescription('If enabled, members banned by Oko in other servers get punished here too')
      .addBooleanOption((opt) =>
        opt
          .setName('enabled')
          .setDescription("Punish members here who've been banned by Oko in another server")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('stats').setDescription("Show scam-detection blocklist sizes and this server's settings")
  )
  .addSubcommandGroup((group) =>
    group
      .setName('honeypot')
      .setDescription('Configure a honeypot trap channel for scammers/bots')
      .addSubcommand((sub) =>
        sub.setName('setup').setDescription('Create a trap channel — anyone who types in it is punished')
      )
      .addSubcommand((sub) =>
        sub
          .setName('setpunishment')
          .setDescription('Choose what happens to users who trigger the honeypot')
          .addStringOption((opt) => punishmentOption(opt, 'What to do to a user who types in the honeypot channel'))
      )
      .addSubcommand((sub) => sub.setName('disable').setDescription('Remove the honeypot trap channel'))
  );
function _appendUniqueLine(filePath, value) {
  value = value.trim().toLowerCase();
  const existing = new Set(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
  );
  if (existing.has(value)) return false;
  fs.appendFileSync(filePath, `\n${value}`, 'utf8');
  return true;
}
function _removeLine(filePath, value) {
  value = value.trim().toLowerCase();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const kept = lines.filter((line) => line.trim().toLowerCase() !== value);
  if (kept.length === lines.length) return false;
  fs.writeFileSync(filePath, kept.join('\n') + '\n', 'utf8');
  return true;
}
function _countEntries(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('#')).length;
}
async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  if (['adddomain', 'removedomain', 'addname'].includes(sub)) {
    if (!(await isBotOwner(interaction.client, interaction.user.id))) {
      return replyNoPermission(interaction);
    }
  } else {
    if (!interaction.guild) return replyNoGuild(interaction);
    if (!hasManageGuild(interaction)) return replyNoPermission(interaction);
  }
  if (group === 'honeypot') {
    return executeHoneypot(interaction, sub);
  }
  switch (sub) {
    case 'adddomain': {
      const domain = interaction.options.getString('domain', true);
      const added = _appendUniqueLine(SCAM_DOMAINS_FILE, domain);
      return reply(
        interaction,
        added
          ? `\`${domain}\` has been added to the scam-domain blocklist.`
          : `\`${domain}\` is already blocklisted.`,
        added ? '✅' : '⚠️'
      );
    }
    case 'removedomain': {
      const domain = interaction.options.getString('domain', true);
      const removed = _removeLine(SCAM_DOMAINS_FILE, domain);
      return reply(
        interaction,
        removed ? `\`${domain}\` has been removed from the blocklist.` : `\`${domain}\` was not found in the blocklist.`,
        removed ? '✅' : '❌'
      );
    }
    case 'addname': {
      const name = interaction.options.getString('name', true);
      const added = _appendUniqueLine(WATCHED_NAMES_FILE, name);
      return reply(
        interaction,
        added ? `\`${name}\` has been added to the watched-names list.` : `\`${name}\` is already watched.`,
        added ? '✅' : '⚠️'
      );
    }
    case 'toggle': {
      const enabled = interaction.options.getBoolean('enabled', true);
      await guildSettings.setEnabled(interaction.guild.id, enabled);
      return reply(
        interaction,
        `Scam auto-moderation is now **${enabled ? 'enabled' : 'disabled'}** for this server.`
      );
    }
    case 'review': {
      const enabled = interaction.options.getBoolean('enabled', true);
      await guildSettings.setReviewMode(interaction.guild.id, enabled);
      return reply(
        interaction,
        enabled
          ? 'Review mode is now **enabled**. Scammers will be **timed out** and held for moderator review in the log channel — approve the configured punishment or release them with the buttons on the log message.'
          : 'Review mode is now **disabled**. The configured punishment applies immediately again.'
      );
    }
    case 'setlogchannel': {
      const channel = interaction.options.getChannel('channel');
      await guildSettings.setLogChannelId(interaction.guild.id, channel ? channel.id : null);
      return reply(
        interaction,
        channel
          ? `Scam detections in this server will now be logged to ${channel}.`
          : "Cleared this server's log channel. Detections will no longer be logged until you set a new one."
      );
    }
    case 'setpunishment': {
      const punishment = interaction.options.getString('punishment', true);
      await guildSettings.setPunishment(interaction.guild.id, punishment);
      return reply(
        interaction,
        `Scam auto-moderation punishment for this server is now **${PUNISHMENT_LABELS[punishment]}**.`
      );
    }
    case 'globalblacklist': {
      const enabled = interaction.options.getBoolean('enabled', true);
      await guildSettings.setGlobalBlacklistEnabled(interaction.guild.id, enabled);
      return reply(
        interaction,
        `Global scam blacklist is now **${enabled ? 'enabled' : 'disabled'}**. ` +
          `Members banned by Oko in another server will ${enabled ? 'now' : 'no longer'} be ` +
          "punished here (using this server's `/scam setpunishment` setting)."
      );
    }
    case 'stats': {
      const guildId = interaction.guild.id;
      const enabled = guildSettings.isEnabled(guildId);
      const logChannelId = guildSettings.getLogChannelId(guildId);
      const logChannelText = logChannelId ? `<#${logChannelId}>` : 'not set — run `/scam setlogchannel`';
      const punishment = guildSettings.getPunishment(guildId);
      const honeypotId = guildSettings.getHoneypotChannelId(guildId);
      const honeypotText = honeypotId ? `<#${honeypotId}>` : 'not set — run `/scam honeypot setup`';
      const honeypotPunishment = guildSettings.getHoneypotPunishment(guildId);
      const globalBlacklistEnabled = guildSettings.getGlobalBlacklistEnabled(guildId);
      const reviewMode = guildSettings.getReviewMode(guildId);
      const hashes = phashStore.readStore();
      const description =
        `> **Auto-moderation:** ${enabled ? 'ON' : 'OFF'}\n` +
        `> **Log channel:** ${logChannelText}\n` +
        `> **Scam punishment:** ${PUNISHMENT_LABELS[punishment] ?? punishment}\n` +
        `> **Review mode:** ${reviewMode ? 'ON — offenders timed out pending review' : 'OFF'}\n` +
        `> **Honeypot channel:** ${honeypotText}\n` +
        `> **Honeypot punishment:** ${PUNISHMENT_LABELS[honeypotPunishment] ?? honeypotPunishment}\n` +
        `> **Global blacklist:** ${globalBlacklistEnabled ? 'ON' : 'OFF'}\n` +
        `> **Known scam domains:** ${_countEntries(SCAM_DOMAINS_FILE)}\n` +
        `> **Watched names:** ${_countEntries(WATCHED_NAMES_FILE)}\n` +
        `> **Known scam image hashes:** ${Object.keys(hashes).length}`;
      return interaction.reply(style.payload(style.build(description), { ephemeral: true }));
    }
  }
}
async function executeHoneypot(interaction, sub) {
  const guild = interaction.guild;
  switch (sub) {
    case 'setup': {
      const existingId = guildSettings.getHoneypotChannelId(guild.id);
      if (existingId && guild.channels.cache.get(String(existingId))) {
        return reply(interaction, `A honeypot channel is already set up: <#${existingId}>.`, '⚠️');
      }
      const me = guild.members.me;
      if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return reply(interaction, 'I need the **Manage Channels** permission to set up a honeypot.', '❌');
      }
      let channel;
      try {
        channel = await guild.channels.create({
          name: HONEYPOT_CHANNEL_NAME,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: me.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
              ],
            },
          ],
          topic: "🚨 Do NOT send a message in this channel — it's a trap. You will be punished.",
          reason: `Honeypot setup by ${interaction.user.tag}`,
        });
      } catch {
        return reply(interaction, "I don't have permission to create channels in this server.", '❌');
      }
      await guildSettings.setHoneypotChannelId(guild.id, channel.id);
      const punishment = guildSettings.getHoneypotPunishment(guild.id);
      return reply(
        interaction,
        `Honeypot channel created: ${channel}. Anyone who types there ` +
          `(other than moderators) will be **${PUNISHMENT_VERBS[punishment] ?? punishment}**. ` +
          'Change the honeypot punishment with `/scam honeypot setpunishment`.'
      );
    }
    case 'setpunishment': {
      const punishment = interaction.options.getString('punishment', true);
      await guildSettings.setHoneypotPunishment(guild.id, punishment);
      return reply(interaction, `Honeypot punishment for this server is now **${PUNISHMENT_LABELS[punishment]}**.`);
    }
    case 'disable': {
      const channelId = guildSettings.getHoneypotChannelId(guild.id);
      if (!channelId) {
        return reply(interaction, 'No honeypot channel is set up.', '⚠️');
      }
      const channel = guild.channels.cache.get(String(channelId));
      if (channel) {
        try {
          await channel.delete(`Honeypot disabled by ${interaction.user.tag}`);
        } catch {
        }
      }
      await guildSettings.setHoneypotChannelId(guild.id, null);
      return reply(interaction, 'Honeypot channel removed.');
    }
  }
}
module.exports = { data, execute };
