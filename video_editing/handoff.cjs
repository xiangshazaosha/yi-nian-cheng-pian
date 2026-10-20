// Only locked, actually reviewed final-timeline media reaches Remotion planning.
const fs = require('node:fs');
const path = require('node:path');
const { parseSrt } = require('../scripts/editing/subtitles.cjs');
const { ROOT, repoPath, json, fileHash, relative, mediaProbe, writeNew, args } = require('./common.cjs');
async function handoff({ video, srt, evidence, output, root = ROOT, probe = mediaProbe }) {
  const v = repoPath(root, video); const s = repoPath(root, srt); const e = json(repoPath(root, evidence));
  const target = repoPath(root, output);
  if (!video.startsWith('remotion-clone/public/')) throw new Error('Locked video must be in Remotion public assets');
  const media = probe(v); const cues = parseSrt(fs.readFileSync(s));
  const videoSha256 = await fileHash(v); const subtitleSha256 = await fileHash(s);
  if (!media.hasAudio || cues.at(-1).endMs > media.duration * 1000 + 50) throw new Error('Missing speech audio or final SRT exceeds the locked video');
  if (e.videoSha256 !== videoSha256 || e.subtitleSha256 !== subtitleSha256) throw new Error('Review evidence is stale or belongs to a different export');
  if (e.timelineLocked !== true || e.unresolvedCount !== 0 || typeof e.reviewEvidence !== 'string' || !e.reviewEvidence.trim()) throw new Error('Locked timeline, zero unresolved items and review evidence are required');
  if (!Array.isArray(e.burnedSubtitleRanges)) throw new Error('Explicit verified burned-subtitle ranges required (empty array if none)');
  let end = 0;
  for (const r of e.burnedSubtitleRanges) {
    if (![r.start, r.end].every(Number.isFinite) || r.start < end || r.end <= r.start || r.end > media.duration) throw new Error('Invalid final-timeline burned-subtitle range');
    end = r.end;
  }
  const result = { phase: 'locked-media-for-packaging-planning', video, subtitles: srt,
    videoSha256, subtitleSha256, fps: media.fps, duration: media.duration, totalFrames: media.frames,
    evidence, burnedSubtitleRanges: e.burnedSubtitleRanges,
    readyForPackagingPlanning: true, fullRenderAuthorized: false,
    nextAction: 'Read existing packaging route; correct subtitles, show inspected representative stills, await the existing confirmation gate before full render.' };
  writeNew(target, result);
  return { saved: relative(target, root), readyForPackagingPlanning: true, fullRenderAuthorized: false };
}
if (require.main === module) {
  const a = args(process.argv.slice(2));
  if (Object.keys(a).some(k => !['video', 'srt', 'evidence', 'output'].includes(k)) || !['video', 'srt', 'evidence', 'output'].every(k => typeof a[k] === 'string')) { console.error('Usage: handoff.cjs --video REPO_PATH --srt REPO_PATH --evidence REPO_PATH --output REPO_PATH'); process.exitCode = 1; }
  else handoff(a).then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { handoff };
