'use strict';
const style = require('../moderation/style');
const actions = require('../moderation/actions');
const {
  DETAILS_BUTTON_ID,
  REVIEW_PUNISH_ID,
  REVIEW_RELEASE_ID,
  handleDetailsButton,
} = require('../moderation/views');
const { getLogger } = require('../logger');
const logger = getLogger('scam_bot.interactions');
async function onInteractionCreate(interaction, ctx) {
  try {
    if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
      const command = ctx.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`No handler for command ${interaction.commandName}`);
        return;
      }
      await command.execute(interaction, ctx);
    } else if (interaction.isButton()) {
      if (interaction.customId === DETAILS_BUTTON_ID) await handleDetailsButton(interaction);
      else if (interaction.customId === REVIEW_PUNISH_ID) await actions.handleReviewDecision(interaction, true);
      else if (interaction.customId === REVIEW_RELEASE_ID) await actions.handleReviewDecision(interaction, false);
    }
  } catch (err) {
    logger.error(`Unhandled interaction error (${interaction.commandName ?? interaction.customId}):`, err);
    const container = style.commandReply(interaction, 'Something went wrong running that command.', '❌');
    const errorPayload = style.payload(container, { ephemeral: true });
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorPayload);
      } else {
        await interaction.reply(errorPayload);
      }
    } catch {
    }
  }
}
module.exports = { onInteractionCreate };
