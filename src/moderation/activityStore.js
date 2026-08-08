'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../constants');
const FILE_PATH = path.join(DATA_DIR, 'activity.json');
const HOUR_MS = 60 * 60 * 1000;
const HOURS_TRACKED = 48;
const FLUSH_INTERVAL_MS = 15000;
function _load() {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch {
    return {};
  }
}
const _data = _load();
let _dirty = false;
function _flush() {
  if (!_dirty) return;
  _dirty = false;
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(_data, null, 2), 'utf8');
  } catch {
  }
}
setInterval(_flush, FLUSH_INTERVAL_MS).unref();
process.on('exit', _flush);
function _hourKey(ts) {
  return String(Math.floor(ts / HOUR_MS) * HOUR_MS);
}
function _guild(guildId) {
  return (_data[String(guildId)] ??= { users: {}, hourly: {}, channels: {}, total: 0 });
}
function _trimHourly(g, now) {
  const cutoff = now - HOURS_TRACKED * HOUR_MS;
  for (const key of Object.keys(g.hourly)) {
    if (Number(key) < cutoff) delete g.hourly[key];
  }
}
function recordMessage(guildId, userId, channelId) {
  const now = Date.now();
  const g = _guild(guildId);
  g.users[String(userId)] = (g.users[String(userId)] ?? 0) + 1;
  g.channels[String(channelId)] = (g.channels[String(channelId)] ?? 0) + 1;
  g.hourly[_hourKey(now)] = (g.hourly[_hourKey(now)] ?? 0) + 1;
  g.total += 1;
  _trimHourly(g, now);
  _dirty = true;
}
function getHourlyBuckets(guildId, hours = 24) {
  const now = Date.now();
  const g = _guild(guildId);
  const buckets = [];
  const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  for (let i = hours - 1; i >= 0; i--) {
    const hourStart = currentHourStart - i * HOUR_MS;
    buckets.push({ hourStart, count: g.hourly[String(hourStart)] ?? 0 });
  }
  return buckets;
}
function getTotal(guildId) {
  return _guild(guildId).total;
}
function getTopUsers(guildId, limit = 5) {
  const g = _guild(guildId);
  return Object.entries(g.users)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId, count]) => ({ userId, count }));
}
module.exports = { recordMessage, getHourlyBuckets, getTotal, getTopUsers };
