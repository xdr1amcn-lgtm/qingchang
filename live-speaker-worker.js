const fs = require('node:fs');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const sherpa = require('sherpa-onnx-node');
const { createHash } = require('node:crypto');
const { otherSpeakerThreshold, speakerFromScore } = require('./live-speaker-policy');

const modelId = createHash('sha256').update(fs.readFileSync(workerData.modelPath)).digest('hex');
const extractor = new sherpa.SpeakerEmbeddingExtractor({ model: workerData.modelPath, numThreads: 2, debug: false });
let profile = { version: 5, modelId, sampleRate: 16000, host: [], hostThreshold: 0.5, otherThreshold: 0.3, verified: false, sourceKey: '' };
let profileSource = '尚未录入主播';
try {
  const saved = JSON.parse(fs.readFileSync(workerData.calibrationPath, 'utf8'));
  if (saved.version >= 5 && saved.modelId === modelId && saved.sampleRate === profile.sampleRate &&
      Number.isFinite(saved.hostThreshold) && Number.isFinite(saved.otherThreshold) &&
      saved.hostThreshold > saved.otherThreshold && Array.isArray(saved.host) && saved.host.length >= 3 &&
      saved.host.every((vector) => vector.length === extractor.dim && vector.every(Number.isFinite))) {
    profile = saved;
    profileSource = '当前音源的主播声纹';
  } else profileSource = '旧版校准需要重新录入';
} catch (_error) {}
// Apply the revised policy to saved 0.4.0 profiles too, without changing
// enrollment vectors, verification state or the host boundary.
profile.otherThreshold = otherSpeakerThreshold(profile.hostThreshold);
const vad = new sherpa.Vad({
  sileroVad: { model: workerData.vadPath, threshold: 0.5, minSilenceDuration: 0.15,
    minSpeechDuration: 0.2, windowSize: 512, maxSpeechDuration: 6 },
  sampleRate: 16000, numThreads: 1, provider: 'cpu', debug: false
}, 10);

function speechSamples(samples) {
  vad.reset();
  for (let start = 0; start < samples.length; start += 512) {
    const frame = new Float32Array(512);
    frame.set(samples.subarray(start, start + 512));
    vad.acceptWaveform(frame);
  }
  for (let i = 0; i < 10; i += 1) vad.acceptWaveform(new Float32Array(512));
  vad.flush();
  const parts = [];
  let length = 0, speechEnd = 0;
  while (!vad.isEmpty()) {
    const segment = vad.front(false);
    const start = Math.max(0, segment.start);
    const end = Math.min(samples.length, segment.start + segment.samples.length);
    if (end > start) {
      parts.push(samples.subarray(start, end));
      length += end - start;
      speechEnd = Math.max(speechEnd, end / 16000);
    }
    vad.pop();
  }
  const speech = new Float32Array(length);
  let offset = 0;
  for (const part of parts) { speech.set(part, offset); offset += part.length; }
  return { speech, speechEnd, voice: length >= 3200 };
}

function embedding(samples) {
  const stream = extractor.createStream();
  stream.acceptWaveform({ sampleRate: 16000, samples });
  const vector = Array.from(extractor.compute(stream, false));
  if (!vector.every(Number.isFinite)) throw new Error('声纹特征无效，请检查声音来源');
  return vector;
}

function profileStatus(sourceKey) {
  const sourceMatches = profile.sourceKey === sourceKey;
  return { profileSource, engine: '3D-Speaker CAM++ 中文声纹', calibrated: profile.host.length >= 3,
    verified: profile.verified === true && sourceMatches, sourceMatches,
    hostThreshold: profile.hostThreshold, otherThreshold: profile.otherThreshold };
}

function saveProfile(next) {
  fs.mkdirSync(path.dirname(workerData.calibrationPath), { recursive: true });
  const temporaryPath = `${workerData.calibrationPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next)}\n`);
  fs.renameSync(temporaryPath, workerData.calibrationPath);
  profile = next;
}

function scoreVector(vector) {
  const scores = profile.host.map((reference) => similarity(vector, reference)).sort((a, b) => a - b);
  return scores[Math.floor(scores.length / 2)];
}

function similarity(first, second) {
  let dot = 0;
  let firstPower = 0;
  let secondPower = 0;
  for (let i = 0; i < first.length; i += 1) {
    dot += first[i] * second[i];
    firstPower += first[i] * first[i];
    secondPower += second[i] * second[i];
  }
  return dot / Math.sqrt(firstPower * secondPower);
}

