'use strict';
const path = require('path');
const { DATA_DIR } = require('../constants');
const { createStore } = require('./jsonStore');
const store = createStore(path.join(DATA_DIR, 'reported_messages.json'));
function isReported(messageId) {
  return Boolean(store.read()[String(messageId)]);
}
function markReported(messageId, { reporterId, guildId }) {
  return store.withLock((read, write) => {
    const data = read();
    data[String(messageId)] = {
      reporter_id: String(reporterId),
      guild_id: String(guildId),
      at: new Date().toISOString(),
    };
    write(data);
  });
}
module.exports = { isReported, markReported };
