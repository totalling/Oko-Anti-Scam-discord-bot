'use strict';
const path = require('path');
const { DATA_DIR } = require('../constants');
const { createStore } = require('./jsonStore');
const store = createStore(path.join(DATA_DIR, 'global_blacklist.json'));
function getEntry(userId) {
  return store.read()[String(userId)] ?? null;
}
function add(userId, { reason, sourceGuildId, confidence }) {
  return store.withLock((read, write) => {
    const data = read();
    data[String(userId)] = {
      reason,
      source_guild_id: sourceGuildId,
      confidence,
      added_at: new Date().toISOString(),
    };
    write(data);
  });
}
function remove(userId) {
  return store.withLock((read, write) => {
    const data = read();
    const key = String(userId);
    if (!(key in data)) return false;
    delete data[key];
    write(data);
    return true;
  });
}
function getRecent(limit = 10) {
  const data = store.read();
  return Object.entries(data)
    .map(([userId, entry]) => ({ userId, ...entry }))
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, limit);
}
module.exports = { getEntry, add, remove, getRecent };
