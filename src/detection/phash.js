'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { DATA_DIR } = require('../constants');
const { getLogger } = require('../logger');
const logger = getLogger('scam_bot.phash');
const HASH_STORE_PATH = path.join(DATA_DIR, 'scam_hashes.json');
const HASH_SIZE = 8;
const HIGHFREQ_FACTOR = 4;
const IMG_SIZE = HASH_SIZE * HIGHFREQ_FACTOR; 
let _lock = Promise.resolve();
function withLock(fn) {
  const run = _lock.then(fn);
  _lock = run.catch(() => {});
  return run;
}
const COS_TABLE = [];
for (let k = 0; k < IMG_SIZE; k++) {
  const row = new Float64Array(IMG_SIZE);
  for (let n = 0; n < IMG_SIZE; n++) {
    row[n] = Math.cos((Math.PI * k * (2 * n + 1)) / (2 * IMG_SIZE));
  }
  COS_TABLE.push(row);
}
function dct2d(pixels) {
  const tmp = new Float64Array(IMG_SIZE * IMG_SIZE);
  const out = new Float64Array(IMG_SIZE * IMG_SIZE);
  for (let r = 0; r < IMG_SIZE; r++) {
    for (let k = 0; k < IMG_SIZE; k++) {
      let sum = 0;
      const cos = COS_TABLE[k];
      const base = r * IMG_SIZE;
      for (let n = 0; n < IMG_SIZE; n++) sum += pixels[base + n] * cos[n];
      tmp[base + k] = sum;
    }
  }
  for (let c = 0; c < IMG_SIZE; c++) {
    for (let k = 0; k < IMG_SIZE; k++) {
      let sum = 0;
      const cos = COS_TABLE[k];
      for (let n = 0; n < IMG_SIZE; n++) sum += tmp[n * IMG_SIZE + c] * cos[n];
      out[k * IMG_SIZE + c] = sum;
    }
  }
  return out;
}
function median(values) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function bitsToHex(bits) {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}
function hammingDistance(hexA, hexB) {
  let x = BigInt('0x' + hexA) ^ BigInt('0x' + hexB);
  let dist = 0;
  while (x) {
    x &= x - 1n;
    dist++;
  }
  return dist;
}
async function computePhash(imageBytes) {
  try {
    const decoded = await sharp(imageBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data: src, info } = decoded;
    const pixelCount = info.width * info.height;
    const gray = Buffer.alloc(pixelCount);
    if (info.channels === 1) {
      src.copy(gray);
    } else {
      for (let p = 0; p < pixelCount; p++) {
        gray[p] = Math.floor((src[p * 3] * 299 + src[p * 3 + 1] * 587 + src[p * 3 + 2] * 114) / 1000);
      }
    }
    const resized = await sharp(gray, { raw: { width: info.width, height: info.height, channels: 1 } })
      .resize(IMG_SIZE, IMG_SIZE, { kernel: 'lanczos3', fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info: rinfo } = resized;
    const pixels = new Float64Array(IMG_SIZE * IMG_SIZE);
    for (let i = 0; i < pixels.length; i++) pixels[i] = data[i * rinfo.channels];
    const dct = dct2d(pixels);
    const lowfreq = new Float64Array(HASH_SIZE * HASH_SIZE);
    for (let r = 0; r < HASH_SIZE; r++) {
      for (let c = 0; c < HASH_SIZE; c++) {
        lowfreq[r * HASH_SIZE + c] = dct[r * IMG_SIZE + c];
      }
    }
    const med = median(lowfreq);
    const bits = new Array(HASH_SIZE * HASH_SIZE);
    for (let i = 0; i < lowfreq.length; i++) bits[i] = lowfreq[i] > med ? 1 : 0;
    return bitsToHex(bits);
  } catch (err) {
    logger.warn(`phash failed: ${err.message}`);
    return null;
  }
}
const CACHE_TTL_MS = 2000;
let _storeCache = null;
let _storeMtime = 0;
let _storeLastCheck = 0;
function readStore() {
  const now = Date.now();
  if (_storeCache !== null && now - _storeLastCheck < CACHE_TTL_MS) return _storeCache;
  _storeLastCheck = now;
  let mtime = 0;
  try {
    mtime = fs.statSync(HASH_STORE_PATH).mtimeMs;
  } catch {
  }
  if (_storeCache !== null && mtime === _storeMtime) return _storeCache;
  try {
    _storeCache = JSON.parse(fs.readFileSync(HASH_STORE_PATH, 'utf8'));
  } catch {
    _storeCache = {};
  }
  _storeMtime = mtime;
  return _storeCache;
}
function writeStore(data) {
  _storeCache = data;
  fs.writeFileSync(HASH_STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  try {
    _storeMtime = fs.statSync(HASH_STORE_PATH).mtimeMs;
  } catch {
  }
}
function findClosestMatch(hashHex, maxDistance) {
  const store = readStore();
  const keys = Object.keys(store);
  if (keys.length === 0) return null;
  let best = null;
  for (const knownHex of keys) {
    const distance = hammingDistance(hashHex, knownHex);
    if (distance <= maxDistance && (best === null || distance < best.distance)) {
      best = { hashHex: knownHex, distance, source: store[knownHex].source || 'unknown' };
    }
  }
  return best;
}
function addHash(hashHex, source, addedBy) {
  return withLock(() => {
    const store = readStore();
    store[hashHex] = {
      source,
      added_by: addedBy,
      added_at: new Date().toISOString(),
    };
    writeStore(store);
  });
}
function removeHash(hashHex) {
  return withLock(() => {
    const store = readStore();
    if (hashHex in store) {
      delete store[hashHex];
      writeStore(store);
      return true;
    }
    return false;
  });
}
module.exports = { computePhash, findClosestMatch, addHash, removeHash, readStore, hammingDistance };
