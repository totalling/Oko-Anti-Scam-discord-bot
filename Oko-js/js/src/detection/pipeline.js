'use strict';
const heuristics = require('./heuristics');
const ocr = require('./ocr');
const phashStore = require('./phash');
async function scan(text, imageBytesList, cfg) {
  const reasons = [];
  let hashMatched = false;
  let hashConfidence = 0.0;
  const imageHashes = [];
  const ocrTextParts = [];
  for (const imageBytes of imageBytesList) {
    const phashHex = await phashStore.computePhash(imageBytes);
    let matched = false;
    if (phashHex) {
      imageHashes.push(phashHex);
      const match = phashStore.findClosestMatch(phashHex, cfg.hashDistanceThreshold);
      if (match) {
        matched = true;
        hashMatched = true;
        const closeness = 1 - match.distance / Math.max(cfg.hashDistanceThreshold, 1);
        hashConfidence = Math.max(hashConfidence, 0.85 + 0.15 * closeness);
        reasons.push(`matches known scam image (distance=${match.distance}, source=${match.source})`);
      }
    }
    if (matched) continue;
    const extracted = await ocr.extractText(imageBytes, cfg);
    if (extracted.trim()) {
      ocrTextParts.push(extracted);
    }
  }
  const combinedText = [text, ...ocrTextParts].join('\n');
  const heuristicResult = heuristics.scoreText(combinedText);
  reasons.push(...heuristicResult.reasons);
  const confidence = Math.max(hashConfidence, heuristicResult.score);
  const isScam = hashMatched || heuristicResult.score >= cfg.heuristicAutoScamScore;
  if (isScam && !hashMatched) {
    for (const phashHex of imageHashes) {
      await phashStore.addHash(phashHex, 'auto:heuristic', 'bot');
    }
  }
  return {
    isScam,
    confidence,
    reasons,
    hashMatched,
    imageHashes,
  };
}
module.exports = { scan };
