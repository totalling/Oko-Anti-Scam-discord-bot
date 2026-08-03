'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const { DATA_DIR } = require('./constants');
const { getLogger } = require('./logger');
const logger = getLogger('scam_bot.deploy');
const HASH_FILE = path.join(DATA_DIR, '.command-hash');
function _commandsHash(commandJson) {
  return crypto.createHash('sha256').update(JSON.stringify(commandJson)).digest('hex');
}
async function syncCommands(token, clientId, commandJson, { force = false } = {}) {
  const hash = _commandsHash(commandJson);
  let previous = null;
  try {
    previous = fs.readFileSync(HASH_FILE, 'utf8').trim();
  } catch {
  }
  if (!force && previous === hash) {
    logger.info(`Application commands unchanged (${commandJson.length}) — skipping registration, 0 API calls.`);
    return false;
  }
  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commandJson });
  fs.writeFileSync(HASH_FILE, hash + '\n', 'utf8');
  logger.info(`Registered ${commandJson.length} application command(s) (1 bulk PUT).`);
  return true;
}
module.exports = { syncCommands };
