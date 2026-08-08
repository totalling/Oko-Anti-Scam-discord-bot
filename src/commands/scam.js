'use strict';
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { HONEYPOT_CHANNEL_NAME, EMOJI } = require('../constants');
const pipeline = require('../detection/pipeline');
const phashStore = require('../detection/phash');
const blacklist = require('../moderation/blacklist');
const guildSettings = require('../moderation/guildSettings');
const historyStore = require('../moderation/historyStore');
const lists = require('../moderation/lists');
const panels = require('../moderation/panels');
const reviewStore = require('../moderation/reviewStore');
const style = require('../moderation/style');
const { isBotOwner, reply, replyNoGuild, hasManageGuild, replyNoPermission } = require('./helpers');
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
      .setName('unblacklist')
      .setDescription('[Bot owner only] Remove a user from the global scam blacklist')
      .addStringOption((opt) =>
        opt.setName('user_id').setDescription('Discord user ID to remove (right-click user → Copy User ID)').setRequired(true)
      )
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
      .setDescription('Require moderator review before punishing: offenders are timed out pending review')
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
          .setDescription("Leave empty to clear (detections won't be logged anywhere until a channel is set)")
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
    sub
      .setName('threshold')
      .setDescription('Set the confidence score (0.0-1.0) at which detections get punished in this server')
      .addNumberOption((opt) =>
        opt
          .setName('value')
          .setDescription('Punish detections scoring this or higher, e.g. 0.6. Lower = stricter')
      )
      .addBooleanOption((opt) =>
        opt.setName('reset').setDescription('Clear the override and go back to the bot-wide default')
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('history')
      .setDescription("Show a user's recent scam-related actions recorded by Oko")
      .addUserOption((opt) => opt.setName('user').setDescription('User to look up').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName('stats').setDescription("Show scam-detection blocklist sizes and this server's settings")
  )
  .addSubcommandGroup((group) =>
    group
      .setName('honeypot')
      .setDescription('Configure a honeypot trap channel for scammers/bots')
      .addSubcommand((sub) =>
        sub.setName('setup').setDescription('Create a trap channel: anyone who types in it is punished')
      )
      .addSubcommand((sub) =>
        sub
          .setName('setpunishment')
          .setDescription('Choose what happens to users who trigger the honeypot')
          .addStringOption((opt) => punishmentOption(opt, 'What to do to a user who types in the honeypot channel'))
      )
      .addSubcommand((sub) => sub.setName('disable').setDescription('Remove the honeypot trap channel'))
  )
  .addSubcommand((sub) =>
    sub
      .setName('recent')
      .setDescription("Show this server's most recent scam-related actions")
      .addIntegerOption((opt) =>
        opt.setName('count').setDescription('How many to show (default 10, max 25)').setMinValue(1).setMaxValue(25)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('simulate')
      .setDescription('Dry-run the scam detector against text without taking any action')
      .addStringOption((opt) => opt.setName('text').setDescription('Text to test').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName('pending').setDescription('List open review-mode cases awaiting a moderator decision')
  )
  .addSubcommand((sub) =>
    sub
      .setName('blacklistlookup')
      .setDescription("[Bot owner only] Look up a user's global-blacklist status")
      .addStringOption((opt) => opt.setName('user_id').setDescription('Discord user ID to look up').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('appeal')
      .setDescription('Appeal your global blacklist ban to the bot owner')
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Why you believe this was a mistake').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('dashboard').setDescription("Open an interactive control panel for this server's scam-moderation settings")
  )
  .addSubcommand((sub) =>
    sub.setName('globalstats').setDescription('Show recent global-blacklist activity across all servers')
  );
const OWNER_ONLY_SUBCOMMANDS = ['adddomain', 'removedomain', 'addname', 'unblacklist', 'blacklistlookup'];
const NO_PERMISSION_CHECK_SUBCOMMANDS = ['appeal', 'globalstats'];
async function execute(interaction, ctx) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  if (OWNER_ONLY_SUBCOMMANDS.includes(sub)) {
    if (!(await isBotOwner(interaction.client, interaction.user.id))) {
      return replyNoPermission(interaction);
    }
  } else if (!NO_PERMISSION_CHECK_SUBCOMMANDS.includes(sub)) {
    if (!interaction.guild) return replyNoGuild(interaction);
    if (!hasManageGuild(interaction)) return replyNoPermission(interaction);
  }
  if (group === 'honeypot') {
    return executeHoneypot(interaction, sub);
  }
  switch (sub) {
    case 'adddomain': {
      const domain = interaction.options.getString('domain', true);
      const added = lists.add('domain', domain);
      return reply(
        interaction,
        added
          ? `\`${domain}\` has been added to the scam-domain blocklist.`
          : `\`${domain}\` is already blocklisted.`,
        added ? EMOJI.website : '⚠️'
      );
    }
    case 'removedomain': {
      const domain = interaction.options.getString('domain', true);
      const removed = lists.remove('domain', domain);
      return reply(
        interaction,
        removed ? `\`${domain}\` has been removed from the blocklist.` : `\`${domain}\` was not found in the blocklist.`,
        removed ? EMOJI.refresh : '❌'
      );
    }
    case 'addname': {
      const name = interaction.options.getString('name', true);
      const added = lists.add('name', name);
      return reply(
        interaction,
        added ? `\`${name}\` has been added to the watched-names list.` : `\`${name}\` is already watched.`,
        added ? EMOJI.moderation : '⚠️'
      );
    }
    case 'unblacklist': {
      const userId = interaction.options.getString('user_id', true).trim();
      if (!/^\d{17,20}$/.test(userId)) {
        return reply(
          interaction,
          `\`${userId}\` doesn't look like a Discord user ID. Right-click the user → **Copy User ID** (it's a 17–20 digit number).`,
          '❌'
        );
      }
      const entry = blacklist.getEntry(userId);
      if (!entry) {
        return reply(interaction, `\`${userId}\` is not on the global blacklist, nothing to remove.`, '⚠️');
      }
      await blacklist.remove(userId);
      return reply(
        interaction,
        `\`${userId}\` has been removed from the global blacklist (was blacklisted for: ${entry.reason}). ` +
          'They will no longer be auto-punished when joining servers. **Note:** servers that already punished them will NOT undo it automatically. Unban/untimeout them manually where needed.',
        EMOJI.refresh
      );
    }
    case 'threshold': {
      const value = interaction.options.getNumber('value');
      const reset = interaction.options.getBoolean('reset') ?? false;
      const guildId = interaction.guild.id;
      if (value !== null && reset) {
        return reply(
          interaction,
          "Pass either a `value` OR `reset`, not both. To set a threshold: `/scam threshold value:0.7`; to go back to the bot-wide default: `/scam threshold reset:True`.",
          '❌'
        );
      }
      if (reset) {
        const hadOverride = guildSettings.getThreshold(guildId) !== null;
        await guildSettings.setThreshold(guildId, null);
        return reply(
          interaction,
          hadOverride
            ? `Threshold override cleared. This server now uses the bot-wide default of **${ctx.cfg.confidenceBanThreshold}**.`
            : `This server has no threshold override set; it's already using the bot-wide default of **${ctx.cfg.confidenceBanThreshold}**.`,
          hadOverride ? EMOJI.refresh : '⚠️'
        );
      }
      if (value === null) {
        const current = guildSettings.getThreshold(guildId);
        return reply(
          interaction,
          current !== null
            ? `This server's punishment threshold is **${current}** (override). Detections scoring ${current} or higher are punished; lower-scoring ones are still deleted and logged. Pass a \`value\` to change it or \`reset:True\` to use the bot default.`
            : `This server uses the bot-wide default threshold of **${ctx.cfg.confidenceBanThreshold}**. Detections scoring that or higher are punished. Pass a \`value\` (0.0–1.0) to set a server-specific override.`,
          EMOJI.preview
        );
      }
      if (value < 0) {
        return reply(
          interaction,
          `**${value}** is too low: the threshold can't be negative. Confidence scores range from 0.0 to 1.0, so pick something in between (e.g. \`0.6\`).`,
          '❌'
        );
      }
      if (value > 1) {
        return reply(
          interaction,
          `**${value}** is too high: confidence scores max out at 1.0, so nothing would ever be punished. Use a value between 0.0 and 1.0 (e.g. \`0.8\` for a stricter-than-default setting).`,
          '❌'
        );
      }
      await guildSettings.setThreshold(guildId, value);
      let caution = '';
      if (value === 0) {
        caution = ' ⚠️ **0.0 punishes every single detection**, including borderline ones. Expect false positives.';
      } else if (value < 0.4) {
        caution = ' ⚠️ That\'s quite low; expect more false positives on innocent messages.';
      } else if (value > 0.85) {
        caution = ' ⚠️ That\'s very high; some real scams will only be deleted and logged, not punished.';
      }
      return reply(
        interaction,
        `Punishment threshold for this server is now **${value}**. Detections scoring ${value} or higher will be punished; lower-scoring detections are still deleted and logged.${caution}`,
        EMOJI.moderation
      );
    }
    case 'history': {
      const user = interaction.options.getUser('user', true);
      const entries = historyStore.getHistory(user.id).slice().reverse();
      if (entries.length === 0) {
        return reply(
          interaction,
          `No recorded actions for ${user}. History only covers actions Oko has taken since this feature was added.`,
          EMOJI.preview
        );
      }
      const TYPE_LABELS = {
        detection: `${EMOJI.moderation} Detection`,
        honeypot: '🪤 Honeypot',
        global_blacklist: `${EMOJI.website} Global blacklist`,
        review: `${EMOJI.moderation} Review`,
        antinuke: '🛡️ Anti-nuke',
      };
      const lines = entries.map((e) => {
        const when = `<t:${Math.floor(new Date(e.at).getTime() / 1000)}:d>`;
        const label = TYPE_LABELS[e.type] ?? e.type;
        const conf = e.confidence !== null && e.confidence !== undefined ? ` (confidence ${Number(e.confidence).toFixed(2)})` : '';
        return `> ${when} · **${label}** · ${e.detail}${conf}`;
      });
      const description = `${EMOJI.preview} **History for ${user}** \`${user.id}\` (latest ${entries.length}):\n${lines.join('\n')}`;
      return interaction.reply(style.payload(style.build(description), { ephemeral: true }));
    }
    case 'toggle': {
      const enabled = interaction.options.getBoolean('enabled', true);
      await guildSettings.setEnabled(interaction.guild.id, enabled);
      return reply(
        interaction,
        `Scam auto-moderation is now **${enabled ? 'enabled' : 'disabled'}** for this server.`,
        EMOJI.moderation
      );
    }
    case 'review': {
      const enabled = interaction.options.getBoolean('enabled', true);
      await guildSettings.setReviewMode(interaction.guild.id, enabled);
      return reply(
        interaction,
        enabled
          ? 'Review mode is now **enabled**. Scammers will be **timed out** and held for moderator review in the log channel. Approve the configured punishment or release them with the buttons on the log message.'
          : 'Review mode is now **disabled**. The configured punishment applies immediately again.',
        EMOJI.moderation
      );
    }
    case 'setlogchannel': {
      const channel = interaction.options.getChannel('channel');
      await guildSettings.setLogChannelId(interaction.guild.id, channel ? channel.id : null);
      return reply(
        interaction,
        channel
          ? `Scam detections in this server will now be logged to ${channel}.`
          : "Cleared this server's log channel. Detections will no longer be logged until you set a new one.",
        channel ? EMOJI.preview : EMOJI.refresh
      );
    }
    case 'setpunishment': {
      const punishment = interaction.options.getString('punishment', true);
      await guildSettings.setPunishment(interaction.guild.id, punishment);
      return reply(
        interaction,
        `Scam auto-moderation punishment for this server is now **${PUNISHMENT_LABELS[punishment]}**.`,
        EMOJI.moderation
      );
    }
    case 'globalblacklist': {
      const enabled = interaction.options.getBoolean('enabled', true);
      await guildSettings.setGlobalBlacklistEnabled(interaction.guild.id, enabled);
      return reply(
        interaction,
        `Global scam blacklist is now **${enabled ? 'enabled' : 'disabled'}**. ` +
          `Members banned by Oko in another server will ${enabled ? 'now' : 'no longer'} be ` +
          "punished here (using this server's `/scam setpunishment` setting).",
        EMOJI.website
      );
    }
    case 'stats': {
      const guildId = interaction.guild.id;
      const enabled = guildSettings.isEnabled(guildId);
      const logChannelId = guildSettings.getLogChannelId(guildId);
      const logChannelText = logChannelId ? `<#${logChannelId}>` : 'not set (run `/scam setlogchannel`)';
      const punishment = guildSettings.getPunishment(guildId);
      const honeypotId = guildSettings.getHoneypotChannelId(guildId);
      const honeypotText = honeypotId ? `<#${honeypotId}>` : 'not set (run `/scam honeypot setup`)';
      const honeypotPunishment = guildSettings.getHoneypotPunishment(guildId);
      const globalBlacklistEnabled = guildSettings.getGlobalBlacklistEnabled(guildId);
      const reviewMode = guildSettings.getReviewMode(guildId);
      const threshold = guildSettings.getThreshold(guildId);
      const thresholdText =
        threshold !== null ? `${threshold} (server override)` : `${ctx.cfg.confidenceBanThreshold} (bot default)`;
      const hashes = phashStore.readStore();
      const description =
        `${EMOJI.preview} **Scam-detection stats**\n` +
        `> **Auto-moderation:** ${enabled ? 'ON' : 'OFF'}\n` +
        `> **Log channel:** ${logChannelText}\n` +
        `> **Scam punishment:** ${PUNISHMENT_LABELS[punishment] ?? punishment}\n` +
        `> **Punishment threshold:** ${thresholdText}\n` +
        `> **Review mode:** ${reviewMode ? 'ON (offenders timed out pending review)' : 'OFF'}\n` +
        `> **Honeypot channel:** ${honeypotText}\n` +
        `> **Honeypot punishment:** ${PUNISHMENT_LABELS[honeypotPunishment] ?? honeypotPunishment}\n` +
        `> **Global blacklist:** ${globalBlacklistEnabled ? 'ON' : 'OFF'}\n` +
        `> **Known scam domains:** ${lists.count('domain')}\n` +
        `> **Watched names:** ${lists.count('name')}\n` +
        `> **Known scam image hashes:** ${Object.keys(hashes).length}`;
      return interaction.reply(style.payload(style.build(description), { ephemeral: true }));
    }
    case 'recent': {
      const count = interaction.options.getInteger('count') ?? 10;
      const entries = historyStore.getRecentForGuild(interaction.guild.id, count);
      if (entries.length === 0) {
        return reply(interaction, 'No recorded scam-related actions for this server yet.', EMOJI.preview);
      }
      const TYPE_LABELS = {
        detection: `${EMOJI.moderation} Detection`,
        honeypot: '🪤 Honeypot',
        global_blacklist: `${EMOJI.website} Global blacklist`,
        review: `${EMOJI.moderation} Review`,
        antinuke: '🛡️ Anti-nuke',
      };
      const lines = entries.map((e) => {
        const when = `<t:${Math.floor(new Date(e.at).getTime() / 1000)}:R>`;
        const label = TYPE_LABELS[e.type] ?? e.type;
        return `> ${when} · <@${e.userId}> · **${label}** · ${e.detail}`;
      });
      const description = `${EMOJI.preview} **Recent activity** (latest ${entries.length}):\n${lines.join('\n')}`;
      return interaction.reply(style.payload(style.build(description), { ephemeral: true }));
    }
    case 'simulate': {
      const text = interaction.options.getString('text', true);
      const result = await pipeline.scan(text, [], ctx.cfg);
      const reasonsText =
        result.reasons.length > 0 ? result.reasons.map((r) => `> - ${r}`).join('\n') : '> *(no signals matched)*';
      const description =
        `${EMOJI.preview} **Simulation result**\n` +
        `> **Would flag as scam:** ${result.isScam ? 'YES' : 'no'}\n` +
        `> **Confidence:** ${result.confidence.toFixed(2)}\n` +
        `**Signals:**\n${reasonsText}`;
      const container = style.build(description);
      const domainMatch = result.reasons
        .map((r) => /(?:scam-pattern domain|known scam domain): (.+)$/.exec(r))
        .find(Boolean);
      if (domainMatch) {
        const domain = domainMatch[1].trim();
        if (!lists.has('domain', domain)) {
          container.addActionRowComponents(panels.simulateAddButtonRow(domain));
        }
      }
      return interaction.reply(style.payload(container, { ephemeral: true }));
    }
    case 'pending': {
      const pending = reviewStore.getPendingForGuild(interaction.guild.id);
      if (pending.length === 0) {
        return reply(interaction, 'No open review-mode cases for this server.', EMOJI.preview);
      }
      const logChannelId = guildSettings.getLogChannelId(interaction.guild.id);
      const lines = pending.map((p) => {
        const jump = logChannelId
          ? `[Jump](https://discord.com/channels/${interaction.guild.id}/${logChannelId}/${p.messageId})`
          : `\`${p.messageId}\``;
        return `> <@${p.authorId}> · confidence ${Number(p.confidence).toFixed(2)} · ${jump}`;
      });
      const description = `${EMOJI.moderation} **Pending review** (${pending.length}):\n${lines.join('\n')}`;
      return interaction.reply(style.payload(style.build(description), { ephemeral: true }));
    }
    case 'blacklistlookup': {
      const userId = interaction.options.getString('user_id', true).trim();
      if (!/^\d{17,20}$/.test(userId)) {
        return reply(interaction, `\`${userId}\` doesn't look like a Discord user ID.`, '❌');
      }
      const entry = blacklist.getEntry(userId);
      if (!entry) {
        return reply(interaction, `\`${userId}\` is not on the global blacklist.`, EMOJI.preview);
      }
      const description =
        `${EMOJI.website} **Global blacklist entry for** \`${userId}\`\n` +
        `> **Reason:** ${entry.reason}\n` +
        `> **Source server:** ${entry.source_guild_id}\n` +
        `> **Confidence:** ${entry.confidence !== undefined ? Number(entry.confidence).toFixed(2) : 'n/a'}\n` +
        `> **Added:** <t:${Math.floor(new Date(entry.added_at).getTime() / 1000)}:f>`;
      const container = style.build(description);
      container.addActionRowComponents(panels.blacklistLookupRow(userId));
      return interaction.reply(style.payload(container, { ephemeral: true }));
    }
    case 'appeal': {
      const reason = interaction.options.getString('reason', true);
      const entry = blacklist.getEntry(interaction.user.id);
      if (!entry) {
        return reply(interaction, "You're not on the global blacklist, nothing to appeal.", EMOJI.preview);
      }
      const app = await interaction.client.application.fetch();
      const owner = app.owner;
      const ownerUsers = owner?.members ? [...owner.members.values()].map((m) => m.user) : owner ? [owner] : [];
      if (ownerUsers.length === 0) {
        return reply(interaction, "Couldn't reach the bot owner right now, try again later.", '❌');
      }
      const description =
        `${EMOJI.report} **Blacklist appeal**\n` +
        `> **User:** ${interaction.user} \`${interaction.user.id}\`\n` +
        `> **Blacklisted for:** ${entry.reason}\n` +
        `> **Their appeal:** ${reason.slice(0, 500)}`;
      const container = style.build(description, { timestamp: true, thumbnailUrl: interaction.user.displayAvatarURL() });
      container.addActionRowComponents(panels.appealRow(interaction.user.id));
      let sent = false;
      for (const ownerUser of ownerUsers) {
        try {
          await ownerUser.send(style.payload(container));
          sent = true;
        } catch {
        }
      }
      if (!sent) {
        return reply(interaction, "Couldn't DM the bot owner, they may have DMs closed.", '❌');
      }
      return reply(interaction, 'Your appeal has been sent to the bot owner.', EMOJI.report);
    }
    case 'dashboard': {
      return interaction.reply(style.payload(panels.buildDashboard(interaction.guild.id, ctx.cfg)));
    }
    case 'globalstats': {
      const totalBans = guildSettings.getGlobalBanCount();
      const recent = blacklist.getRecent(10);
      const lines =
        recent.length > 0
          ? recent
              .map(
                (e) =>
                  `> <t:${Math.floor(new Date(e.added_at).getTime() / 1000)}:R> · \`${e.userId}\` · ${e.reason}`
              )
              .join('\n')
          : '> *(none yet)*';
      const description =
        `${EMOJI.website} **Global scam-network stats**\n` +
        `> **Total scammers caught:** ${totalBans}\n` +
        `> **Servers protected:** ${interaction.client.guilds.cache.size}\n\n` +
        `**Recent global-blacklist entries:**\n${lines}`;
      return interaction.reply(style.payload(style.build(description)));
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
          topic: "🚨 Do NOT send a message in this channel: it's a trap. You will be punished.",
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
          'Change the honeypot punishment with `/scam honeypot setpunishment`.',
        EMOJI.moderation
      );
    }
    case 'setpunishment': {
      const punishment = interaction.options.getString('punishment', true);
      await guildSettings.setHoneypotPunishment(guild.id, punishment);
      return reply(
        interaction,
        `Honeypot punishment for this server is now **${PUNISHMENT_LABELS[punishment]}**.`,
        EMOJI.moderation
      );
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
      return reply(interaction, 'Honeypot channel removed.', EMOJI.refresh);
    }
  }
}
module.exports = { data, execute };
