'use strict';
const scam = require('./scam');
const invite = require('./invite');
const support = require('./support');
const botinfo = require('./botinfo');
const markAsScam = require('./markAsScam');
function collectCommands() {
  return [scam, invite, support, botinfo, markAsScam];
}
module.exports = { collectCommands };
