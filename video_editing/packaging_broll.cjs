// Reuse-first packaging bridge. No Jianying/Resolve invocation or composition mutation.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, repoPath, digest, json, fileHash, relative, writeNew, args, mediaProbe } = require('./common.cjs');
const text = x => typeof x === 'string' && !!x.trim();
const integer = x => Number.isSafeInteger(x) && x >= 0;
async function lockedInput(file, root) {
  const p = repoPath(root, file), bytes = fs.readFileSync(p), input = json(p);
  if (input.readyForPackagingPlanning !== true || !input.video?.startsWith('remotion-clone/public/') ||
      !integer(input.totalFrames) || input.totalFrames < 1 || !integer(input.fps?.num) || !integer(input.fps?.den) || input.fps.num < 1 || input.fps.den < 1) throw new Error('Current locked packaging input required');
  if (await fileHash(repoPath(root, input.video)) !== input.videoSha256 || await fileHash(repoPath(root, input.subtitles)) !== input.subtitleSha256) throw new Error('Locked video/subtitles changed; repeat final-timeline handoff');
  return { input, bytes };
}
function validateState(state, input) {
  if (state.kind !== 'packaging-broll-state-v1' || state.videoSha256 !== input.videoSha256 || state.subtitleSha256 !== input.subtitleSha256) throw new Error('B-roll target timeline changed; reuse valid source observations but re-confirm placement, do not guess offsets');
  if (!Array.isArray(state.alignedTracks) || !Array.isArray(state.selections) || !Array.isArray(state.processedSources)) throw new Error('Explicit aligned-track/selected/processed lists required');
  const windows = [], ids = new Set();
  for (const r of state.alignedTracks) {
    if (!text(r.id) || ids.has(r.id) || !text(r.source) || !text(r.sourceSha256) || !integer(r.sourceOffsetFrames) || !integer(r.timelineStartFrame) ||
        !integer(r.durationInFrames) || r.durationInFrames < 1 || r.timelineStartFrame + r.durationInFrames > input.totalFrames || !text(r.alignmentEvidence)) throw new Error('Invalid independently exported aligned B-roll track');
    ids.add(r.id);
  }
  for (const s of state.selections) {
    if (!text(s.id) || ids.has(s.id) || !text(s.source) || !text(s.sourceSha256) || !text(s.reviewEvidence) || typeof s.burnedInSubtitles !== 'boolean' ||
        !integer(s.sourceStartFrame) || !integer(s.sourceEndFrame) || !integer(s.targetStartFrame) || !integer(s.durationInFrames) || s.durationInFrames < 1 ||
        s.sourceEndFrame - s.sourceStartFrame !== s.durationInFrames || s.targetStartFrame + s.durationInFrames > input.totalFrames) throw new Error('Invalid separately selected B-roll interval');
    ids.add(s.id); windows.push([s.targetStartFrame, s.targetStartFrame + s.durationInFrames]);
  }
  windows.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < windows.length; i++) if (windows[i][0] < windows[i - 1][1]) throw new Error('Duplicate/overlapping newly selected B-roll coverage');
  for (const s of state.processedSources) if (!text(s.source) || !text(s.sha256)) throw new Error('Processed source identity required');
  return state;
}
async function verifySelected(state, root) {
  for (const s of [...state.alignedTracks, ...state.selections]) if (await fileHash(repoPath(root, s.source)) !== s.sourceSha256) throw new Error('Selected/aligned source changed; recheck affected source ranges or alignment');
}
const emptyState = input => ({ kind: 'packaging-broll-state-v1', videoSha256: input.videoSha256, subtitleSha256: input.subtitleSha256,
  alignedTracks: [], selections: [], processedSources: [] });
