'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../constants');
const FILES = {
  domain: path.join(DATA_DIR, 'scam_domains.txt'),
  name: path.join(DATA_DIR, 'watched_names.txt'),
};
function _readLines(kind) {
  try {
    return fs
      .readFileSync(FILES[kind], 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}
function list(kind) {
  return _readLines(kind);
}
function count(kind) {
  return _readLines(kind).length;
}
function has(kind, value) {
  const target = value.trim().toLowerCase();
  return _readLines(kind).some((line) => line.toLowerCase() === target);
}
function add(kind, value) {
  value = value.trim().toLowerCase();
  if (!value || has(kind, value)) return false;
  fs.appendFileSync(FILES[kind], `\n${value}`, 'utf8');
  return true;
}
function remove(kind, value) {
  value = value.trim().toLowerCase();
  const lines = fs.readFileSync(FILES[kind], 'utf8').split(/\r?\n/);
  const kept = lines.filter((line) => line.trim().toLowerCase() !== value);
  if (kept.length === lines.length) return false;
  fs.writeFileSync(FILES[kind], kept.join('\n') + '\n', 'utf8');
  return true;
}
function addMany(kind, values) {
  let added = 0;
  for (const value of values) {
    if (add(kind, value)) added++;
  }
  return added;
}
module.exports = { list, count, has, add, remove, addMany };
