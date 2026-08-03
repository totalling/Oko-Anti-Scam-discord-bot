'use strict';
const { REST, Routes } = require('discord.js');
const { loadConfig } = require('./config');
const { collectCommands } = require('./commands');
const { syncCommands } = require('./deploy');
const { getLogger } = require('./logger');
const logger = getLogger('scam_bot.deploy');
async function main() {
  const cfg = loadConfig();
  const commands = collectCommands().map((c) => c.data.toJSON());
  const rest = new REST().setToken(cfg.discordToken);
  const app = await rest.get(Routes.currentApplication());
  await syncCommands(cfg.discordToken, app.id, commands, { force: true });
}
main().catch((err) => {
  logger.error(err);
  process.exitCode = 1;
});
