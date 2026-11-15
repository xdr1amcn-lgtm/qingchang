// Scores measure similarity to the enrolled host, not audio volume.
// Keep a small ambiguity band below the host boundary; do not require
// other speakers to have near-zero similarity to the host.
function otherSpeakerThreshold(hostThreshold) {
  return Math.max(0, hostThreshold - 0.06);
}

function speakerFromScore(score, hostThreshold) {
  if (!Number.isFinite(score)) return 'uncertain';
  if (score >= hostThreshold) return 'streamer';
  if (score <= otherSpeakerThreshold(hostThreshold)) return 'hamster';
  return 'uncertain';
}

module.exports = { otherSpeakerThreshold, speakerFromScore };
