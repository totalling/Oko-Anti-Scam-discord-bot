'use strict';
let _clientPromise = null;
function _getClient() {
  _clientPromise ??= import('../vendor/bouncer/index.js').then(({ createClient }) =>
    createClient({
      concurrency: 4,
      maxRetries: 3,
      timeoutMs: 15000,
    })
  );
  return _clientPromise;
}
async function fetchImageBytes(message) {
  const client = await _getClient();
  const images = [...message.attachments.values()].filter((a) =>
    (a.contentType || '').startsWith('image/')
  );
  const results = await Promise.all(
    images.map(async (attachment) => {
      try {
        const res = await client.fetch(attachment.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}
module.exports = { fetchImageBytes };
