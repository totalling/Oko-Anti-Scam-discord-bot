'use strict';
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { SUPPORT_SERVER_URL, EMOJI } = require('../constants');
const style = require('../moderation/style');
const data = new SlashCommandBuilder()
  .setName('support')
  .setDescription('Get an invite link to the support server');
async function execute(interaction) {
  const container = style.commandReply(interaction, 'Need help? Join the support server below.', EMOJI.website);
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Support server').setStyle(ButtonStyle.Link).setURL(SUPPORT_SERVER_URL).setEmoji('🔗')
    )
  );
  return interaction.reply(style.payload(container));
}
module.exports = { data, execute };
