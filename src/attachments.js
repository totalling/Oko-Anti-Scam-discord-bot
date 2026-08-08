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
async function fetchUrlBytes(url) {
  const client = await _getClient();
  try {
    const res = await client.fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch {
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
