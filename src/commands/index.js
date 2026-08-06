'use strict';
const scam = require('./scam');
const scamlists = require('./scamlists');
const invite = require('./invite');
const support = require('./support');
const botinfo = require('./botinfo');
const markAsScam = require('./markAsScam');
const reportScam = require('./reportScam');
const whois = require('./whois');
function collectCommands() {
  return [scam, scamlists, invite, support, botinfo, markAsScam, reportScam, whois];
}
module.exports = { collectCommands };
