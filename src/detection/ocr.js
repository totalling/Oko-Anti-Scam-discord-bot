'use strict';
const { spawn } = require('child_process');
const { getLogger } = require('../logger');
const logger = getLogger('ocr');
const OCR_TIMEOUT_MS = 30000;
function extractText(imageBytes, cfg) {
  return new Promise((resolve) => {
    const cmd = cfg.tesseractCmd || 'tesseract';
    let proc;
    try {
      proc = spawn(cmd, ['stdin', 'stdout', '-l', 'eng'], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch (err) {
      logger.warn(`Failed to spawn tesseract ("${cmd}"), OCR is disabled until this is fixed:`, err.message ?? err);
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
      logger.warn('tesseract timed out, killing process');
      try {
        proc.kill('SIGKILL');
      } catch {}
      done('');
    }, OCR_TIMEOUT_MS);
    proc.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
    });
    proc.on('error', (err) => {
      logger.warn(`tesseract process error ("${cmd}"), check TESSERACT_CMD is correct:`, err.message ?? err);
      done('');
    });
    proc.on('close', () => done(out));
    proc.stdin.on('error', (err) => {
      logger.warn('Failed to write image to tesseract stdin:', err.message ?? err);
      done('');
    });
    proc.stdin.write(imageBytes);
    proc.stdin.end();
  });
}
module.exports = { extractText };
