'use strict';
const { MediaGalleryBuilder, MediaGalleryItemBuilder, PermissionFlagsBits } = require('discord.js');
const constants = require('../constants');
const blacklist = require('./blacklist');
const guildSettings = require('./guildSettings');
const historyStore = require('./historyStore');
const reviewStore = require('./reviewStore');
const style = require('./style');
const { scamLogComponents, reviewLogComponents } = require('./views');
const TIMEOUT_DURATION_MS = 28 * 24 * 60 * 60 * 1000;
const PUNISHMENT_VERBS = { ban: 'banned', kick: 'kicked', timeout: 'timed out' };
const UNKNOWN_MESSAGE = 10008;
async function _sendCompromisedDm(member, verb) {
  try {
    const description =
      `## 🚨 Your account posted a scam\n\n` +
      `Your account posted a crypto giveaway scam in **${member.guild.name}**, and you were **${verb}**.\n\n` +
      `**If that wasn't you, your account was likely hacked:**\n` +
      '> 1. Change your password immediately\n' +
      '> 2. Enable two-factor authentication\n' +
      "> 3. Remove authorized apps you don't recognize (User Settings → Authorized Apps)";
    const container = style.build(description, {
      accentColor: 0xed4245,
      thumbnailUrl: member.guild.iconURL() ?? undefined,
    });
    await member.send(style.payload(container));
  } catch {
  }
}
async function applyPunishment(member, punishment, reason) {
  try {
    if (punishment === 'kick') {
      await _sendCompromisedDm(member, 'kicked');
      await member.kick(reason);
    } else if (punishment === 'timeout') {
      await member.timeout(TIMEOUT_DURATION_MS, reason);
    } else {
      await _sendCompromisedDm(member, 'banned');
      await member.ban({ reason, deleteMessageSeconds: 86400 });
    }
    return true;
  } catch {
    return false;
  }
}
function _banReason(reasons) {
  for (const r of reasons) {
    if (r.startsWith('known scam domain: ')) {
      return `a scam giveaway linking to ${r.slice('known scam domain: '.length)}`;
    }
  }
  for (const r of reasons) {
    if (r.includes('scam-pattern domain: ')) {
      return `a scam giveaway linking to ${r.split('scam-pattern domain: ')[1]}`;
    }
  }
  for (const r of reasons) {
    if (r.startsWith('impersonates watched name: ')) {
      return `impersonating ${r.slice('impersonates watched name: '.length)} in a fake giveaway`;
    }
  }
  return 'a crypto giveaway scam';
}
function _buildLogContainer(message, result, action, pendingReview) {
  const description =
    `> 🚫 **Scam detected** in ${message.channel}\n` +
    `> **Author:** ${message.author} \`${message.author.id}\`\n` +
    `> **Action:** ${action}\n` +
    `> **Confidence:** ${result.confidence.toFixed(2)} · **Signals:** ${result.reasons.length}` +
    (pendingReview ? '\n> ⏳ **Awaiting moderator review**: Punish or Release below' : '');
  const container = style.build(description, { timestamp: true });
  container.addActionRowComponents(pendingReview ? reviewLogComponents() : scamLogComponents());
  return container;
}
async function takeAction(message, result, imageBytesList, cfg, client) {
  const guildThreshold = message.guild ? guildSettings.getThreshold(message.guild.id) : null;
  const threshold = guildThreshold ?? cfg.confidenceBanThreshold;
  const shouldPunish = result.confidence >= threshold;
  const reviewMode = message.guild ? guildSettings.getReviewMode(message.guild.id) : false;
  let deleted;
  try {
    await message.delete();
    deleted = true;
  } catch (err) {
    deleted = err.code === UNKNOWN_MESSAGE;
  }
  let punished = false;
  let punishment = 'ban';
  if (shouldPunish && message.member) {
    punishment = reviewMode ? 'timeout' : message.guild ? guildSettings.getPunishment(message.guild.id) : 'ban';
    punished = await applyPunishment(
      message.member,
      punishment,
      reviewMode
        ? `Scam detected, held for moderator review (confidence=${result.confidence.toFixed(2)})`
        : `Automated scam-giveaway detection (confidence=${result.confidence.toFixed(2)})`
    );
  }
  const pendingReview = reviewMode && punished;
  const verb = PUNISHMENT_VERBS[punishment] ?? 'banned';
  let action;
  if (deleted && punished) action = `deleted message + ${verb} author`;
  else if (deleted) action = 'deleted message';
  else if (punished) action = `${verb} author`;
  else action = 'flagged only (missing permissions)';
  if (pendingReview) action += ' (pending review)';
  await historyStore.record(message.author.id, {
    guildId: message.guild?.id,
    type: 'detection',
    detail: action,
    confidence: result.confidence,
  });
  await _logToModChannel(message, result, imageBytesList, action, pendingReview);
  if (punished && !reviewMode) {
    await _postPublicGate(message.author, result.reasons, client, verb);
  }
  if (punished && !reviewMode && punishment === 'ban' && message.guild) {
    const reason = _banReason(result.reasons);
    await blacklist.add(message.author.id, {
      reason,
      sourceGuildId: message.guild.id,
      confidence: result.confidence,
    });
    await _propagateGlobalBan(client, message.author.id, message.guild, reason);
  }
  return action;
}
async function logGlobalBlacklistAction(client, guild, member, punishment, punished, reason) {
  const verb = punished ? (PUNISHMENT_VERBS[punishment] ?? 'banned') : 'flagged (missing permissions)';
  await historyStore.record(member.id, {
    guildId: guild.id,
    type: 'global_blacklist',
    detail: `${verb}: ${reason}`,
  });
  const description =
    `> 🌐 **Global blacklist hit** in **${guild.name}**\n` +
    `> **User:** ${member} \`${member.id}\`\n` +
    `> **Action:** ${verb}\n` +
    `> **Reason:** ${reason}`;
  const container = style.build(description, {
    timestamp: true,
    thumbnailUrl: member.displayAvatarURL(),
  });
  const logChannelId = guildSettings.getLogChannelId(guild.id);
  let channel = logChannelId ? guild.channels.cache.get(String(logChannelId)) : null;
  if (!channel) channel = client.channels.cache.get(constants.PUBLIC_GATE_CHANNEL_ID);
  if (!channel) return;
  await channel.send(style.payload(container));
}
async function _propagateGlobalBan(client, userId, sourceGuild, reason) {
  for (const guild of client.guilds.cache.values()) {
    if (guild.id === sourceGuild.id) continue;
    if (!guildSettings.getGlobalBlacklistEnabled(guild.id)) continue;
    const member = guild.members.cache.get(userId);
    if (!member) continue;
    const punishment = guildSettings.getPunishment(guild.id);
    const fullReason = `banned in ${sourceGuild.name} for ${reason}`;
    const punished = await applyPunishment(
      member,
      punishment,
      `Global scam blacklist: ${fullReason}`.slice(0, 512)
    );
    await logGlobalBlacklistAction(client, guild, member, punishment, punished, fullReason);
  }
}
async function _postPublicGate(author, reasons, client, verb) {
  const channel = client.channels.cache.get(constants.PUBLIC_GATE_CHANNEL_ID);
  if (!channel) return;
  const count = await guildSettings.incrementGlobalBanCount();
  const reason = _banReason(reasons);
  const description =
    `> **${author}** was ${verb} for ${reason}.\n` +
    `> **Total scammers caught:** ${count}`;
  const container = style.build(description, {
    timestamp: true,
    thumbnailUrl: author.displayAvatarURL(),
  });
  await channel.send(style.payload(container));
}
async function _logToModChannel(message, result, imageBytesList, action, pendingReview = false) {
  if (!message.guild) return;
  const channelId = guildSettings.getLogChannelId(message.guild.id);
  if (!channelId) return;
  const channel = message.guild.channels.cache.get(String(channelId));
  if (!channel) return;
  const container = _buildLogContainer(message, result, action, pendingReview);
  let files;
  if (imageBytesList.length > 0) {
    files = imageBytesList.map((data, i) => ({ attachment: data, name: `evidence_${i}.png` }));
    const gallery = new MediaGalleryBuilder().addItems(
      files.map((f) => new MediaGalleryItemBuilder().setURL(`attachment://${f.name}`))
    );
    container.addMediaGalleryComponents(gallery);
  }
  const logMessage = await channel.send(style.payload(container, { files }));
  await reviewStore.saveReview(logMessage.id, {
    guildId: message.guild.id,
    authorId: message.author.id,
    confidence: result.confidence,
    reasons: result.reasons,
    content: message.content,
    imageHashes: result.imageHashes,
  });
}
async function handleReviewDecision(interaction, approve) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply(
      style.payload(style.commandReply(interaction, 'You need Manage Server permission to use this.', '🔒'), {
        ephemeral: true,
      })
    );
  }
  const review = reviewStore.getReview(interaction.message.id);
  if (!review) {
    return interaction.reply(
      style.payload(style.commandReply(interaction, 'No stored details for this entry.', '❌'), { ephemeral: true })
    );
  }
  if (review.resolved) {
    return interaction.reply(
      style.payload(style.commandReply(interaction, 'This case has already been reviewed.', '⚠️'), { ephemeral: true })
    );
  }
  await interaction.deferUpdate();
  const guild = interaction.guild;
  const member = await guild.members.fetch(String(review.authorId)).catch(() => null);
  let verdict;
  if (approve) {
    const punishment = guildSettings.getPunishment(guild.id);
    const verb = PUNISHMENT_VERBS[punishment] ?? 'banned';
    if (!member) {
      verdict = 'approved, but the user already left the server';
    } else {
      const punished = await applyPunishment(member, punishment, `Scam review approved by ${interaction.user.tag}`);
      verdict = punished ? `${verb}` : 'punishment failed (missing permissions)';
      if (punished) {
        await _postPublicGate(member.user, review.reasons, interaction.client, verb);
      }
      if (punished && punishment === 'ban') {
        const reason = _banReason(review.reasons);
        await blacklist.add(review.authorId, {
          reason,
          sourceGuildId: guild.id,
          confidence: review.confidence,
        });
        await _propagateGlobalBan(interaction.client, String(review.authorId), guild, reason);
      }
    }
  } else {
    if (member) {
      await member.timeout(null, `Scam review: released by ${interaction.user.tag}`).catch(() => {});
    }
    verdict = 'released';
  }
  await reviewStore.setResolved(interaction.message.id, verdict);
  await historyStore.record(review.authorId, {
    guildId: guild.id,
    type: 'review',
    detail: `${verdict} by ${interaction.user.tag}`,
  });
  const emoji = approve ? '🔨' : '✅';
  const description =
    `> 🚫 **Scam detected**: review complete\n` +
    `> **Author:** <@${review.authorId}> \`${review.authorId}\`\n` +
    `> **Confidence:** ${review.confidence.toFixed(2)} · **Signals:** ${review.reasons.length}\n` +
    `> **Verdict:** ${emoji} **${verdict}** by ${interaction.user}`;
  const container = style.build(description, { timestamp: true });
  container.addActionRowComponents(scamLogComponents());
  await interaction.editReply(style.payload(container));
}
module.exports = { applyPunishment, takeAction, logGlobalBlacklistAction, handleReviewDecision };