async function registerAligned(a, { root = ROOT, probe = mediaProbe } = {}) {
  const { input } = await lockedInput(a.packaging, root), source = repoPath(root, a.source), meta = probe(source);
  if (!text(a.id) || !text(a['alignment-evidence'])) throw new Error('Track ID and actual alignment evidence required');
  const from = Number(a['timeline-start-frame']), offset = Number(a['source-offset-frame']), duration = Number(a['duration-frames']);
  const nominal = meta.nominalRate?.split('/').map(Number);
  if (![from, offset, duration].every(integer) || duration < 1 || offset + duration > meta.frames || from + duration > input.totalFrames ||
      !nominal || nominal[0] * meta.fps.den !== meta.fps.num * nominal[1] || meta.fps.num * input.fps.den !== input.fps.num * meta.fps.den) throw new Error('Aligned track needs explicit in-range origins/duration and compatible frame mapping');
  const state = a.state ? validateState(json(repoPath(root, a.state)), input) : emptyState(input), sha256 = await fileHash(source);
  state.alignedTracks.push({ id: a.id, source: a.source, sourceSha256: sha256, timelineStartFrame: from, sourceOffsetFrames: offset, durationInFrames: duration, alignmentEvidence: a['alignment-evidence'] });
  if (!state.processedSources.some(s => s.source === a.source && s.sha256 === sha256)) state.processedSources.push({ source: a.source, sha256 });
  validateState(state, input); await verifySelected(state, root); await lockedInput(a.packaging, root);
  state.readyForFullRender = false; writeNew(repoPath(root, a.output), state);
  return { saved: a.output, status: 'aligned-track-reuse-existing-packaging', semanticReselectionRequired: false, jianyingGenerated: false };
}
async function route(a, { root = ROOT } = {}) {
  const { input } = await lockedInput(a.packaging, root);
  const state = a.state ? validateState(json(repoPath(root, a.state)), input) : emptyState(input);
  await verifySelected(state, root);
  let newSources = [];
  if (a.input) {
    // Only names and identity checks here; no visual-model/helper import.
    const { scanInput } = require('./media_roles.cjs'), source = repoPath(root, a.input), names = scanInput(source);
    if (names.conflicts.length || !names.namingCoverageComplete) throw new Error('Resolve naming conflict/incomplete coverage before selecting packaging assets');
    const scope = fs.statSync(source).isDirectory() ? source : path.dirname(source);
    for (const p of names.brollVideos) {
      const source = relative(path.join(scope, p), root), sha256 = await fileHash(repoPath(root, source));
      if (!state.processedSources.some(s => s.source === source && s.sha256 === sha256)) newSources.push(source);
    }
  }
  return { status: newSources.length ? 'select-only-new-sources' : state.alignedTracks.length ? 'aligned-track-continue-existing-packaging' : state.selections.length ? 'reuse-selected-ranges' : 'no-additional-broll',
    alignedTracks: state.alignedTracks, reusableSelections: state.selections, newSources,
    needsVisualSelection: newSources.length > 0,
    rulesToLoad: newSources.length ? ['docs/workflows/broll-selection.md#包装阶段直接选段分支'] : [],
    jianyingRequired: false, fullRenderAuthorized: false };
}
async function selectForPackaging(a, { root = ROOT, probe = mediaProbe } = {}) {
  const { input, bytes } = await lockedInput(a.packaging, root);
  const mp = repoPath(root, a.manifest), rp = repoPath(root, a.review), mb = fs.readFileSync(mp), rb = fs.readFileSync(rp), m = json(mp), r = json(rp);
  if (m.kind !== 'visual-evidence-batch-v1' || m.mode !== 'broll' || r.manifestSha256 !== digest(mb) || r.packagingSha256 !== digest(bytes) || r.subtitleSha256 !== input.subtitleSha256) throw new Error('Review must bind current packaging timeline, SRT and B-roll evidence');
  const state = a.state ? validateState(json(repoPath(root, a.state)), input) : emptyState(input);
  // Lazy: existing/embedded content routed above never imports the selection implementation.
  const { validateReview } = require('./visual_workflow.cjs'), { parseSrt } = require('../scripts/editing/subtitles.cjs');
  const selections = validateReview(m, r), cues = parseSrt(fs.readFileSync(repoPath(root, input.subtitles))), fps = input.fps.num / input.fps.den;
  if (!Array.isArray(r.placements) || !r.placements.length) throw new Error('Current-SRT-linked packaging placements required');
  const additions = [];
  for (const p of r.placements) {
    const s = selections.find(x => x.id === p.selectionId), source = s && m.sources.find(x => x.id === s.sourceId);
    if (!s || !text(p.reason) || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.start < 0 || p.end <= p.start || !Array.isArray(p.cueIds) || !p.cueIds.length) throw new Error('Invalid packaging placement');
    const cited = p.cueIds.map(id => cues.find(c => c.cueId === String(id)));
    if (cited.some(c => !c) || cited.some(c => c.endMs <= p.start * 1000 || c.startMs >= p.end * 1000) || p.start * 1000 < Math.min(...cited.map(c => c.startMs)) - 1 || p.end * 1000 > Math.max(...cited.map(c => c.endMs)) + 1) throw new Error('Packaging placement outside cited current-SRT window');
    const meta = probe(repoPath(root, source.source)), nominal = meta.nominalRate?.split('/').map(Number);
    if (meta.frames !== source.meta.frames || !nominal || nominal[0] * meta.fps.den !== meta.fps.num * nominal[1] ||
        meta.fps.num * input.fps.den !== input.fps.num * meta.fps.den || source.meta.fps.num * input.fps.den !== input.fps.num * source.meta.fps.den) throw new Error('Source/timeline frame map needs explicit conforming');
    if (await fileHash(repoPath(root, source.source)) !== source.sha256) throw new Error('Visual source changed');
    for (const id of s.evidenceSampleIds) { const f = m.samples.find(x => x.id === id); if (await fileHash(repoPath(root, f.image)) !== f.imageSha256) throw new Error('Visual evidence changed'); }
    const from = Math.round(p.start * fps), duration = Math.round(p.end * fps) - from, start = p.sourceStartFrame ?? s.startFrame;
    if (!integer(start) || duration <= 0 || start < s.startFrame || start + duration > s.endFrame) throw new Error('Packaging placement exceeds reviewed source interval');
    additions.push({ id: p.id || s.id, source: source.source, sourceSha256: source.sha256, sourceStartFrame: start, sourceEndFrame: start + duration,
      targetStartFrame: from, durationInFrames: duration, burnedInSubtitles: s.burnedInSubtitles,
      reviewEvidence: p.reason, sourceObservation: { manifest: a.manifest, manifestSha256: digest(mb), selectionId: s.id } });
    if (!state.processedSources.some(x => x.source === source.source && x.sha256 === source.sha256)) state.processedSources.push({ source: source.source, sha256: source.sha256 });
  }
  state.selections.push(...additions); validateState(state, input); await verifySelected(state, root);
  if (await fileHash(mp) !== digest(mb) || await fileHash(rp) !== digest(rb)) throw new Error('Review/evidence changed during selection');
  await lockedInput(a.packaging, root);
  state.review = { path: a.review, sha256: digest(rb), perception: 'review-declared-not-independently-proven' };
  state.readyForFullRender = false; writeNew(repoPath(root, a.output), state);
  return { saved: a.output, selected: additions.length, jianyingGenerated: false, fullRenderAuthorized: false };
}
async function materialize(a, { root = ROOT } = {}) {
  const { input } = await lockedInput(a.packaging, root), state = validateState(json(repoPath(root, a.state)), input);
  await verifySelected(state, root);
  const output = repoPath(root, a.output);
  if (!a.output.startsWith('remotion-clone/public/') || fs.existsSync(output)) throw new Error('Use a NEW Remotion public directory for selected clips');
  const clips = [], alignedTracks = [];
  for (let i = 0; i < state.alignedTracks.length; i++) {
    const s = state.alignedTracks[i]; let source = s.source;
    if (!source.startsWith('remotion-clone/public/')) {
      if (!fs.existsSync(output)) fs.mkdirSync(output);
      source = `${a.output}/aligned-${String(i + 1).padStart(3, '0')}${path.extname(s.source)}`;
      fs.copyFileSync(repoPath(root, s.source), repoPath(root, source), fs.constants.COPYFILE_EXCL);
      if (await fileHash(repoPath(root, source)) !== s.sourceSha256) throw new Error('Aligned-track asset copy identity mismatch');
    }
    alignedTracks.push({ id: s.id, src: source.slice('remotion-clone/public/'.length), sourceOffsetFrames: s.sourceOffsetFrames,
      from: s.timelineStartFrame, durationInFrames: s.durationInFrames, muted: true, sourceSha256: s.sourceSha256,
      skipSemanticReselection: true, continuePackagingBlackGapCropRoiChecks: true });
  }
  let executables, helpers;
  for (let i = 0; i < state.selections.length; i++) {
    const s = state.selections[i];
    // No visual observation is repeated; this is media validation/extraction only.
    executables ||= {
      ffmpeg: process.env.VIDEO_FFMPEG || [
        'tools/chatcut-runtime/.chatcut/cache/ffmpeg/8.1/win32-x64/ffmpeg.exe',
        'remotion-clone/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe',
      ].map(p => path.join(root, p)).find(p => fs.existsSync(p)),
      ffprobe: process.env.VIDEO_FFPROBE || path.join(root, 'remotion-clone/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe'),
    };
    if (!executables.ffmpeg) throw new Error('Existing FFmpeg required; no installation');
    helpers ||= require('./visual_workflow.cjs');
    const meta = helpers.probeVideo(repoPath(root, s.source), executables.ffprobe);
    if (meta.rotation || Math.abs(meta.startTime) > 0.02 || meta.fps.num * input.fps.den !== input.fps.num * meta.fps.den || s.sourceEndFrame > meta.frames) throw new Error('Source timing/orientation needs explicit conforming');
    let source = s.source;
    const reuse = source.startsWith('remotion-clone/public/') && s.sourceStartFrame === 0 && s.sourceEndFrame === meta.frames;
    if (!reuse) {
      if (['smpte2084', 'arib-std-b67'].includes(meta.colorTransfer) || /p(?:9|10|12|14|16)(?:le|be)|^(?:p010|p012|p016)|(?:48|64)(?:le|be)$/.test(meta.pixelFormat || '')) throw new Error('HDR/high-bit-depth source needs an explicit color-preserving extraction policy');
      if (!fs.existsSync(output)) fs.mkdirSync(output);
      source = `${a.output}/clip-${String(i + 1).padStart(3, '0')}.mp4`;
      const fps = input.fps.num / input.fps.den;
      const command = ['-hide_banner', '-nostdin', '-ss', String(s.sourceStartFrame / fps), '-i', repoPath(root, s.source),
        '-t', String(s.durationInFrames / fps), '-map', `0:${meta.streamIndex}`, '-map', '0:a:0?',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', repoPath(root, source)];
      const r = spawnSync(executables.ffmpeg, command, { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
      if (r.error || r.status !== 0) throw new Error(`Clip extraction failed; partial output preserved: ${r.error?.message || r.stderr?.slice(-1000)}`);
      const clip = helpers.probeVideo(repoPath(root, source), executables.ffprobe);
      if (clip.frames !== s.durationInFrames || (meta.hasAudio && !clip.hasAudio)) throw new Error('Extracted clip length/audio differs; partial output preserved');
    }
    clips.push({ id: s.id, src: source.slice('remotion-clone/public/'.length), from: s.targetStartFrame, durationInFrames: s.durationInFrames,
      sourceOffsetFrames: 0, muted: true, burnedInSubtitles: s.burnedInSubtitles, reusedWholeClip: reuse, source: s.source,
      sourceSha256: s.sourceSha256, sourceStartFrame: s.sourceStartFrame, sourceHasAudio: meta.hasAudio, mediaSha256: await fileHash(repoPath(root, source)) });
  }
  await verifySelected(state, root); await lockedInput(a.packaging, root);
  if (!fs.existsSync(output)) fs.mkdirSync(output);
  const result = { kind: 'packaging-broll-media-v1', videoSha256: input.videoSha256, subtitleSha256: input.subtitleSha256,
    fps: input.fps, alignedTracks, clips, jianyingGenerated: false, compositionModified: false, fullRenderAuthorized: false,
    note: 'Aligned tracks keep their explicit time map and existing black-gap/crop/ROI workflow. New physical clips have zero offset. Preserve existing speech audio once; do not overlay aligned black gaps.' };
  writeNew(path.join(output, 'packaging-broll.json'), result);
  return { saved: `${a.output}/packaging-broll.json`, clips: clips.length, alignedTracks: alignedTracks.length, jianyingGenerated: false, fullRenderAuthorized: false };
}
if (require.main === module) {
  const action = process.argv[2], a = args(process.argv.slice(3));
  const allowed = { route: ['packaging', 'state', 'input'], align: ['packaging', 'state', 'source', 'id', 'timeline-start-frame', 'source-offset-frame', 'duration-frames', 'alignment-evidence', 'output'],
    select: ['packaging', 'state', 'manifest', 'review', 'output'], materialize: ['packaging', 'state', 'output'] };
  Promise.resolve().then(() => {
    if (!allowed[action] || Object.keys(a).some(k => !allowed[action].includes(k)) || !text(a.packaging)) throw new Error('Use documented route/align/select/materialize arguments');
    return ({ route, align: registerAligned, select: selectForPackaging, materialize })[action](a);
  }).then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { route, registerAligned, selectForPackaging, materialize, validateState };
