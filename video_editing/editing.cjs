// Public plan: source / cuts / broll only. Frame compilation stays executor-internal.
const fs = require('node:fs');
const path = require('node:path');
const { parseSrt, serializeSrt } = require('../scripts/editing/subtitles.cjs');
const { ROOT, repoPath, digest, json, fileHash, relative, mediaProbe, writeNew, args } = require('./common.cjs');
function shape(v, keys, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${name} must be an object`);
  for (const k of Object.keys(v)) if (!keys.includes(k)) throw new Error(`Unknown ${name} field: ${k}`);
}
function interval(v, limit, name) {
  if (![v.start, v.end].every(Number.isFinite) || v.start < 0 || v.end <= v.start || v.end > limit + 0.000001) throw new Error(`Invalid ${name} interval`);
  if (typeof v.reason !== 'string' || !v.reason.trim()) throw new Error(`${name} needs a reason`);
}
function compile(plan, media, bMedia = {}, root = ROOT) {
  shape(plan, ['source', 'cuts', 'broll'], 'plan'); repoPath(root, plan.source);
  if (!Array.isArray(plan.cuts) || !Array.isArray(plan.broll)) throw new Error('cuts and broll must be arrays');
  const { num, den } = media.fps;
  if (![num, den, media.frames].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid media metadata');
  const fps = num / den; const frame = t => Math.round(t * fps);
  const sourceDuration = media.frames / fps;
  const cuts = plan.cuts.map(c => {
    shape(c, ['start', 'end', 'reason'], 'cut'); interval(c, sourceDuration, 'cut');
    return { inFrame: frame(c.start), outFrame: frame(c.end), reason: c.reason };
  }).sort((a, b) => a.inFrame - b.inFrame);
  let cursor = 0; let at = 0; const clips = [];
  function keep(start, end) { if (end > start) { clips.push({ inFrame: start, outFrame: end, atFrame: at }); at += end - start; } }
  for (const c of cuts) {
    if (c.inFrame < cursor || c.outFrame <= c.inFrame || c.outFrame > media.frames) throw new Error('Cuts overlap or become empty/out-of-bounds after frame quantization');
    keep(cursor, c.inFrame); cursor = c.outFrame;
  }
  keep(cursor, media.frames);
  if (!at) throw new Error('Cannot remove the entire source');
  const broll = plan.broll.map(b => {
    shape(b, ['start', 'end', 'source', 'source_start', 'reason', 'burned_in_subtitles'], 'broll');
    interval(b, at / fps, 'broll'); repoPath(root, b.source);
    const m = bMedia[b.source];
    if (!m || m.fps.num * den !== num * m.fps.den) throw new Error('B-roll frame rate differs; explicit conformed media is required');
    if (b.burned_in_subtitles !== undefined && typeof b.burned_in_subtitles !== 'boolean') throw new Error('burned_in_subtitles must be boolean');
    const sourceStart = b.source_start === undefined ? 0 : b.source_start;
    if (!Number.isFinite(sourceStart) || sourceStart < 0) throw new Error('Invalid B-roll source_start');
    const start = frame(b.start); const end = frame(b.end); const input = frame(sourceStart);
    if (end <= start || end > at || input + end - start > m.frames) throw new Error('B-roll exceeds available source/edited timeline');
    return { source: b.source, inFrame: input, outFrame: input + end - start, atFrame: start,
      reason: b.reason, audio: 'muted', burnedInSubtitles: b.burned_in_subtitles ?? null };
  }).sort((a, b) => a.atFrame - b.atFrame);
  for (let i = 1; i < broll.length; i++) if (broll[i].atFrame < broll[i - 1].atFrame + broll[i - 1].outFrame - broll[i - 1].inFrame) throw new Error('Only one non-overlapping B-roll layer is supported');
  return { fps: media.fps, sourceFrames: media.frames, totalFrames: at, clips, cuts, broll };
}
function remap(compiled, cues) {
  const n = BigInt(compiled.fps.num); const unit = BigInt(compiled.fps.den) * 1000n;
  const rounded = v => Number((v + n / 2n) / n);
  const output = [];
  for (const cue of cues) {
    const start = BigInt(cue.startMs) * n; const end = BigInt(cue.endMs) * n;
    if (end > BigInt(compiled.sourceFrames) * unit) throw new Error('Subtitle exceeds source frames');
    const kept = compiled.clips.filter(c => start < BigInt(c.outFrame) * unit && end > BigInt(c.inFrame) * unit);
    if (!kept.length) continue;
    // SRT stores integer milliseconds. A frame-derived exported boundary can
    // differ by <=1 ms after serialization; this is not a chopped spoken word.
    // Anything larger still blocks, and output is clamped to the kept frame run.
    if (kept.length !== 1 || start + n < BigInt(kept[0].inFrame) * unit || end > BigInt(kept[0].outFrame) * unit + n) throw new Error(`Cue ${cue.cueId} crosses a cut; do not invent partial words`);
    const offset = BigInt(kept[0].atFrame - kept[0].inFrame) * unit;
    const targetStart = rounded(BigInt(kept[0].atFrame) * unit);
    const targetEnd = rounded(BigInt(kept[0].atFrame + kept[0].outFrame - kept[0].inFrame) * unit);
    output.push({ ...cue, startMs: Math.max(targetStart, rounded(start + offset)), endMs: Math.min(targetEnd, rounded(end + offset)) });
  }
  for (let i = 0; i < output.length; i++) if (output[i].startMs >= output[i].endMs || (i && output[i].startMs < output[i - 1].endMs)) throw new Error('Mapped subtitles overlap or become empty');
  return output;
}
function correctedCues(originalBytes, correctedBytes, report) {
  const original = parseSrt(originalBytes); const corrected = parseSrt(correctedBytes);
  if (original.length !== corrected.length || original.some((c, i) => c.cueId !== corrected[i].cueId)) throw new Error('Subtitle resegmentation needs explicit verified alignment; not supported by this minimal correction audit');
  const seen = new Set();
  for (let i = 0; i < original.length; i++) {
    const a = original[i]; const b = corrected[i];
    const changed = a.text !== b.text || a.startMs !== b.startMs || a.endMs !== b.endMs;
    const entries = report.changes.filter(c => String(c.cueId) === a.cueId);
    if (!changed) { if (entries.length) throw new Error('Correction log contains a change not present in the subtitles'); continue; }
    if (entries.length !== 1) throw new Error(`Cue ${a.cueId} lacks one exact correction log entry`);
    const c = entries[0]; seen.add(c);
    if (c.original !== a.text || c.corrected !== b.text || typeof c.evidence !== 'string' || !c.evidence.trim()) throw new Error('Correction log must match exact original/corrected text and evidence');
    if (a.startMs !== b.startMs || a.endMs !== b.endMs) {
      if (c.originalStartMs !== a.startMs || c.originalEndMs !== a.endMs || c.startMs !== b.startMs || c.endMs !== b.endMs) throw new Error('Timestamp repairs require exact before/after timing evidence');
    }
  }
  if (seen.size !== report.changes.length) throw new Error('Correction log contains unknown/duplicate entries');
  return corrected;
}
async function prepare(planFile, name, { root = ROOT, probe = mediaProbe } = {}) {
  const absolute = repoPath(root, planFile); const planBytes = fs.readFileSync(absolute); const plan = json(absolute);
  const source = repoPath(root, plan.source); const metadata = probe(source);
  if (!metadata.hasAudio) throw new Error('A-roll must contain speech audio; external audio is not silently substituted');
  const nominal = metadata.nominalRate?.split('/').map(Number);
  if (nominal && nominal[0] * metadata.fps.den !== metadata.fps.num * nominal[1]) throw new Error('Possible variable frame rate; conform and realign explicitly');
  const bMedia = {};
  for (const b of plan.broll || []) bMedia[b.source] = probe(repoPath(root, b.source));
  const compiled = compile(plan, metadata, bMedia, root);
  const { inbox } = require('./voice_adapter.cjs'); const dir = inbox(name, root);
  const original = json(path.join(dir, 'source.json')); const receipt = json(path.join(dir, 'receipt.json'));
  const sourceHash = await fileHash(source);
  if (original.source !== plan.source || sourceHash !== original.sourceSha256 || sourceHash !== receipt.sourceSha256 || receipt.exportScope !== 'declared-full-source') throw new Error('Plan must bind to its imported original-source transcript');
  const srt = fs.readFileSync(path.join(dir, 'corrected.srt')); const corrections = json(path.join(dir, 'corrections.json'));
  if (corrections.unresolvedCount !== 0 || !Array.isArray(corrections.changes) || typeof corrections.evidence !== 'string' || !corrections.evidence.trim()) throw new Error('Subtitle correction evidence required; unresolved items block preparation');
  if (corrections.originalSha256 !== receipt.originalSha256 || corrections.originalSha256 !== await fileHash(path.join(dir, 'original.srt')) || corrections.correctedSha256 !== digest(srt)) throw new Error('Correction hashes mismatch');
  const edited = serializeSrt(remap(compiled, correctedCues(fs.readFileSync(path.join(dir, 'original.srt')), srt, corrections)));
  if (!edited) throw new Error('No speech subtitles remain; verify the intended edit');
  const sources = [];
  for (const p of new Set([plan.source, ...compiled.broll.map(b => b.source)])) sources.push({ path: p, sha256: await fileHash(repoPath(root, p)) });
  if (digest(fs.readFileSync(absolute)) !== digest(planBytes)) throw new Error('Plan changed during preparation');
  const spec = { plan: planFile, planSha256: digest(planBytes), source: plan.source, sources, ...compiled,
    subtitles: relative(path.join(path.dirname(absolute), 'captions-edited.srt'), root),
    subtitleSha256: digest(edited), mediaValidated: false, readyForPackaging: false };
  const outputs = [['resolve-input.json', JSON.stringify(spec, null, 2) + '\n'], ['captions-edited.srt', edited]];
  for (const [n] of outputs) if (fs.existsSync(path.join(path.dirname(absolute), n))) throw new Error(`Refusing to overwrite ${n}`);
  const created = [];
  try { for (const [n, value] of outputs) { const p = path.join(path.dirname(absolute), n); writeNew(p, value); created.push(p); } }
  catch (e) { for (const p of created) fs.unlinkSync(p); throw e; }
  return { prepared: relative(path.join(path.dirname(absolute), 'resolve-input.json'), root), totalFrames: compiled.totalFrames, mediaValidated: false, readyForPackaging: false };
}
if (require.main === module) {
  const a = args(process.argv.slice(2));
  if (typeof a.plan !== 'string' || typeof a.name !== 'string' || Object.keys(a).some(k => !['plan', 'name'].includes(k))) { console.error('Usage: editing.cjs --plan REPO_PATH --name SOURCE_FILENAME'); process.exitCode = 1; }
  else prepare(a.plan, a.name).then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { compile, remap, correctedCues, prepare };
