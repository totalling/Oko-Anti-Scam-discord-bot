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
};
