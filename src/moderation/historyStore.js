'use strict';
const path = require('path');
const { DATA_DIR } = require('../constants');
const { createStore } = require('./jsonStore');
const scamMapStore = require('./scamMapStore');
const store = createStore(path.join(DATA_DIR, 'action_history.json'));
const MAX_ENTRIES_PER_USER = 10;
const MAP_TYPES = new Set(['detection', 'honeypot', 'global_blacklist']);
async function record(userId, entry) {
  await store.withLock((read, write) => {
    const data = read();
    const list = (data[String(userId)] ??= []);
    list.push({
      at: new Date().toISOString(),
      guild_id: entry.guildId ?? null,
      type: entry.type,
      detail: String(entry.detail ?? '').slice(0, 300),
      confidence: entry.confidence ?? null,
    });
    if (list.length > MAX_ENTRIES_PER_USER) {
      data[String(userId)] = list.slice(-MAX_ENTRIES_PER_USER);
    }
    write(data);
  });
  if (entry.guildId && MAP_TYPES.has(entry.type)) {
    await scamMapStore.recordCatch(entry.guildId);
  }
}
function getHistory(userId) {
  return store.read()[String(userId)] ?? [];
}
function getRecentForGuild(guildId, limit = 10) {
  const data = store.read();
  const entries = [];
  for (const [userId, list] of Object.entries(data)) {
    for (const entry of list) {
      if (String(entry.guild_id) === String(guildId)) {
        entries.push({ ...entry, userId });
      }
    }
  }
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return entries.slice(0, limit);
}
module.exports = { record, getHistory, getRecentForGuild };
