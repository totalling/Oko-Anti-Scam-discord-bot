'use strict';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const C = { reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const LEVEL_STYLE = {
  debug: { tag: 'DBG', color: C.gray },
  info: { tag: 'INF', color: C.green },
  warn: { tag: 'WRN', color: C.yellow },
  error: { tag: 'ERR', color: C.red },
};
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
function paint(color, text) {
  return useColor ? color + text + C.reset : text;
}
function log(level, scope, args) {
  if (LEVELS[level] < minLevel) return;
  const time = new Date().toTimeString().slice(0, 8);
  const { tag, color } = LEVEL_STYLE[level];
  const prefix = paint(C.dim, time) + ' ' + paint(color, tag) + ' ' + paint(C.cyan, scope);
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}
function getLogger(scope) {
  return {
    debug: (...args) => log('debug', scope, args),
    info: (...args) => log('info', scope, args),
    warn: (...args) => log('warn', scope, args),
    error: (...args) => log('error', scope, args),
  };
}
module.exports = { getLogger };
