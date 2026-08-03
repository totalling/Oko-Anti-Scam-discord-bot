'use strict';
const constants = require('../constants');
const actions = require('../moderation/actions');
const blacklist = require('../moderation/blacklist');
const guildSettings = require('../moderation/guildSettings');
const style = require('../moderation/style');
const { getLogger } = require('../logger');
const logger = getLogger('scam_bot.listener');
async function onGuildMemberAdd(member, ctx) {
  if (guildSettings.getGlobalBlacklistEnabled(member.guild.id)) {
    const entry = blacklist.getEntry(member.id);
    if (entry) {
      const punishment = guildSettings.getPunishment(member.guild.id);
      const sourceGuild = ctx.client.guilds.cache.get(String(entry.source_guild_id));
      const sourceName = sourceGuild ? sourceGuild.name : 'another server';
      const reason = `banned in ${sourceName} for ${entry.reason}`;
      const punished = await actions.applyPunishment(
        member,
        punishment,
        `Global scam blacklist — ${reason}`.slice(0, 512)
      );
      await actions.logGlobalBlacklistAction(ctx.client, member.guild, member, punishment, punished, reason);
      logger.info(
        `Global blacklist hit on join: user=${member.id} guild=${member.guild.id} ` +
          `punishment=${punishment} success=${punished}`
      );
    }
  }
  if (member.guild.id !== constants.OKO_GUILD_ID) return;
  const channel = member.guild.channels.cache.get(constants.WELCOME_CHANNEL_ID);
  if (!channel) return;
  const guildId = constants.OKO_GUILD_ID;
  const description =
    `${member}\n\n` +
    'Check out these channels to get started:\n\n' +
    `📢 **https://discord.com/channels/${guildId}/${constants.ANNOUNCEMENTS_CHANNEL_ID}** - Announcements\n` +
    `📝 **https://discord.com/channels/${guildId}/${constants.UPDATES_CHANNEL_ID}** - Updates\n` +
    `🚨 **https://discord.com/channels/${guildId}/${constants.REPORT_SCAMS_CHANNEL_ID}** - Report new scams`;
  const container = style.build(description, { thumbnailUrl: member.displayAvatarURL() });
  await channel.send(
    style.payload(container, { allowedMentions: { users: [member.id] } })
  );
}
module.exports = { onGuildMemberAdd };
