'use strict';
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { INVITE_URL, EMOJI } = require('../constants');
const style = require('../moderation/style');
const data = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('Get an invite link to add this bot to your server');
async function execute(interaction) {
  const container = style.commandReply(interaction, 'Click below to add me to your server.', EMOJI.website);
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Invite bot').setStyle(ButtonStyle.Link).setURL(INVITE_URL).setEmoji('➕')
    )
  );
  return interaction.reply(style.payload(container, { ephemeral: true }));
}
module.exports = { data, execute };
