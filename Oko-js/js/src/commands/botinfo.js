'use strict';
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { INVITE_URL, DEVELOPER_URL, BOT_AVATAR_EMOJI } = require('../constants');
const guildSettings = require('../moderation/guildSettings');
const style = require('../moderation/style');
const data = new SlashCommandBuilder()
  .setName('botinfo')
  .setDescription('Show information about this bot');
async function execute(interaction) {
  const client = interaction.client;
  const guildCount = client.guilds.cache.size;
  const memberCount = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
  const latencyMs = Math.round(client.ws.ping);
  const banCount = guildSettings.getGlobalBanCount();
  const description =
    `### ${client.user.username}\n` +
    'Automated crypto/giveaway scam detection for Discord.\n\n' +
    `> **Servers:** ${guildCount}\n` +
    `> **Members protected:** ${memberCount.toLocaleString('en-US')}\n` +
    `> **Scammers caught:** ${banCount}\n` +
    `> **Latency:** ${latencyMs}ms\n` +
    `# **Developer:** ${BOT_AVATAR_EMOJI} [medisiner](${DEVELOPER_URL})\n\n` +
    'Use `/support` for help or `/invite` to add me to another server.';
  const container = style.build(description, { thumbnailUrl: client.user.displayAvatarURL() });
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Invite bot').setStyle(ButtonStyle.Link).setURL(INVITE_URL).setEmoji('➕'),
      new ButtonBuilder().setLabel('Developer').setStyle(ButtonStyle.Link).setURL(DEVELOPER_URL).setEmoji('👤')
    )
  );
  return interaction.reply(style.payload(container));
}
module.exports = { data, execute };
