'use strict';
const fs = require('fs');
const CACHE_TTL_MS = 2000;
function createStore(filePath) {
  let lock = Promise.resolve();
  let cache = null;
  let cachedMtime = 0;
  let lastCheck = 0;
  function read() {
    const now = Date.now();
    if (cache !== null && now - lastCheck < CACHE_TTL_MS) return cache;
    lastCheck = now;
    let mtime = 0;
    try {
      mtime = fs.statSync(filePath).mtimeMs;
    } catch {
    }
    if (cache !== null && mtime === cachedMtime) return cache;
    try {
      cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      cache = {};
    }
    cachedMtime = mtime;
    return cache;
  }
  function write(data) {
    cache = data;
    const text = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, text, 'utf8');
    try {
      cachedMtime = fs.statSync(filePath).mtimeMs;
    } catch {
    }
  }
  function withLock(fn) {
    const run = lock.then(() => fn(read, write));
    lock = run.catch(() => {});
    return run;
  }
  return { read, withLock };
}
module.exports = { createStore };
