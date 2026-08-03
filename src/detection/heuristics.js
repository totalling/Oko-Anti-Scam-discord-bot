'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../constants');
const PHRASE_SIGNALS = [
  [/giveaway/i, 0.15, 'giveaway'],
  [/promo\s*code/i, 0.20, 'promo code'],
  [/bonus\s*code/i, 0.15, 'bonus code'],
  [/activate\s*(the\s*)?code/i, 0.20, 'activate code'],
  [/withdrawal\s*success/i, 0.30, 'withdrawal success'],
  [/withdraw\s*(your|the)?\s*bonus/i, 0.20, 'withdraw bonus'],
  [/post\s*will\s*be\s*deleted/i, 0.35, 'scarcity: post will be deleted'],
  [/only\s*the\s*fastest/i, 0.30, 'scarcity: only the fastest'],
  [/crypto(currency)?\s*casino/i, 0.25, 'crypto casino'],
  [/\$\s?\d{1,3}(,\d{3})*\s*(bonus|to everyone|for everyone)/i, 0.25, 'cash bonus to everyone'],
  [/follow\s*me\s*for\s*a\s*cookie/i, 0.20, 'impersonation bio phrase'],
  [/rakeback/i, 0.10, 'rakeback'],
  [/vip[\s-]?club/i, 0.05, 'vip club'],
  [/register(ing|s)?\s*(will\s*)?(get|receive)/i, 0.15, 'register to receive'],
];
const SUSPICIOUS_DOMAIN_PATTERNS = [
  [/\b[a-z]{3,8}win\.(?:com|net|org|io|bet|casino)\b/i, '*win.<tld> scam-pattern domain'],
];
const _lineCache = new Map();
const CACHE_TTL_MS = 2000;
function _loadLines(filename) {
  const filePath = path.join(DATA_DIR, filename);
  let ent = _lineCache.get(filePath);
  const now = Date.now();
  if (ent && now - ent.checkedAt < CACHE_TTL_MS) return ent.lines;
  let mtime = 0;
  try {
    mtime = fs.statSync(filePath).mtimeMs;
  } catch {
  }
  if (ent && mtime === ent.mtime) {
    ent.checkedAt = now;
    return ent.lines;
  }
  let lines = [];
  try {
    lines = fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
  }
  _lineCache.set(filePath, { lines, mtime, checkedAt: now });
  return lines;
}
function loadScamDomains() {
  return _loadLines('scam_domains.txt');
}
function loadWatchedNames() {
  return _loadLines('watched_names.txt');
}
function scoreText(text) {
  if (!text || !text.trim()) return { score: 0.0, reasons: [] };
  const lower = text.toLowerCase();
  let score = 0.0;
  const reasons = [];
  for (const [pattern, weight, label] of PHRASE_SIGNALS) {
    if (pattern.test(lower)) {
      score += weight;
      reasons.push(label);
    }
  }
  const scamDomains = loadScamDomains();
  const matchedDomain = scamDomains.find((d) => lower.includes(d));
  if (matchedDomain) {
    score += 0.5;
    reasons.push(`known scam domain: ${matchedDomain}`);
  } else {
    for (const [pattern, label] of SUSPICIOUS_DOMAIN_PATTERNS) {
      const match = pattern.exec(lower);
      if (match) {
        score += 0.35;
        reasons.push(`${label}: ${match[0]}`);
        break;
      }
    }
  }
  const watchedNames = loadWatchedNames();
  const matchedName = watchedNames.find((n) => lower.includes(n));
  if (matchedName && reasons.length > 0) {
    score += 0.3;
    reasons.push(`impersonates watched name: ${matchedName}`);
  }
  return { score: Math.min(score, 1.0), reasons };
}
module.exports = { scoreText, loadScamDomains, loadWatchedNames };
