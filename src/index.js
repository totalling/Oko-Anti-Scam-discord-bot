'use strict';
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const { loadConfig } = require('./config');
const { collectCommands } = require('./commands');
const { syncCommands } = require('./deploy');
const { getLogger } = require('./logger');
const { onMessageCreate } = require('./events/messageCreate');
const { onGuildMemberAdd } = require('./events/guildMemberAdd');
const { onGuildCreate } = require('./events/guildCreate');
const { onInteractionCreate } = require('./events/interactionCreate');
const logger = getLogger('scam_bot');
function main() {
  const cfg = loadConfig();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });
  const commandList = collectCommands();
  const commands = new Map(commandList.map((c) => [c.data.name, c]));
  async function updatePresence() {
    const count = client.guilds.cache.size;
    const label = `${count} server${count !== 1 ? 's' : ''} for scams`;
    client.user.setActivity({ name: label, type: ActivityType.Watching });
  }
  const ctx = { client, cfg, commands, updatePresence };
  const guard = (scope) => (err) => logger.error(`Unhandled error in ${scope}:`, err);
  client.once(Events.ClientReady, async () => {
    logger.info(`Logged in as ${client.user.tag} (id=${client.user.id})`);
    await updatePresence();
    try {
      const commandJson = commandList.map((c) => c.data.toJSON());
      await syncCommands(cfg.discordToken, client.application.id, commandJson);
    } catch (err) {
      logger.error('Failed to sync application commands:', err);
    }
  });
  client.on(Events.MessageCreate, (message) => onMessageCreate(message, ctx).catch(guard('messageCreate')));
  client.on(Events.GuildMemberAdd, (member) => onGuildMemberAdd(member, ctx).catch(guard('guildMemberAdd')));
  client.on(Events.GuildCreate, (guild) => onGuildCreate(guild, ctx).catch(guard('guildCreate')));
  client.on(Events.GuildDelete, () => updatePresence().catch(guard('guildDelete')));
  client.on(Events.InteractionCreate, (interaction) => onInteractionCreate(interaction, ctx));
  process.on('unhandledRejection', (err) => logger.error('unhandledRejection:', err));
  client.login(cfg.discordToken);
}
main();
