'use strict';
const path = require('path');
const DATA_DIR = path.resolve(__dirname, '..', 'data');
module.exports = {
  DATA_DIR,
  OKO_GUILD_ID: '1520496020503658588',
  WELCOME_CHANNEL_ID: '1520804536011456652',
  ANNOUNCEMENTS_CHANNEL_ID: '1520804501257322566',
  UPDATES_CHANNEL_ID: '1520804520328691802',
  REPORT_SCAMS_CHANNEL_ID: '1523065585917755442',
  PUBLIC_GATE_CHANNEL_ID: '1523069898119446538',
  ACCENT_COLOR: 0x2b2d31,
  INVITE_URL:
    'https://discord.com/oauth2/authorize' +
    '?client_id=1523055385190207709&permissions=8&integration_type=0&scope=bot+applications.commands',
  BOT_AVATAR_EMOJI: '<:2c5cdb61411e80788732456a0cd8212a:1527058448125267968>',
  EMOJI: {
    website: '<:website:1534672475101597746>',
    refresh: '<:refresh:1534672355987689502>',
    preview: '<:preview:1534672293823778948>',
    moderation: '<:moderation:1534672255500681398>',
    report: '<:report:1534672204489425027>',
    statusOnline: '<:online:1535037884720218142>',
    statusIdle: '<:idle:1535037900360523989>',
    statusDnd: '<:dnd:1535037923181858816>',
    statusStreaming: '<:streaming:1535037868307775648>',
    statusOffline: '<:offline:1535037946669830154>',
  },
  DEVELOPER_URL: 'https://discord.com/users/1026824982329839707',
  SUPPORT_SERVER_URL: 'https://discord.gg/zsNhVNAXkP',
  HONEYPOT_CHANNEL_NAME: 'dont-type-here',
};
