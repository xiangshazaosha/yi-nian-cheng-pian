const { TextDecoder } = require('node:util');
const { mapTimeline } = require('./contract.cjs');

function parseSrt(bytes) {
  const value = Buffer.isBuffer(bytes) || bytes instanceof Uint8Array
    ? new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    : String(bytes);
  // Normalize line endings, not spoken text or its whitespace.
  const normalized = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');
  if (!normalized || normalized.includes('\uFFFD')) throw new Error('Empty or invalid UTF-8 SRT');
  const ids = new Set();
  const stamp = (s) => {
    const match = /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(s);
    if (!match) throw new Error(`Invalid SRT timestamp: ${s}`);
    const result = Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(match[4]);
    if (!Number.isSafeInteger(result)) throw new Error('SRT timestamp exceeds safe range');
    return result;
  };
  let previousEnd = 0;
  return normalized.split(/\n[ \t]*\n+/).map((block) => {
    const lines = block.split('\n');
    if (!/^\d+$/.test(lines[0]) || ids.has(lines[0])) throw new Error('Cue id must be numeric and unique');
    ids.add(lines[0]);
    const match = /^(\S+)\s+-->\s+(\S+)$/.exec(lines[1] || '');
    if (!match || !lines.slice(2).join('\n').trim()) throw new Error(`Malformed cue ${lines[0]}`);
    const startMs = stamp(match[1]); const endMs = stamp(match[2]);
    if (startMs >= endMs || startMs < previousEnd) throw new Error(`Invalid/overlapping cue ${lines[0]}`);
    previousEnd = endMs;
    return { cueId: lines[0], startMs, endMs, text: lines.slice(2).join('\n') };
  });
}

function remapSubtitles(plan, cuesBySource) {
  const map = mapTimeline(plan);
  const runs = [];
  // Adjacent source/timeline ranges are one continuous mapping, not a word cut.
  for (const item of map) {
    const last = runs.at(-1);
    if (last && last.sourceId === item.sourceId && last.sourceEndFrame === item.sourceStartFrame && last.timelineEndFrame === item.timelineStartFrame) {
      last.sourceEndFrame = item.sourceEndFrame; last.timelineEndFrame = item.timelineEndFrame; last.clipIds.push(item.clipId);
    } else runs.push({ ...item, clipIds: [item.clipId] });
  }
  const n = BigInt(plan.fps.num); const frameUnit = BigInt(plan.fps.den) * 1000n;
  const roundRatio = (value) => Number((value + n / 2n) / n);
  const cues = []; const removed = []; const unresolved = [];
  const sources = new Map(plan.sources.map((source) => [source.id, source]));
  for (const sub of plan.subtitles) {
    if (sub.unresolvedCount !== 0) unresolved.push({ sourceId: sub.sourceId, reason: 'Source subtitle corrections are unresolved', count: sub.unresolvedCount });
    const sourceCues = cuesBySource[sub.sourceId];
    if (!Array.isArray(sourceCues)) throw new Error(`Missing parsed subtitles for ${sub.sourceId}`);
    const sourceRuns = runs.filter((run) => run.sourceId === sub.sourceId);
    // An indexed but unused candidate source is not part of this edit.
    if (!sourceRuns.length) continue;
    for (const cue of sourceCues) {
      const start = BigInt(cue.startMs) * n; const end = BigInt(cue.endMs) * n;
      if (end > BigInt(sources.get(sub.sourceId).durationFrames) * frameUnit) {
        unresolved.push({ sourceId: sub.sourceId, cueId: cue.cueId, reason: 'Cue exceeds source duration' }); continue;
      }
      const overlapping = sourceRuns.filter((run) => start < BigInt(run.sourceEndFrame) * frameUnit && BigInt(run.sourceStartFrame) * frameUnit < end);
      if (!overlapping.length) { removed.push({ sourceId: sub.sourceId, cueId: cue.cueId, reason: 'Entire cue removed with source material' }); continue; }
      for (const run of overlapping) {
        if (start < BigInt(run.sourceStartFrame) * frameUnit || end > BigInt(run.sourceEndFrame) * frameUnit) {
          unresolved.push({ sourceId: sub.sourceId, cueId: cue.cueId, clipIds: run.clipIds, reason: 'Cue crosses a cut/reorder boundary; verify audio and revise the approved source timeline, never guess or truncate words' }); continue;
        }
        const offset = BigInt(run.offsetFrames) * frameUnit;
        cues.push({ sourceId: sub.sourceId, sourceCueId: cue.cueId, clipIds: run.clipIds,
          sourceStartMs: cue.startMs, sourceEndMs: cue.endMs,
          startMs: roundRatio(start + offset), endMs: roundRatio(end + offset), text: cue.text });
      }
    }
  }
  cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].startMs >= cues[i].endMs || (i && cues[i].startMs < cues[i - 1].endMs)) unresolved.push({ sourceId: cues[i].sourceId, cueId: cues[i].sourceCueId, reason: 'Mapped subtitle interval is empty/overlapping' });
  }
  return { ok: unresolved.length === 0, cues, removed, unresolved };
}

function serializeSrt(cues) {
  const stamp = (ms) => {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('Invalid output timestamp');
    const pad = (v, width) => String(v).padStart(width, '0');
    return `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor(ms / 60000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)},${pad(ms % 1000, 3)}`;
  };
  return cues.length ? cues.map((cue, i) => `${i + 1}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n${cue.text}`).join('\n\n') + '\n' : '';
}

module.exports = { parseSrt, remapSubtitles, serializeSrt };
