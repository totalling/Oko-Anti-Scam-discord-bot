'use strict';
const path = require('path');
const { DATA_DIR } = require('../constants');
const { createStore } = require('./jsonStore');
const store = createStore(path.join(DATA_DIR, 'pending_reviews.json'));
function saveReview(logMessageId, record) {
  return store.withLock((read, write) => {
    const data = read();
    data[String(logMessageId)] = {
      guild_id: record.guildId,
      author_id: record.authorId,
      confidence: record.confidence,
      reasons: record.reasons ?? [],
      content: record.content ?? '',
      image_hashes: record.imageHashes ?? [],
      resolved: record.resolved ?? false,
    };
    write(data);
  });
}
function getReview(logMessageId) {
  const data = store.read()[String(logMessageId)];
  if (!data) return null;
  return {
    guildId: data.guild_id,
    authorId: data.author_id,
    confidence: data.confidence,
    reasons: data.reasons ?? [],
    content: data.content ?? '',
    imageHashes: data.image_hashes ?? [],
    resolved: data.resolved ?? false,
  };
}
function setResolved(logMessageId, verdict) {
  return store.withLock((read, write) => {
    const data = read();
    const entry = data[String(logMessageId)];
    if (entry) {
      entry.resolved = true;
      entry.verdict = verdict;
      write(data);
    }
  });
}
module.exports = { saveReview, getReview, setResolved };
