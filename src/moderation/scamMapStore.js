'use strict';
const path = require('path');
const { DATA_DIR } = require('../constants');
const { createStore } = require('./jsonStore');
const store = createStore(path.join(DATA_DIR, 'scam_map.json'));
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_RETAINED = 371;
function _dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}
function recordCatch(guildId, at = Date.now()) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = (data[String(guildId)] ??= { days: {} });
    entry.days[_dayKey(at)] = (entry.days[_dayKey(at)] ?? 0) + 1;
    const cutoff = at - DAYS_RETAINED * DAY_MS;
    for (const key of Object.keys(entry.days)) {
      if (new Date(`${key}T00:00:00Z`).getTime() < cutoff) delete entry.days[key];
    }
    write(data);
  });
}
function getCounts(guildId) {
  return store.read()[String(guildId)]?.days ?? {};
}
function getTotal(guildId) {
  return Object.values(getCounts(guildId)).reduce((sum, c) => sum + c, 0);
}
module.exports = { recordCatch, getCounts, getTotal };
