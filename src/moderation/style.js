'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');
const { ACCENT_COLOR } = require('../constants');
const TEXT_DISPLAY_LIMIT = 2000;
function _textDisplay(content) {
  return new TextDisplayBuilder().setContent(content);
}
function _addText(container, text) {
  for (let i = 0; i < text.length; i += TEXT_DISPLAY_LIMIT) {
    container.addTextDisplayComponents(_textDisplay(text.slice(i, i + TEXT_DISPLAY_LIMIT)));
  }
}
function build(description, { timestamp = false, thumbnailUrl = null, accentColor = ACCENT_COLOR } = {}) {
  const container = new ContainerBuilder().setAccentColor(accentColor);
  if (thumbnailUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(_textDisplay(description.slice(0, TEXT_DISPLAY_LIMIT)))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));
    container.addSectionComponents(section);
    if (description.length > TEXT_DISPLAY_LIMIT) {
      _addText(container, description.slice(TEXT_DISPLAY_LIMIT));
    }
  } else {
    _addText(container, description);
  }
  if (timestamp) {
    container.addTextDisplayComponents(_textDisplay(`-# <t:${Math.floor(Date.now() / 1000)}:f>`));
  }
  return container;
}
function commandReply(interaction, message, emoji = '✅') {
  return build(`${emoji} ${interaction.user}: ${message}`);
}
function payload(container, { ephemeral = false, files = undefined, allowedMentions = undefined } = {}) {
  const flags = ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2;
  return { components: [container], flags, files, allowedMentions };
}
module.exports = { build, commandReply, payload, TEXT_DISPLAY_LIMIT };
