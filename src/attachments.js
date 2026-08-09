'use strict';
const { getLogger } = require('./logger');
const logger = getLogger('attachments');
let _clientPromise = null;
function _getClient() {
  _clientPromise ??= import('../vendor/bouncer/index.js')
    .then(({ createClient }) =>
      createClient({
        concurrency: 4,
        maxRetries: 3,
        timeoutMs: 15000,
      })
    )
    .catch((err) => {
      logger.error('Failed to initialize fetch client, attachment downloads will fail until restart:', err);
      _clientPromise = null;
      throw err;
    });
  return _clientPromise;
}
async function fetchUrlBytes(url) {
  let client;
  try {
    client = await _getClient();
  } catch {
    return null;
  }
  try {
    const res = await client.fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn(`Failed to download ${url}:`, err.message ?? err);
    return null;
  }
}
async function fetchImageBytes(message) {
  const images = [...message.attachments.values()].filter((a) =>
    (a.contentType || '').startsWith('image/')
  );
  const results = await Promise.all(images.map((attachment) => fetchUrlBytes(attachment.url)));
  return results.filter(Boolean);
}
module.exports = { fetchImageBytes, fetchUrlBytes };