function classify(samples, sourceKey) {
  const { speech, speechEnd, voice } = speechSamples(samples);
  const details = { voice, speechEnd, ...profileStatus(sourceKey) };
  if (!voice) return { ...details, speaker: 'idle', score: 0 };
  if (!details.verified) return { ...details, speaker: 'uncertain', score: 0,
    reason: !details.sourceMatches && details.calibrated ? '声音来源已改变，请在当前来源重新录入并验证主播' : '请先完成主播录入和6秒验证，暂不分配角色' };
  if (speech.length < 19200) return { ...details, speaker: 'uncertain', score: 0, reason: '人声片段太短，继续收集中' };
  const vector = embedding(speech);
  const score = scoreVector(vector);
  const speaker = speakerFromScore(score, profile.hostThreshold);
  return { ...details, speaker, score: Number(score.toFixed(3)) };
}

function calibrate(windows, sourceKey) {
  const host = windows.map((samples, index) => {
    if (!(samples instanceof Float32Array) || samples.length !== 48000) throw new Error('Invalid calibration window');
    const { speech } = speechSamples(samples);
    if (speech.length < 12800) throw new Error(`第 ${index + 1} 段有效人声不足，请单独连续说话后重试`);
    return embedding(speech).map((value) => Number(value.toFixed(6)));
  });
  const pairScores = [];
  for (let i = 0; i < host.length; i += 1) {
    for (let j = i + 1; j < host.length; j += 1) pairScores.push(similarity(host[i], host[j]));
  }
  pairScores.sort((a, b) => a - b);
  const consistency = pairScores[Math.floor(pairScores.length / 2)];
  if (!Number.isFinite(consistency) || consistency < 0.42) throw new Error('录音里声音不一致，请确保只有主播说话后重试');
  // Validate each sample against the other samples, not against itself.
  const validation = host.map((vector, index) => {
    const scores = host.filter((_, i) => i !== index).map((other) => similarity(vector, other)).sort((a, b) => a - b);
    return scores[Math.floor(scores.length / 2)];
  });
  const weakest = Math.min(...validation);
  if (weakest < 0.42) throw new Error('部分录音无法稳定匹配主播，请排除其他人声后重试');
  const hostThreshold = Math.max(0.38, Math.min(0.62, weakest - 0.08));
  const nextProfile = { ...profile, version: 5, modelId, sourceKey, verified: false, hostThreshold,
    otherThreshold: otherSpeakerThreshold(hostThreshold), host };
  saveProfile(nextProfile);
  profileSource = '当前音源的主播声纹';
  return { ...profileStatus(sourceKey), consistency: Number(consistency.toFixed(3)) };
}

function verify(windows, sourceKey) {
  if (!profile.host.length || profile.sourceKey !== sourceKey) throw new Error('请先在当前音源录入主播');
  const scores = windows.map((samples) => {
    if (!(samples instanceof Float32Array) || samples.length !== 48000) throw new Error('Invalid verification window');
    const { speech } = speechSamples(samples);
    if (speech.length < 19200) throw new Error('验证录音人声不足，请持续说话');
    return scoreVector(embedding(speech));
  });
  const verified = scores.every((score) => Number.isFinite(score) && score >= profile.hostThreshold);
  saveProfile({ ...profile, verified });
  return { ...profileStatus(sourceKey), scores: scores.map((score) => Number(score.toFixed(3))) };
}

parentPort.on('message', ({ id, type, samples, windows, sourceKey = '' }) => {
  try {
    if (type === 'status') { parentPort.postMessage({ id, ...profileStatus(sourceKey) }); return; }
    if (type === 'verify') {
      if (!Array.isArray(windows) || windows.length !== 2) throw new Error('Invalid verification input');
      parentPort.postMessage({ id, ...verify(windows, sourceKey) }); return;
    }
    if (type === 'calibrate') {
      if (!Array.isArray(windows) || windows.length !== 5) throw new Error('Invalid calibration input');
      parentPort.postMessage({ id, ...calibrate(windows, sourceKey) });
      return;
    }
    if (!(samples instanceof Float32Array) || samples.length < 32000 || samples.length > 64000) {
      throw new Error('Invalid audio window');
    }
    parentPort.postMessage({ id, ...classify(samples, sourceKey) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});

parentPort.postMessage({ ready: true });
