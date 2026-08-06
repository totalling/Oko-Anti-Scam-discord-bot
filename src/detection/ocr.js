'use strict';
const { spawn } = require('child_process');
const OCR_TIMEOUT_MS = 30000;
function extractText(imageBytes, cfg) {
  return new Promise((resolve) => {
    const cmd = cfg.tesseractCmd || 'tesseract';
    let proc;
    try {
      proc = spawn(cmd, ['stdin', 'stdout', '-l', 'eng'], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      resolve('');
      return;
    }
    let out = '';
    let settled = false;
    const done = (text) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(text);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
      done('');
    }, OCR_TIMEOUT_MS);
    proc.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
    });
    proc.on('error', () => done(''));
    proc.on('close', () => done(out));
    proc.stdin.on('error', () => done(''));
    proc.stdin.write(imageBytes);
    proc.stdin.end();
  });
}
module.exports = { extractText };
