// Editing data only: no media mutation, Resolve control, or packaging execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const rate = (value) => isObject(value) && integer(value.num, 1) && integer(value.den, 1);
const equalRate = (a, b) => rate(a) && rate(b) && BigInt(a.num) * BigInt(b.den) === BigInt(b.num) * BigInt(a.den);
const intersects = (a, b) => a.start < b.end && b.start < a.end;

function repoPath(root, value) {
  if (!text(value) || /[\\:\u0000-\u001f]/u.test(value) || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Expected a normalized repository-relative path: ${JSON.stringify(value)}`);
  }
  const base = path.resolve(root);
  const result = path.resolve(base, value);
  if (!result.startsWith(base + path.sep)) throw new Error('Path escapes repository');
  // Follow existing parents too, so a symlink/junction cannot redirect an output.
  let parent = result;
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const realBase = fs.realpathSync(base);
  const realParent = fs.realpathSync(parent);
  const relative = path.relative(realBase, realParent);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Path resolves outside repository');
  return result;
}

function validatePlan(plan, { root, checkFiles = false } = {}) {
  const errors = [];
  const fail = (where, message) => errors.push({ where, message });
  const shape = (value, keys, where) => {
    if (!isObject(value)) { fail(where, 'Expected object'); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${where}.${key}`, 'Unknown field');
    return true;
  };
  const string = (value, where) => { if (!text(value)) fail(where, 'Expected non-empty text'); };
  const int = (value, where, min = 0) => { if (!integer(value, min)) fail(where, `Expected safe integer >= ${min}`); };
  const list = (value, where) => { if (!Array.isArray(value)) { fail(where, 'Expected array'); return []; } return value; };
  const unique = (items, where) => {
    const seen = new Set();
    for (const item of items) {
      if (!isObject(item)) { fail(where, 'Expected object entries'); continue; }
      string(item.id, `${where}.id`);
      if (seen.has(item.id)) fail(`${where}.id`, `Duplicate id: ${item.id}`);
      seen.add(item.id);
    }
  };
  const file = (value, where) => {
    try {
      if (!root) {
        if (!text(value) || /[\\:\u0000-\u001f]/u.test(value) || value.startsWith('/') || value.split('/').some((p) => !p || p === '.' || p === '..')) throw new Error('Expected repository-relative path');
      } else {
        const resolved = repoPath(root, value);
        if (checkFiles && (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())) throw new Error('Referenced file missing');
      }
    } catch (error) { fail(where, error.message); }
  };
  const fps = (value, where) => {
    if (shape(value, ['num', 'den'], where) && !rate(value)) fail(where, 'Expected positive integer num/den');
  };
  if (!shape(plan, ['schemaVersion', 'title', 'revision', 'intent', 'fps', 'totalFrames', 'sources', 'subtitles', 'clips', 'removedRanges', 'broll', 'review'], 'plan')) return { ok: false, errors };
  if (plan.schemaVersion !== 1) fail('schemaVersion', 'Only version 1 is supported');
  string(plan.title, 'title'); string(plan.revision, 'revision');
  if (!['packaging', 'editing-only', 'editing-then-packaging'].includes(plan.intent)) fail('intent', 'Unsupported workflow intent');
  fps(plan.fps, 'fps'); int(plan.totalFrames, 'totalFrames', 1);
  if (shape(plan.review, ['status', 'evidence'], 'review')) {
    if (!['pending', 'approved'].includes(plan.review.status)) fail('review.status', 'Expected pending/approved');
    if (plan.review.status === 'approved') string(plan.review.evidence, 'review.evidence');
    else if (plan.review.evidence !== undefined && typeof plan.review.evidence !== 'string') fail('review.evidence', 'Expected text');
  }
  const sources = list(plan.sources, 'sources'); unique(sources, 'sources');
  const byId = new Map();
  const sourcePaths = new Set();
  for (const source of sources) {
    if (!shape(source, ['id', 'path', 'kind', 'role', 'fps', 'durationFrames', 'width', 'height', 'hasAudio', 'sampleRate', 'durationSamples'], 'source')) continue;
    file(source.path, `source.${source.id}.path`);
    const sourcePathKey = typeof source.path === 'string' ? source.path.toLowerCase() : source.path;
    if (sourcePaths.has(sourcePathKey)) fail('sources', 'One source file must have one identity');
    sourcePaths.add(sourcePathKey);
    byId.set(source.id, source);
    if (source.kind === 'video') {
      if (!['a-roll', 'b-roll'].includes(source.role)) fail(`source.${source.id}.role`, 'Video role must be a-roll/b-roll');
      fps(source.fps, `source.${source.id}.fps`);
      for (const key of ['durationFrames', 'width', 'height']) int(source[key], `source.${source.id}.${key}`, 1);
      if (typeof source.hasAudio !== 'boolean') fail(`source.${source.id}.hasAudio`, 'Expected boolean');
      if (source.sampleRate !== undefined || source.durationSamples !== undefined) fail(`source.${source.id}`, 'Audio-only fields on video source');
    } else if (source.kind === 'audio') {
      if (source.role !== 'voice') fail(`source.${source.id}.role`, 'Audio role must be voice');
      int(source.sampleRate, `source.${source.id}.sampleRate`, 1);
      int(source.durationSamples, `source.${source.id}.durationSamples`, 1);
      if (['fps', 'durationFrames', 'width', 'height', 'hasAudio'].some((key) => source[key] !== undefined)) fail(`source.${source.id}`, 'Video-only fields on audio source');
    } else fail(`source.${source.id}.kind`, 'Expected video/audio');
  }
  const subtitles = list(plan.subtitles, 'subtitles');
  const subtitleIds = new Set();
  for (const sub of subtitles) {
    if (!shape(sub, ['sourceId', 'originalPath', 'correctedPath', 'correctionLogPath', 'correctedSha256', 'unresolvedCount'], 'subtitle')) continue;
    if (byId.get(sub.sourceId)?.role !== 'a-roll') fail('subtitle.sourceId', 'Must reference a-roll');
    if (subtitleIds.has(sub.sourceId)) fail('subtitles', 'Duplicate subtitle source');
    subtitleIds.add(sub.sourceId);
    for (const key of ['originalPath', 'correctedPath', 'correctionLogPath']) file(sub[key], `subtitle.${key}`);
    if (typeof sub.originalPath === 'string' && typeof sub.correctedPath === 'string' && sub.originalPath.toLowerCase() === sub.correctedPath.toLowerCase()) fail('subtitle', 'Original and corrected files must be separate');
    if (typeof sub.correctedPath !== 'string' || !/\.srt$/i.test(sub.correctedPath)) fail('subtitle.correctedPath', 'Version 1 accepts UTF-8 SRT only; explicitly convert other formats first');
    if (!/^[a-f0-9]{64}$/.test(sub.correctedSha256 || '')) fail('subtitle.correctedSha256', 'Expected lowercase SHA-256');
    int(sub.unresolvedCount, 'subtitle.unresolvedCount');
    if (checkFiles && root) {
      try {
        if (hash(fs.readFileSync(repoPath(root, sub.correctedPath))) !== sub.correctedSha256) fail('subtitle.correctedSha256', 'Corrected subtitle content changed');
      } catch (error) { fail('subtitle.correctedSha256', error.message); }
    }
  }
  const clips = list(plan.clips, 'clips'); unique(clips, 'clips');
  if (!clips.length) fail('clips', 'At least one a-roll clip is required');
  const sourceRange = (item, role, where) => {
    const source = byId.get(item.sourceId);
    if (source?.kind !== 'video' || source.role !== role) { fail(where, `Expected ${role} video source`); return null; }
    int(item.inFrame, `${where}.inFrame`); int(item.outFrame, `${where}.outFrame`, 1);
    if (!(item.inFrame < item.outFrame && item.outFrame <= source.durationFrames)) fail(where, 'Invalid or out-of-bounds [inFrame,outFrame)');
    if (!equalRate(source.fps, plan.fps)) fail(where, 'Version 1 requires identical frame rates; no implicit retiming');
    return source;
  };
  const timelineRange = (item, where) => {
    int(item.atFrame, `${where}.atFrame`);
    if (item.atFrame + item.outFrame - item.inFrame > plan.totalFrames) fail(where, 'Timeline range exceeds totalFrames');
  };
  const sorted = clips.filter(isObject).slice().sort((a, b) => a.atFrame - b.atFrame);
  let cursor = 0;
  for (const clip of sorted) {
    if (!shape(clip, ['id', 'sourceId', 'inFrame', 'outFrame', 'atFrame', 'reason', 'audio'], 'clip')) continue;
    const source = sourceRange(clip, 'a-roll', `clip.${clip.id}`);
    timelineRange(clip, `clip.${clip.id}`); string(clip.reason, `clip.${clip.id}.reason`);
    if (clip.atFrame !== cursor) fail(`clip.${clip.id}.atFrame`, 'A-roll must be contiguous without gaps/overlaps');
    cursor = clip.atFrame + clip.outFrame - clip.inFrame;
    if (!subtitleIds.has(clip.sourceId)) fail(`clip.${clip.id}`, 'Missing authoritative source subtitles');
    if (shape(clip.audio, ['kind', 'sourceId', 'inSample', 'alignmentEvidence'], `clip.${clip.id}.audio`)) {
      if (clip.audio.kind === 'embedded') {
        if (!source?.hasAudio) fail(`clip.${clip.id}.audio`, 'Embedded audio is absent');
        if (['sourceId', 'inSample', 'alignmentEvidence'].some((key) => clip.audio[key] !== undefined)) fail(`clip.${clip.id}.audio`, 'Embedded audio follows the same fixed video source range');
      } else if (clip.audio.kind === 'external') {
        const audio = byId.get(clip.audio.sourceId);
        if (audio?.kind !== 'audio' || audio.role !== 'voice') fail(`clip.${clip.id}.audio`, 'Must reference a voice audio source');
        int(clip.audio.inSample, `clip.${clip.id}.audio.inSample`);
        string(clip.audio.alignmentEvidence, `clip.${clip.id}.audio.alignmentEvidence`);
        if (audio && rate(plan.fps) && integer(clip.audio.inSample) && integer(clip.outFrame) && integer(clip.inFrame) && clip.outFrame > clip.inFrame && integer(audio.sampleRate, 1) && integer(audio.durationSamples, 1)) {
          const numerator = BigInt(clip.outFrame - clip.inFrame) * BigInt(plan.fps.den) * BigInt(audio.sampleRate);
          const samples = (numerator + BigInt(plan.fps.num) - 1n) / BigInt(plan.fps.num);
          if (BigInt(clip.audio.inSample) + samples > BigInt(audio.durationSamples)) fail(`clip.${clip.id}.audio`, 'External audio is too short');
        }
      } else fail(`clip.${clip.id}.audio.kind`, 'Expected embedded/external; exactly one voice source per clip');
    }
  }
  if (cursor !== plan.totalFrames) fail('totalFrames', 'Must equal the contiguous a-roll length');
  const removed = list(plan.removedRanges, 'removedRanges');
  for (const item of removed) {
    if (!shape(item, ['sourceId', 'inFrame', 'outFrame', 'reason', 'evidence'], 'removedRange')) continue;
    sourceRange(item, 'a-roll', 'removedRange'); string(item.reason, 'removedRange.reason'); string(item.evidence, 'removedRange.evidence');
  }
  // Every frame of each used a-roll source is retained or explicitly discarded.
  for (const id of new Set(sorted.map((clip) => clip.sourceId))) {
    const source = byId.get(id);
    if (!source || !integer(source.durationFrames, 1)) continue;
    const kept = sorted.filter((clip) => clip.sourceId === id).map((clip) => ({ start: clip.inFrame, end: clip.outFrame }));
    const discarded = removed.filter((item) => item?.sourceId === id).map((item) => ({ start: item.inFrame, end: item.outFrame }));
    for (const range of discarded) if (kept.some((keep) => intersects(range, keep))) fail('removedRanges', 'Removed range overlaps retained material');
    const discardSorted = discarded.slice().sort((a, b) => a.start - b.start);
    for (let i = 1; i < discardSorted.length; i++) if (intersects(discardSorted[i - 1], discardSorted[i])) fail('removedRanges', 'Overlapping removal decisions');
    let covered = 0;
    for (const range of [...kept, ...discarded].sort((a, b) => a.start - b.start)) {
      if (range.start > covered) fail(`source.${id}`, 'Unexplained discarded frames; add a removal decision');
      covered = Math.max(covered, range.end);
    }
    if (covered !== source.durationFrames) fail(`source.${id}`, 'Source tail is neither retained nor explicitly discarded');
  }
  const broll = list(plan.broll, 'broll'); unique(broll, 'broll');
  const bRanges = [];
  for (const item of broll) {
    if (!shape(item, ['id', 'sourceId', 'inFrame', 'outFrame', 'atFrame', 'reason', 'audio', 'burnedInSubtitles', 'roi'], 'broll')) continue;
    const source = sourceRange(item, 'b-roll', `broll.${item.id}`);
    timelineRange(item, `broll.${item.id}`); string(item.reason, `broll.${item.id}.reason`);
    if (item.audio !== 'muted') fail(`broll.${item.id}.audio`, 'Version 1 only supports muted b-roll; voice remains unique');
    if (typeof item.burnedInSubtitles !== 'boolean') fail(`broll.${item.id}.burnedInSubtitles`, 'Explicit subtitle state required');
    if (item.roi !== undefined && shape(item.roi, ['x', 'y', 'width', 'height'], `broll.${item.id}.roi`)) {
      int(item.roi.x, 'roi.x'); int(item.roi.y, 'roi.y'); int(item.roi.width, 'roi.width', 1); int(item.roi.height, 'roi.height', 1);
      if (source && (item.roi.x + item.roi.width > source.width || item.roi.y + item.roi.height > source.height)) fail('roi', 'ROI exceeds source pixels');
    }
    const range = { start: item.atFrame, end: item.atFrame + item.outFrame - item.inFrame };
    if (bRanges.some((existing) => intersects(existing, range))) fail('broll', 'Version 1 supports one non-overlapping b-roll track');
    bRanges.push(range);
  }
  return { ok: errors.length === 0, errors };
}

function mapTimeline(plan) {
  const validation = validatePlan(plan);
  if (!validation.ok) throw new Error(JSON.stringify(validation.errors));
  return plan.clips.slice().sort((a, b) => a.atFrame - b.atFrame).map((clip) => ({
    clipId: clip.id, sourceId: clip.sourceId,
    sourceStartFrame: clip.inFrame, sourceEndFrame: clip.outFrame,
    timelineStartFrame: clip.atFrame, timelineEndFrame: clip.atFrame + clip.outFrame - clip.inFrame,
    offsetFrames: clip.atFrame - clip.inFrame,
    audio: structuredClone(clip.audio),
  }));
}

module.exports = { hash, repoPath, validatePlan, mapTimeline };
