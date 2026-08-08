'use strict';
const path = require('path');
const { DATA_DIR } = require('../constants');
const { createStore } = require('./jsonStore');
const store = createStore(path.join(DATA_DIR, 'guild_settings.json'));
const VALID_PUNISHMENTS = ['ban', 'kick', 'timeout'];
function _entry(data, guildId) {
  return data[String(guildId)] ?? {};
}
function _set(guildId, key, value) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data[String(guildId)] ??= {});
    entry[key] = value;
    entry.updated_at = new Date().toISOString();
    write(data);
  });
}
function isEnabled(guildId) {
  return _entry(store.read(), guildId).enabled ?? true;
}
function setEnabled(guildId, enabled) {
  return _set(guildId, 'enabled', enabled);
}
function getLogChannelId(guildId) {
  return _entry(store.read(), guildId).log_channel_id ?? null;
}
function setLogChannelId(guildId, channelId) {
  return _set(guildId, 'log_channel_id', channelId);
}
function incrementGlobalBanCount() {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data._global ??= {});
    entry.ban_count = (entry.ban_count ?? 0) + 1;
    entry.updated_at = new Date().toISOString();
    write(data);
    return entry.ban_count;
  });
}
function getGlobalBanCount() {
  return store.read()._global?.ban_count ?? 0;
}
function getPunishment(guildId) {
  return _entry(store.read(), guildId).punishment ?? 'ban';
}
function setPunishment(guildId, punishment) {
  if (!VALID_PUNISHMENTS.includes(punishment)) {
    throw new Error(`Invalid punishment: ${punishment}`);
  }
  return _set(guildId, 'punishment', punishment);
}
function getHoneypotChannelId(guildId) {
  return _entry(store.read(), guildId).honeypot_channel_id ?? null;
}
function setHoneypotChannelId(guildId, channelId) {
  return _set(guildId, 'honeypot_channel_id', channelId);
}
function getHoneypotPunishment(guildId) {
  return _entry(store.read(), guildId).honeypot_punishment ?? 'ban';
}
function setHoneypotPunishment(guildId, punishment) {
  if (!VALID_PUNISHMENTS.includes(punishment)) {
    throw new Error(`Invalid punishment: ${punishment}`);
  }
  return _set(guildId, 'honeypot_punishment', punishment);
}
function getGlobalBlacklistEnabled(guildId) {
  return _entry(store.read(), guildId).global_blacklist_enabled ?? false;
}
function setGlobalBlacklistEnabled(guildId, enabled) {
  return _set(guildId, 'global_blacklist_enabled', enabled);
}
function getReviewMode(guildId) {
  return _entry(store.read(), guildId).review_mode ?? false;
}
function setReviewMode(guildId, enabled) {
  return _set(guildId, 'review_mode', enabled);
}
function getThreshold(guildId) {
  return _entry(store.read(), guildId).threshold ?? null;
}
function setThreshold(guildId, threshold) {
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    throw new Error(`Invalid threshold: ${threshold}`);
  }
  return _set(guildId, 'threshold', threshold);
}
function getExemptUserIds(guildId) {
  return _entry(store.read(), guildId).exempt_user_ids ?? [];
}
function addExemptUserId(guildId, userId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data[String(guildId)] ??= {});
    const list = (entry.exempt_user_ids ??= []);
    userId = String(userId);
    if (list.includes(userId)) return false;
    list.push(userId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function removeExemptUserId(guildId, userId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = data[String(guildId)];
    const list = entry?.exempt_user_ids ?? [];
    userId = String(userId);
    if (!list.includes(userId)) return false;
    entry.exempt_user_ids = list.filter((id) => id !== userId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function getExemptRoleIds(guildId) {
  return _entry(store.read(), guildId).exempt_role_ids ?? [];
}
function addExemptRoleId(guildId, roleId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data[String(guildId)] ??= {});
    const list = (entry.exempt_role_ids ??= []);
    roleId = String(roleId);
    if (list.includes(roleId)) return false;
    list.push(roleId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function removeExemptRoleId(guildId, roleId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = data[String(guildId)];
    const list = entry?.exempt_role_ids ?? [];
    roleId = String(roleId);
    if (!list.includes(roleId)) return false;
    entry.exempt_role_ids = list.filter((id) => id !== roleId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function getIgnoredChannelIds(guildId) {
  return _entry(store.read(), guildId).ignored_channel_ids ?? [];
}
function addIgnoredChannelId(guildId, channelId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data[String(guildId)] ??= {});
    const list = (entry.ignored_channel_ids ??= []);
    channelId = String(channelId);
    if (list.includes(channelId)) return false;
    list.push(channelId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function removeIgnoredChannelId(guildId, channelId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = data[String(guildId)];
    const list = entry?.ignored_channel_ids ?? [];
    channelId = String(channelId);
    if (!list.includes(channelId)) return false;
    entry.ignored_channel_ids = list.filter((id) => id !== channelId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function getAntiNukeEnabled(guildId) {
  return _entry(store.read(), guildId).antinuke_enabled ?? false;
}
function setAntiNukeEnabled(guildId, enabled) {
  return _set(guildId, 'antinuke_enabled', enabled);
}
function getAntiNukeThreshold(guildId) {
  return _entry(store.read(), guildId).antinuke_threshold ?? 5;
}
function setAntiNukeThreshold(guildId, threshold) {
  if (!Number.isInteger(threshold) || threshold < 2 || threshold > 20) {
    throw new Error(`Invalid anti-nuke threshold: ${threshold}`);
  }
  return _set(guildId, 'antinuke_threshold', threshold);
}
function getAntiNukeWindowSeconds(guildId) {
  return _entry(store.read(), guildId).antinuke_window_seconds ?? 10;
}
function setAntiNukeWindowSeconds(guildId, seconds) {
  if (!Number.isInteger(seconds) || seconds < 3 || seconds > 300) {
    throw new Error(`Invalid anti-nuke window: ${seconds}`);
  }
  return _set(guildId, 'antinuke_window_seconds', seconds);
}
function getAntiNukePunishment(guildId) {
  return _entry(store.read(), guildId).antinuke_punishment ?? 'kick';
}
function setAntiNukePunishment(guildId, punishment) {
  if (!VALID_PUNISHMENTS.includes(punishment)) {
    throw new Error(`Invalid punishment: ${punishment}`);
  }
  return _set(guildId, 'antinuke_punishment', punishment);
}
function getAntiNukeExemptUserIds(guildId) {
  return _entry(store.read(), guildId).antinuke_exempt_user_ids ?? [];
}
function addAntiNukeExemptUserId(guildId, userId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data[String(guildId)] ??= {});
    const list = (entry.antinuke_exempt_user_ids ??= []);
    userId = String(userId);
    if (list.includes(userId)) return false;
    list.push(userId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function removeAntiNukeExemptUserId(guildId, userId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = data[String(guildId)];
    const list = entry?.antinuke_exempt_user_ids ?? [];
    userId = String(userId);
    if (!list.includes(userId)) return false;
    entry.antinuke_exempt_user_ids = list.filter((id) => id !== userId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function getAntiNukeExemptRoleIds(guildId) {
  return _entry(store.read(), guildId).antinuke_exempt_role_ids ?? [];
}
function addAntiNukeExemptRoleId(guildId, roleId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data[String(guildId)] ??= {});
    const list = (entry.antinuke_exempt_role_ids ??= []);
    roleId = String(roleId);
    if (list.includes(roleId)) return false;
    list.push(roleId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
function removeAntiNukeExemptRoleId(guildId, roleId) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = data[String(guildId)];
    const list = entry?.antinuke_exempt_role_ids ?? [];
    roleId = String(roleId);
    if (!list.includes(roleId)) return false;
    entry.antinuke_exempt_role_ids = list.filter((id) => id !== roleId);
    entry.updated_at = new Date().toISOString();
    write(data);
    return true;
  });
}
module.exports = {
  VALID_PUNISHMENTS,
  isEnabled,
  setEnabled,
  getLogChannelId,
  setLogChannelId,
  incrementGlobalBanCount,
  getGlobalBanCount,
  getPunishment,
  setPunishment,
  getHoneypotChannelId,
  setHoneypotChannelId,
  getHoneypotPunishment,
  setHoneypotPunishment,
  getGlobalBlacklistEnabled,
  setGlobalBlacklistEnabled,
  getReviewMode,
  setReviewMode,
  getThreshold,
  setThreshold,
  getExemptUserIds,
  addExemptUserId,
  removeExemptUserId,
  getExemptRoleIds,
  addExemptRoleId,
  removeExemptRoleId,
  getIgnoredChannelIds,
  addIgnoredChannelId,
  removeIgnoredChannelId,
  getAntiNukeEnabled,
  setAntiNukeEnabled,
  getAntiNukeThreshold,
  setAntiNukeThreshold,
  getAntiNukeWindowSeconds,
  setAntiNukeWindowSeconds,
  getAntiNukePunishment,
  setAntiNukePunishment,
  getAntiNukeExemptUserIds,
  addAntiNukeExemptUserId,
  removeAntiNukeExemptUserId,
  getAntiNukeExemptRoleIds,
  addAntiNukeExemptRoleId,
  removeAntiNukeExemptRoleId,
};
