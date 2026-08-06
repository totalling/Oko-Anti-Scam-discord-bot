'use strict';
const style = require('../moderation/style');
const actions = require('../moderation/actions');
const {
  DETAILS_BUTTON_ID,
  REVIEW_PUNISH_ID,
  REVIEW_RELEASE_ID,
  handleDetailsButton,
} = require('../moderation/views');
const {
  DASHBOARD_PREFIX,
  SIM_ADD_PREFIX,
  BL_REMOVE_PREFIX,
  APPEAL_APPROVE_PREFIX,
  APPEAL_DENY_PREFIX,
  LIST_PAGE_PREFIX,
  handleDashboardButton,
  handleSimulateAddButton,
  handleBlacklistRemoveButton,
  handleAppealButton,
  handleListPageButton,
} = require('../moderation/panels');
async function onInteractionCreate(interaction, ctx) {
  try {
    if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
      const command = ctx.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, ctx);
    } else if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === DETAILS_BUTTON_ID) await handleDetailsButton(interaction);
      else if (id === REVIEW_PUNISH_ID) await actions.handleReviewDecision(interaction, true);
      else if (id === REVIEW_RELEASE_ID) await actions.handleReviewDecision(interaction, false);
      else if (id.startsWith(DASHBOARD_PREFIX)) await handleDashboardButton(interaction, ctx);
      else if (id.startsWith(SIM_ADD_PREFIX)) await handleSimulateAddButton(interaction);
      else if (id.startsWith(BL_REMOVE_PREFIX)) await handleBlacklistRemoveButton(interaction);
      else if (id.startsWith(APPEAL_APPROVE_PREFIX)) await handleAppealButton(interaction, true);
      else if (id.startsWith(APPEAL_DENY_PREFIX)) await handleAppealButton(interaction, false);
      else if (id.startsWith(LIST_PAGE_PREFIX)) await handleListPageButton(interaction);
    }
  } catch {
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
