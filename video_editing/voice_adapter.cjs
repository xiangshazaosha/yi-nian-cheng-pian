// Receive immutable original-source ASR data. This adapter is not an ASR model.
const fs = require('node:fs');
const path = require('node:path');
const { parseSrt } = require('../scripts/editing/subtitles.cjs');
const { ROOT, repoPath, digest, json, fileHash, relative, mediaProbe, writeNew, args } = require('./common.cjs');
function inbox(name, root = ROOT) {
  if (typeof name !== 'string' || !name || /[<>:"/\\|?*\u0000-\u001f]/u.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) throw new Error('Invalid source filename');
  return repoPath(root, `asr-inbox/${name}`);
}
function checkCues(bytes, duration) {
  const cues = parseSrt(bytes);
  if (cues.some(c => c.endMs / 1000 > duration + 0.05)) throw new Error('SRT exceeds the original source duration');
  return cues;
}
async function initialize(source, root = ROOT) {
  const name = path.basename(source); const dir = inbox(name, root);
  const sourceSha256 = await fileHash(source); const media = mediaProbe(source);
  if (!media.hasAudio) throw new Error('Source has no audio');
  if (fs.existsSync(path.join(dir, 'source.json'))) {
    const old = json(path.join(dir, 'source.json'));
    if (old.sourceSha256 !== sourceSha256) throw new Error('Same filename, different source; refusing to reuse its transcript');
    if (await fileHash(repoPath(root, old.source)) !== sourceSha256) throw new Error('Registered source changed');
    return old;
  }
  // A stable repository-local copy, never a move or modification of the original.
  const stored = repoPath(root, `remotion-clone/public/editing-sources/${name}/${name}`);
  fs.mkdirSync(path.dirname(stored), { recursive: true });
  if (fs.existsSync(stored)) {
    if (await fileHash(stored) !== sourceSha256) throw new Error('Stored source collision');
  } else {
    fs.copyFileSync(source, stored, fs.constants.COPYFILE_EXCL);
    if (await fileHash(stored) !== sourceSha256) throw new Error('Source changed during copy');
  }
  fs.mkdirSync(dir, { recursive: true });
  const metadata = { sourceName: name, source: relative(stored, root), sourceSha256, ...media };
  writeNew(path.join(dir, 'source.json'), metadata);
  return metadata;
}
async function accept(name, srt, { fullSource, words, root = ROOT } = {}) {
  if (!fullSource) throw new Error('Explicit full-source export declaration required');
  const dir = inbox(name, root); const metadata = json(path.join(dir, 'source.json'));
  if (await fileHash(repoPath(root, metadata.source)) !== metadata.sourceSha256) throw new Error('Source identity changed');
  const bytes = fs.readFileSync(srt); const cues = checkCues(bytes, metadata.duration);
  const items = [['original.srt', bytes]];
  if (words) {
    const raw = fs.readFileSync(words); JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
    items.push(['words.raw.json', raw]);
  }
  const receipt = { sourceSha256: metadata.sourceSha256, originalSha256: digest(bytes),
    exportScope: 'declared-full-source', timelineOriginSeconds: 0, cueCount: cues.length,
    wordTimingStatus: words ? 'pending-format-and-audio-verification' : 'not-provided',
    wordsSha256: words ? digest(items[1][1]) : null,
    contentVerified: false, readyForPackaging: false };
  items.push(['receipt.json', JSON.stringify(receipt, null, 2) + '\n']);
  for (const [n] of items) if (fs.existsSync(path.join(dir, n))) throw new Error(`Existing ${n}; preserve evidence rather than overwrite`);
  const created = [];
  try { for (const [n, v] of items) { const p = path.join(dir, n); writeNew(p, v); created.push(p); } }
  catch (e) { for (const p of created) fs.unlinkSync(p); throw e; }
  return receipt;
}
async function inspect(name, root = ROOT) {
  const dir = inbox(name, root); const metadata = json(path.join(dir, 'source.json'));
  if (await fileHash(repoPath(root, metadata.source)) !== metadata.sourceSha256) throw new Error('Source changed');
  if (!fs.existsSync(path.join(dir, 'receipt.json'))) return { status: 'waiting-for-chatcut-export', source: metadata.source };
  const receipt = json(path.join(dir, 'receipt.json')); const bytes = fs.readFileSync(path.join(dir, 'original.srt'));
  if (receipt.sourceSha256 !== metadata.sourceSha256 || receipt.originalSha256 !== digest(bytes)) throw new Error('ASR receipt does not match source/SRT');
  if (receipt.wordsSha256 && receipt.wordsSha256 !== await fileHash(path.join(dir, 'words.raw.json'))) throw new Error('Raw word JSON changed');
  const cues = checkCues(bytes, metadata.duration);
  return { status: 'source-time-srt-imported', source: metadata.source, cueCount: cues.length,
    firstCaptionSeconds: cues[0].startMs / 1000, lastCaptionSeconds: cues.at(-1).endMs / 1000,
    ...receipt, note: 'Time bounds do not prove transcription completeness; verify head/middle/tail and actual speech.' };
}
async function main(argv) {
  const [cmd, ...rest] = argv; const a = args(rest);
  const allowed = cmd === 'init' ? ['source'] : cmd === 'accept' ? ['name', 'srt', 'words', 'full-source'] : ['name'];
  if (Object.keys(a).some(k => !allowed.includes(k))) throw new Error('Unknown argument');
  if (cmd === 'init' && typeof a.source === 'string') return initialize(a.source);
  if (cmd === 'accept' && typeof a.name === 'string' && typeof a.srt === 'string') return accept(a.name, a.srt, { fullSource: a['full-source'] === true, words: a.words });
  if (cmd === 'check' && typeof a.name === 'string') return inspect(a.name);
  throw new Error('Usage: voice_adapter.cjs init --source PATH | accept --name FILENAME --srt PATH --full-source [--words PATH] | check --name FILENAME');
}
if (require.main === module) main(process.argv.slice(2)).then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { inbox, checkCues, initialize, accept, inspect };
