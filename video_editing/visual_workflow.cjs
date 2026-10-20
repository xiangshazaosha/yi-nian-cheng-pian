// Local evidence preparation and reviewed-plan assembly, NOT a vision model.
// Never uploads, downloads, installs, deletes originals or drives editor UI.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, repoPath, digest, json, fileHash, relative, writeNew, args, mediaProbe } = require('./common.cjs');
const { scanInput } = require('./media_roles.cjs');
const nonempty = x => typeof x === 'string' && !!x.trim();
const parseJsonBytes = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
function run(exe, argv) {
  const r = spawnSync(exe, argv, { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`Media command failed: ${r.error?.message || r.stderr?.slice(-3000)}`);
  return r;
}
function binaries(root) {
  const ffmpeg = process.env.VIDEO_FFMPEG || [
    'tools/chatcut-runtime/.chatcut/cache/ffmpeg/8.1/win32-x64/ffmpeg.exe',
    'remotion-clone/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe',
  ].map(p => path.join(root, p)).find(p => fs.existsSync(p));
  const ffprobe = process.env.VIDEO_FFPROBE || path.join(root, 'remotion-clone/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe');
  if (!ffmpeg || !fs.existsSync(ffprobe)) throw new Error('Existing FFmpeg/FFprobe required; no automatic installation');
  return { ffmpeg, ffprobe };
}
function probeVideo(absolute, ffprobe) {
  const data = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', absolute]).stdout);
  const v = data.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!v) throw new Error('Video stream required');
  const [num, den] = String(v.avg_frame_rate).split('/').map(Number), [rn, rd] = String(v.r_frame_rate).split('/').map(Number);
  if (![num, den, rn, rd].every(n => Number.isSafeInteger(n) && n > 0) || num * rd !== rn * den) throw new Error('VFR/unknown rate requires explicit conforming before frame-index analysis');
  const duration = Number(v.duration || data.format.duration), startTime = Number(v.start_time ?? data.format.start_time ?? 0);
  const frames = Number(v.nb_frames) || Math.round(duration * num / den);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(startTime) || !Number.isSafeInteger(frames) || frames < 1) throw new Error('Invalid video timing');
  const rotation = Number(v.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0);
  return { duration, startTime, fps: { num, den }, frames, frameCountMeasured: Number(v.nb_frames) > 0, rotation,
    width: v.width, height: v.height, streamIndex: v.index, pixelFormat: v.pix_fmt, colorTransfer: v.color_transfer,
    nominalRate: v.r_frame_rate, hasAudio: data.streams.some(s => s.codec_type === 'audio') };
}
function samplingFrames(meta, interval, start = 0, end = meta.frames) {
  if (!Number.isFinite(interval) || interval < 0.05 || interval > 3600 || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > meta.frames) throw new Error('Invalid sampling interval/range');
  const step = Math.max(1, Math.round(interval * meta.fps.num / meta.fps.den));
  const frames = [];
  for (let f = start; f < end; f += step) {
    if (frames.length >= 100000) throw new Error('Too many samples; narrow the interval or use a coarser overview');
    frames.push(f);
  }
  if (frames.at(-1) !== end - 1) frames.push(end - 1);
  return frames;
}
function pageSamples(sources, interval, batch, batchSize, range) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 120 || !Number.isSafeInteger(batch) || batch < 0) throw new Error('Invalid batch or batch size (1..120)');
  const all = sources.flatMap(s => samplingFrames(s.meta, interval, range?.startFrame ?? 0, range?.endFrame ?? s.meta.frames)
    .map(frameIndex => ({ sourceId: s.id, frameIndex })));
  const batchCount = Math.ceil(all.length / batchSize);
  if (batch >= batchCount) throw new Error('Batch exceeds planned samples');
  return { chosen: all.slice(batch * batchSize, (batch + 1) * batchSize), total: all.length, batchCount };
}
async function verifySources(manifest, root) {
  if (manifest.kind !== 'visual-evidence-batch-v1' || !Array.isArray(manifest.sources) || !Array.isArray(manifest.samples)) throw new Error('Not a visual evidence manifest');
  for (const s of manifest.sources) if (await fileHash(repoPath(root, s.source)) !== s.sha256) throw new Error('Visual source changed; re-analyse the source');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function extractBatch(sources, chosen, output, root, ffmpeg) {
  fs.mkdirSync(output); fs.mkdirSync(path.join(output, 'frames'));
  const samples = [];
  for (const s of sources) {
    const wanted = chosen.filter(x => x.sourceId === s.id);
    if (!wanted.length) continue;
    // select's n is the decoded SOURCE frame index, not an assumed JPEG index.
    const filter = wanted.map(x => `eq(n\\,${x.frameIndex})`).join('+');
    const prefix = `${s.id}-`, pattern = path.join(output, 'frames', `${prefix}%04d.jpg`);
    const r = run(ffmpeg, ['-hide_banner', '-nostdin', '-copyts', '-i', repoPath(root, s.source), '-map', `0:${s.meta.streamIndex ?? 0}`,
      '-vf', `select=${filter},showinfo,scale=640:640:force_original_aspect_ratio=decrease`,
      '-fps_mode', 'passthrough', '-frames:v', String(wanted.length), '-q:v', '3', '-an', pattern]);
    const pts = [...r.stderr.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:\s*(-?[\d.e+]+)/g)].map(m => Number(m[1]));
    if (pts.length !== wanted.length) throw new Error('Decoded evidence count differs from sample plan; partial output preserved');
    for (let i = 0; i < wanted.length; i++) {
      const image = path.join(output, 'frames', `${prefix}${String(i + 1).padStart(4, '0')}.jpg`);
      const seconds = pts[i] - s.meta.startTime, expected = wanted[i].frameIndex * s.meta.fps.den / s.meta.fps.num;
      if (!Number.isFinite(seconds) || Math.abs(seconds - expected) > 0.02) throw new Error('Decoded timestamps do not match CFR frame map; conform explicitly');
      samples.push({ id: `${s.id}-f${wanted[i].frameIndex}`, ...wanted[i], ptsSeconds: pts[i], relativeSeconds: seconds,
        image: relative(image, root), imageSha256: await fileHash(image) });
    }
  }
  return samples;
}
async function prepare(a, { root = ROOT, probe, extract } = {}) {
  if (!nonempty(a.input) || !nonempty(a.output) || !['broll', 'vlog'].includes(a.mode)) throw new Error('prepare requires --input REPO_PATH --output NEW_REPO_DIR --mode broll|vlog');
  const input = repoPath(root, a.input), route = scanInput(input, { mode: a.mode === 'vlog' ? 'vlog' : 'auto' });
  if (route.conflicts.length) throw new Error('Resolve naming conflicts first');
  // Return BEFORE probing, hashing, creating output or importing optional logic.
  if (!route.needsVisualSelection) return { status: 'skipped-no-broll', rulesLoaded: [], filesWritten: 0 };
  if (!route.namingCoverageComplete) throw new Error('Naming scan incomplete; select a narrower folder before analysis');
  const output = repoPath(root, a.output); if (fs.existsSync(output)) throw new Error('Refusing to overwrite visual evidence');
  const tools = probe && extract ? {} : binaries(root), scope = fs.statSync(input).isDirectory() ? input : path.dirname(input);
  const sources = [];
  for (const p of route.visualVideos) {
    const source = relative(path.join(scope, p), root); repoPath(root, source);
    const meta = (probe || (p => probeVideo(p, tools.ffprobe)))(repoPath(root, source));
    sources.push({ id: `v${sources.length + 1}`, source, sha256: await fileHash(repoPath(root, source)), meta,
      nameHint: route.videos.find(v => v.path === p).nameHint, nameIsContentProof: false });
  }
  const interval = Number(a.interval ?? 10), batch = Number(a.batch ?? 0), batchSize = Number(a['batch-size'] ?? 60);
  const page = pageSamples(sources, interval, batch, batchSize);
  const samples = await (extract || extractBatch)(sources, page.chosen, output, root, tools.ffmpeg);
  const manifest = { kind: 'visual-evidence-batch-v1', mode: a.mode, sourceInput: a.input, sources, samples,
    sampling: { type: 'overview', intervalSeconds: interval, batch, batchSize, batchCount: page.batchCount,
      totalPlannedSamples: page.total, remainingSamplesOutsideBatch: page.total - samples.length },
    visualUnderstandingCompleted: false, dynamicReviewCompleted: false, readyForPackaging: false };
  await verifySources(manifest, root);
  writeNew(path.join(output, 'manifest.json'), manifest);
  writeNew(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>视觉证据批次</title><style>body{font:16px sans-serif;background:#eee}figure{display:inline-block;width:310px;vertical-align:top}img{max-width:300px}</style><h1>采样证据，不是自动选段结果</h1>` +
    samples.map(s => `<figure><img src="${escapeHtml(relative(repoPath(root, s.image), output))}"><figcaption>${escapeHtml(s.id)} · 源 ${s.relativeSeconds.toFixed(3)}s<br>${escapeHtml(sources.find(v => v.id === s.sourceId).nameHint)}</figcaption></figure>`).join(''));
  return { status: 'evidence-prepared-awaiting-visual-review', manifest: relative(path.join(output, 'manifest.json'), root), samples: samples.length,
    batch, batchCount: page.batchCount, remainingSamplesOutsideBatch: page.total - samples.length, semanticModelInvoked: false };
}
async function refine(a, { root = ROOT } = {}) {
  if (![a.manifest, a.source, a.output].every(nonempty)) throw new Error('refine requires manifest, source ID and new output');
  const input = repoPath(root, a.manifest), m = json(input); await verifySources(m, root);
  const s = m.sources.find(x => x.id === a.source); if (!s) throw new Error('Unknown source ID');
  const output = repoPath(root, a.output); if (fs.existsSync(output)) throw new Error('Refusing to overwrite visual evidence');
  const tools = binaries(root), startFrame = Number(a['start-frame']), endFrame = Number(a['end-frame']);
  const interval = Number(a.interval ?? 0.25), batch = Number(a.batch ?? 0), batchSize = Number(a['batch-size'] ?? 60);
  const page = pageSamples([s], interval, batch, batchSize, { startFrame, endFrame });
  const samples = await extractBatch([s], page.chosen, output, root, tools.ffmpeg);
  const result = { kind: m.kind, mode: m.mode, parentManifest: a.manifest, parentManifestSha256: digest(fs.readFileSync(input)), sources: [s], samples,
    sampling: { type: 'refinement', startFrame, endFrame, intervalSeconds: interval, batch, batchCount: page.batchCount,
      totalPlannedSamples: page.total, remainingSamplesOutsideBatch: page.total - samples.length },
    visualUnderstandingCompleted: false, dynamicReviewCompleted: false, readyForPackaging: false };
  await verifySources(result, root); writeNew(path.join(output, 'manifest.json'), result);
  return { status: 'refinement-prepared-awaiting-dynamic-review', manifest: relative(path.join(output, 'manifest.json'), root), samples: samples.length, batchCount: page.batchCount };
}
async function mergeBatches(a, { root = ROOT } = {}) {
  if (![a.manifests, a.output].every(nonempty)) throw new Error('merge requires a repository JSON list of manifest paths and new output');
  const paths = json(repoPath(root, a.manifests));
  if (!Array.isArray(paths) || !paths.length || paths.some(p => !nonempty(p))) throw new Error('Expected a non-empty manifest path array');
  const sources = [], samples = [], parents = []; let mode;
  for (const p of paths) {
    const bytes = fs.readFileSync(repoPath(root, p)), m = parseJsonBytes(bytes); await verifySources(m, root);
    if (!['broll', 'vlog'].includes(m.mode) || (mode && mode !== m.mode)) throw new Error('Cannot merge different workflow modes'); mode = m.mode;
    parents.push({ manifest: p, sha256: digest(bytes) });
    const ids = new Map();
    for (const s of m.sources) {
      let out = sources.find(x => x.source === s.source);
      const sameMap = out && out.meta.frames === s.meta.frames && out.meta.fps.num * s.meta.fps.den === s.meta.fps.num * out.meta.fps.den &&
        (out.meta.startTime ?? 0) === (s.meta.startTime ?? 0) && (out.meta.rotation ?? 0) === (s.meta.rotation ?? 0) &&
        out.meta.width === s.meta.width && out.meta.height === s.meta.height;
      if (out && (out.sha256 !== s.sha256 || !sameMap)) throw new Error('Source identity/timing differs across evidence batches');
      if (!out) { out = { ...s, id: `v${sources.length + 1}` }; sources.push(out); }
      ids.set(s.id, out.id);
    }
    for (const f of m.samples) {
      if (!ids.has(f.sourceId) || await fileHash(repoPath(root, f.image)) !== f.imageSha256) throw new Error('Batch sample identity mismatch');
      const sourceId = ids.get(f.sourceId), id = `${sourceId}-f${f.frameIndex}`, previous = samples.find(x => x.id === id);
      if (previous && (previous.imageSha256 !== f.imageSha256 || previous.ptsSeconds !== f.ptsSeconds)) throw new Error('Conflicting overlapping frame evidence');
      if (!previous) samples.push({ ...f, id, sourceId });
    }
  }
  const output = repoPath(root, a.output); if (fs.existsSync(output)) throw new Error('Refusing to overwrite merged evidence');
  const m = { kind: 'visual-evidence-batch-v1', mode, sources, samples, parents,
    sampling: { type: 'merged-evidence-not-proof-of-complete-viewing' }, visualUnderstandingCompleted: false, dynamicReviewCompleted: false, readyForPackaging: false };
  await verifySources(m, root);
  for (const p of parents) if (await fileHash(repoPath(root, p.manifest)) !== p.sha256) throw new Error('Batch manifest changed during merge');
  fs.mkdirSync(output); writeNew(path.join(output, 'manifest.json'), m);
  return { manifest: relative(path.join(output, 'manifest.json'), root), samples: samples.length, sources: sources.length, semanticModelInvoked: false };
}
function validateReview(manifest, review) {
  if (review.schemaVersion !== 1 || !Array.isArray(review.selections) || !review.selections.length) throw new Error('Reviewed selections required');
  const ids = new Set();
  for (const s of review.selections) {
    if (!nonempty(s.id) || ids.has(s.id)) throw new Error('Unique selection IDs required'); ids.add(s.id);
    const src = manifest.sources.find(v => v.id === s.sourceId), d = s.dynamicReview;
    if (!src || !Number.isInteger(s.startFrame) || !Number.isInteger(s.endFrame) || s.startFrame < 0 || s.endFrame <= s.startFrame || s.endFrame > src.meta.frames) throw new Error('Selection source range invalid');
    if (![s.description, s.reason].every(nonempty) || typeof s.burnedInSubtitles !== 'boolean') throw new Error('Selection description, reason and subtitle inspection required');
    if (!d || !nonempty(d.evidence) || !Number.isInteger(d.startFrame) || !Number.isInteger(d.endFrame) || d.startFrame < 0 || d.startFrame > s.startFrame || d.endFrame < s.endFrame || d.endFrame > src.meta.frames) throw new Error('Dynamic review declaration must contain the selected range');
    if (!Array.isArray(s.evidenceSampleIds) || !s.evidenceSampleIds.length || new Set(s.evidenceSampleIds).size !== s.evidenceSampleIds.length) throw new Error('Evidence sample IDs required');
    for (const id of s.evidenceSampleIds) {
      const f = manifest.samples.find(x => x.id === id);
      if (!f || f.sourceId !== s.sourceId || f.frameIndex < d.startFrame || f.frameIndex >= d.endFrame) throw new Error('Evidence does not belong to source/review range');
    }
  }
  // This validates declarations/identity, not the truth of a person's/model's perception.
  return review.selections;
}
async function buildPlan(a, { root = ROOT, probe = mediaProbe } = {}) {
  if (![a.manifest, a.review, a.prepared, a.output].every(nonempty) || a['review-only'] !== true) throw new Error('plan requires manifest, review, prepared, output and --review-only');
  const manifestPath = repoPath(root, a.manifest), manifestBytes = fs.readFileSync(manifestPath), manifest = json(manifestPath);
  if (manifest.mode !== 'broll') throw new Error('Vlog evidence cannot be silently converted into a speech-overlay plan');
  await verifySources(manifest, root);
  for (const s of manifest.samples) if (await fileHash(repoPath(root, s.image)) !== s.imageSha256) throw new Error('Sample image changed');
  const reviewPath = repoPath(root, a.review), reviewBytes = fs.readFileSync(reviewPath), review = parseJsonBytes(reviewBytes);
  if (review.manifestSha256 !== digest(manifestBytes)) throw new Error('Review/manifest identity mismatch');
  const selections = validateReview(manifest, review);
  const preparedPath = repoPath(root, a.prepared), preparedBytes = fs.readFileSync(preparedPath), spec = json(preparedPath);
  if (review.preparedSha256 !== digest(preparedBytes) || review.subtitleSha256 !== spec.subtitleSha256) throw new Error('Review must bind current prepared timeline and subtitles');
  const planBytes = fs.readFileSync(repoPath(root, spec.plan)), base = parseJsonBytes(planBytes);
  if (digest(planBytes) !== spec.planSha256 || await fileHash(repoPath(root, spec.subtitles)) !== spec.subtitleSha256) throw new Error('Base plan or edited SRT changed');
  if (!Array.isArray(spec.sources) || !spec.sources.some(s => s.path === base.source)) throw new Error('Prepared source identity missing');
  for (const s of spec.sources) if (await fileHash(repoPath(root, s.path)) !== s.sha256) throw new Error('Prepared media changed');
  const { compile } = require('./editing.cjs'), { parseSrt } = require('../scripts/editing/subtitles.cjs');
  const cues = parseSrt(fs.readFileSync(repoPath(root, spec.subtitles))), media = {};
  for (const p of new Set([base.source, ...base.broll.map(b => b.source), ...manifest.sources.map(s => s.source)])) media[p] = probe(repoPath(root, p));
  const baseCompiled = compile(base, media[base.source], media, root);
  for (const s of manifest.sources) {
    const now = media[s.source];
    if (now.frames !== s.meta.frames || now.fps.num * s.meta.fps.den !== s.meta.fps.num * now.fps.den) throw new Error('Reviewed source frame map differs from current media');
  }
  if (baseCompiled.totalFrames !== spec.totalFrames || JSON.stringify(baseCompiled.clips) !== JSON.stringify(spec.clips)) throw new Error('Prepared timeline differs from current source plan');
  if (!Array.isArray(review.placements) || !review.placements.length) throw new Error('SRT-linked placements required');
  const fps = media[base.source].fps.num / media[base.source].fps.den;
  const additions = review.placements.map(p => {
    const s = selections.find(s => s.id === p.selectionId), src = s && manifest.sources.find(v => v.id === s.sourceId);
    if (!s || !nonempty(p.reason) || ![p.start, p.end].every(Number.isFinite) || p.start < 0 || p.end <= p.start) throw new Error('Invalid placement');
    if (!Array.isArray(p.cueIds) || !p.cueIds.length || new Set(p.cueIds).size !== p.cueIds.length) throw new Error('Placement must cite current SRT cues');
    const cited = p.cueIds.map(id => cues.find(c => c.cueId === String(id)));
    if (cited.some(c => !c) || cited.some(c => c.endMs <= p.start * 1000 || c.startMs >= p.end * 1000) ||
      p.start * 1000 < Math.min(...cited.map(c => c.startMs)) - 1 || p.end * 1000 > Math.max(...cited.map(c => c.endMs)) + 1) throw new Error('Placement outside cited edited-SRT window');
    const sourceStart = p.sourceStartFrame ?? s.startFrame, duration = Math.round(p.end * fps) - Math.round(p.start * fps);
    if (!Number.isInteger(sourceStart) || sourceStart < s.startFrame || sourceStart + duration > s.endFrame || duration <= 0) throw new Error('Placement exceeds reviewed usable range');
    return { source: src.source, source_start: sourceStart / fps, start: p.start, end: p.end, reason: p.reason, burned_in_subtitles: s.burnedInSubtitles };
  });
  const plan = { ...base, broll: [...base.broll, ...additions] }; compile(plan, media[base.source], media, root);
  const output = repoPath(root, a.output); if (fs.existsSync(output)) throw new Error('Refusing to overwrite plan output');
  // Recheck all bound inputs after expensive probing, before publishing the candidate.
  if (await fileHash(manifestPath) !== digest(manifestBytes) || await fileHash(reviewPath) !== digest(reviewBytes) || await fileHash(preparedPath) !== digest(preparedBytes) ||
    await fileHash(repoPath(root, spec.plan)) !== spec.planSha256 || await fileHash(repoPath(root, spec.subtitles)) !== spec.subtitleSha256) throw new Error('Inputs changed during plan assembly');
  await verifySources(manifest, root);
  for (const s of spec.sources) if (await fileHash(repoPath(root, s.path)) !== s.sha256) throw new Error('Prepared media changed during assembly');
  fs.mkdirSync(output); writeNew(path.join(output, 'edit_plan.json'), plan);
  writeNew(path.join(output, 'receipt.json'), { status: 'candidate-plan-file-validated', manifest: a.manifest, manifestSha256: digest(manifestBytes),
    review: a.review, reviewSha256: digest(reviewBytes), prepared: a.prepared, subtitleSha256: spec.subtitleSha256,
    additions: additions.length, semanticMatching: 'assistant-or-human-review-declared-not-independently-proven',
    mediaValidated: false, applicationOpenVerified: false, readyForPackaging: false });
  return { status: 'candidate-plan-file-validated', plan: relative(path.join(output, 'edit_plan.json'), root), additions: additions.length, readyForPackaging: false };
}
async function assembleVlog(a, { root = ROOT, probe = mediaProbe } = {}) {
  if (![a.manifest, a.review, a.output, a['draft-name']].every(nonempty) || a['review-only'] !== true || /[\\/:*?"<>|]/.test(a['draft-name'])) throw new Error('assemble requires manifest, review, new output, safe draft-name and --review-only');
  const mp = repoPath(root, a.manifest), rp = repoPath(root, a.review), mb = fs.readFileSync(mp), rb = fs.readFileSync(rp);
  const m = parseJsonBytes(mb), review = parseJsonBytes(rb);
  if (m.mode !== 'vlog' || review.manifestSha256 !== digest(mb)) throw new Error('Vlog review must bind the current Vlog evidence');
  await verifySources(m, root);
  for (const f of m.samples) if (await fileHash(repoPath(root, f.image)) !== f.imageSha256) throw new Error('Sample image changed');
  const selections = validateReview(m, review), media = {};
  if (!Array.isArray(review.sequence) || !review.sequence.length) throw new Error('Reviewed Vlog sequence required');
  let totalFrames = 0, first;
  const clips = review.sequence.map(item => {
    const s = selections.find(x => x.id === item.selectionId), source = s && m.sources.find(x => x.id === s.sourceId);
    if (!s || !nonempty(item.reason)) throw new Error('Sequence must reference a reviewed selection and reason');
    const meta = media[source.source] ||= { ...probe(repoPath(root, source.source)), absolute: repoPath(root, source.source) };
    if (source.meta.rotation) throw new Error('Rotated Vlog sources require explicit orientation conforming before draft assembly');
    const nominal = meta.nominalRate?.split('/').map(Number);
    if (!nominal || nominal[0] * meta.fps.den !== meta.fps.num * nominal[1] || meta.frames !== source.meta.frames ||
      meta.fps.num * source.meta.fps.den !== source.meta.fps.num * meta.fps.den) throw new Error('Vlog source frame mapping changed or needs conforming');
    first ||= source.source; const initial = media[first];
    if (meta.fps.num * initial.fps.den !== initial.fps.num * meta.fps.den || meta.width !== initial.width || meta.height !== initial.height) throw new Error('Mixed Vlog frame rates/dimensions need explicit conforming; no implicit cropping');
    const start = item.sourceStartFrame ?? s.startFrame, end = item.sourceEndFrame ?? s.endFrame;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < s.startFrame || end > s.endFrame || end <= start) throw new Error('Sequence trim exceeds reviewed usable range');
    const clip = { source: source.source, inFrame: start, outFrame: end, atFrame: totalFrames }; totalFrames += end - start;
    return clip;
  });
  const output = repoPath(root, a.output); if (fs.existsSync(output)) throw new Error('Refusing to overwrite Vlog draft');
  if (await fileHash(mp) !== digest(mb) || await fileHash(rp) !== digest(rb)) throw new Error('Vlog review changed during assembly');
  await verifySources(m, root);
  const spec = { source: first, clips, broll: [], media, totalFrames, fps: media[first].fps,
    name: a['draft-name'], output: path.join(output, a['draft-name']), primaryTrackLabel: 'Vlog：已审阅选段（保留原声）' };
  fs.mkdirSync(output);
  const python = spawnSync('python', [path.join(__dirname, 'jianying_backend.py')], { input: JSON.stringify(spec), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, maxBuffer: 2 * 1024 * 1024 });
  if (python.error || python.status !== 0) throw new Error(`Vlog draft generation failed; partial output preserved: ${python.error?.message || python.stderr}`);
  await verifySources(m, root);
  if (await fileHash(mp) !== digest(mb) || await fileHash(rp) !== digest(rb)) throw new Error('Vlog evidence/review changed during serialization; partial output preserved');
  const result = JSON.parse(python.stdout), receipt = { ...result, mode: 'vlog', manifest: a.manifest, manifestSha256: digest(mb), review: a.review, reviewSha256: digest(rb),
    draft: relative(spec.output, root), draftContentSha256: await fileHash(path.join(spec.output, 'draft_content.json')), totalFrames, fps: spec.fps,
    audioPolicy: 'source-audio-preserved-no-music-added', semanticMatching: 'assistant-or-human-declared-not-independently-proven' };
  writeNew(path.join(output, 'receipt.json'), receipt);
  writeNew(path.join(output, '使用说明.txt'), '视觉 Vlog 可编辑审片草稿：已审阅选段按序排列，保留源声音，不含新增配乐、调色、转场或字幕。\n' +
    '本次是文件生成与回读，不代表已在剪映打开或完成正常速度看听；原片与原工程不变，移动素材须重链。\n');
  return receipt;
}
if (require.main === module) {
  const action = process.argv[2], a = args(process.argv.slice(3));
  const allowed = { prepare: ['input', 'output', 'mode', 'interval', 'batch', 'batch-size'],
    refine: ['manifest', 'source', 'output', 'start-frame', 'end-frame', 'interval', 'batch', 'batch-size'],
    merge: ['manifests', 'output'], plan: ['manifest', 'review', 'prepared', 'output', 'review-only'],
    assemble: ['manifest', 'review', 'output', 'draft-name', 'review-only'] };
  Promise.resolve().then(() => {
    if (!allowed[action] || Object.keys(a).some(k => !allowed[action].includes(k))) throw new Error('Use prepare, refine, merge, plan or assemble with documented arguments');
    return ({ prepare, refine, merge: mergeBatches, plan: buildPlan, assemble: assembleVlog })[action](a);
  }).then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { samplingFrames, pageSamples, prepare, refine, mergeBatches, validateReview, buildPlan, assembleVlog, probeVideo };
