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
module.exports = { getEntry, add };
