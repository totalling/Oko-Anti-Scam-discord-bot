'use strict';
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const rootEnv = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
dotenv.config();
function _float(name, def) {
  const val = process.env[name];
  return val ? parseFloat(val) : def;
}
function _int(name, def) {
  const val = process.env[name];
  return val ? parseInt(val, 10) : def;
}
function loadConfig() {
  const token = process.env.DISCORD_TOKEN || '';
  if (!token) {
    throw new Error('DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  }
  return Object.freeze({
    discordToken: token,
    tesseractCmd: process.env.TESSERACT_CMD || '',
    heuristicAutoScamScore: _float('HEURISTIC_AUTO_SCAM_SCORE', 0.6),
    confidenceBanThreshold: _float('CONFIDENCE_BAN_THRESHOLD', 0.6),
    hashDistanceThreshold: _int('HASH_DISTANCE_THRESHOLD', 8),
  });
}
module.exports = { loadConfig };
