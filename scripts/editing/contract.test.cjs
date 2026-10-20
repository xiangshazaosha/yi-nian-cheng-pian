const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { hash, repoPath, validatePlan, mapTimeline } = require('./contract.cjs');
const { parseSrt, remapSubtitles, serializeSrt } = require('./subtitles.cjs');
const { prepareArtifacts, writeArtifacts, main } = require('./cli.cjs');

// Synthetic fixtures only. No production footage or project is touched.
function plan() {
  return { schemaVersion: 1, title: '测试片', revision: 'test-revision', intent: 'editing-then-packaging',
    fps: { num: 30, den: 1 }, totalFrames: 120,
    sources: [{ id: 'a1', path: '原创视频/test/a.mp4', kind: 'video', role: 'a-roll', fps: { num: 30, den: 1 }, durationFrames: 150, width: 1920, height: 1080, hasAudio: true }],
    subtitles: [{ sourceId: 'a1', originalPath: '原创视频/test/original.srt', correctedPath: '原创视频/test/corrected.srt', correctionLogPath: '原创视频/test/corrections.json', correctedSha256: 'a'.repeat(64), unresolvedCount: 0 }],
    clips: [{ id: 'c1', sourceId: 'a1', inFrame: 0, outFrame: 60, atFrame: 0, reason: '保留前句', audio: { kind: 'embedded' } },
      { id: 'c2', sourceId: 'a1', inFrame: 90, outFrame: 150, atFrame: 60, reason: '保留后句', audio: { kind: 'embedded' } }],
    removedRanges: [{ sourceId: 'a1', inFrame: 60, outFrame: 90, reason: '删重复句', evidence: '测试音频边界占位，非实际素材验收' }],
    broll: [], review: { status: 'pending' } };
}
function cue(cueId, startMs, endMs, text = '原文，不能概括。') { return { cueId, startMs, endMs, text }; }
function remap(p, cues) { return remapSubtitles(p, { a1: cues }); }
function temp(t) {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'video-edit-contract-'));
  t.after(() => {
    // Verify the absolute, explicitly created test directory before recursive cleanup.
    assert.equal(path.dirname(root), base);
    assert.ok(path.basename(root).startsWith('video-edit-contract-'));
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function fixture(t) {
  const root = temp(t); const p = plan();
  const srt = serializeSrt([cue('1', 0, 1000), cue('2', 2100, 2500, '删除的句子'), cue('3', 3100, 4500, '后句\n第二行')]);
  p.subtitles[0].correctedSha256 = hash(srt);
  for (const relative of ['原创视频/test/a.mp4', p.subtitles[0].originalPath, p.subtitles[0].correctedPath, p.subtitles[0].correctionLogPath]) {
    const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, relative.endsWith('.srt') ? srt : relative.endsWith('.json') ? '{}' : 'synthetic-not-video');
  }
  const dir = path.join(root, 'remotion-clone/review/workflow-flash', p.title);
  fs.mkdirSync(dir, { recursive: true });
  const planPath = `remotion-clone/review/workflow-flash/${p.title}/edit-plan.json`;
  fs.writeFileSync(path.join(root, planPath), JSON.stringify(p));
  return { root, p, srt, dir, planPath };
}

test('validate a contiguous edit with explicit removal evidence', () => { assert.deepEqual(validatePlan(plan()), { ok: true, errors: [] }); });
test('derive source-to-timeline mapping without modifying plan', () => {
  const p = plan(); const before = JSON.stringify(p); const mapping = mapTimeline(p);
  assert.equal(mapping[1].offsetFrames, -30); assert.equal(mapping[1].timelineEndFrame, 120); assert.equal(JSON.stringify(p), before);
});
test('remove a full cue and shift later subtitles, preserving multiline text', () => {
  const out = remap(plan(), [cue('1', 0, 1000), cue('2', 2100, 2500), cue('3', 3100, 4500, '后句\n第二行')]);
  assert.equal(out.ok, true); assert.equal(out.removed.length, 1); assert.equal(out.cues[1].startMs, 2100); assert.equal(out.cues[1].endMs, 3500);
  assert.equal(out.cues[1].text, '后句\n第二行'); assert.equal(parseSrt(serializeSrt(out.cues))[1].text, '后句\n第二行');
});
test('reorder sentences using each clip mapping, never one global offset', () => {
  const p = plan(); p.clips[0].atFrame = 60; p.clips[1].atFrame = 0;
  const out = remap(p, [cue('1', 0, 1000, '前句'), cue('2', 3100, 4500, '后句')]);
  assert.equal(out.ok, true); assert.deepEqual(out.cues.map((c) => [c.text, c.startMs]), [['后句', 100], ['前句', 2000]]);
});
test('a cue crossing a real cut is unresolved, not word-truncated', () => {
  const out = remap(plan(), [cue('1', 1800, 3200)]); assert.equal(out.ok, false); assert.equal(out.cues.length, 0); assert.equal(out.unresolved.length, 2);
});
test('merge adjacent source/timeline runs so segment division does not split a cue', () => {
  const p = plan(); p.sources[0].durationFrames = 120; p.clips[1].inFrame = 60; p.clips[1].outFrame = 120; p.removedRanges = [];
  const out = remap(p, [cue('1', 1800, 2200)]); assert.equal(out.ok, true); assert.equal(out.cues.length, 1); assert.equal(out.cues[0].clipIds.length, 2);
});
test('rational frame rates and millisecond rounding use exact integer arithmetic', () => {
  const p = plan(); p.fps = p.sources[0].fps = { num: 30000, den: 1001 };
  const out = remap(p, [cue('1', 3100, 4500)]); assert.equal(out.ok, true); assert.equal(out.cues[0].startMs, 2099); assert.equal(out.cues[0].endMs, 3499);
});
test('repeated approved material yields two separately mapped captions', () => {
  const p = plan(); p.clips[1].inFrame = 0; p.clips[1].outFrame = 60; p.removedRanges[0].inFrame = 60; p.removedRanges[0].outFrame = 150;
  const out = remap(p, [cue('1', 0, 1000)]); assert.equal(out.ok, true); assert.deepEqual(out.cues.map((c) => c.startMs), [0, 2000]);
});
test('reject empty source correction state and cues beyond source duration', () => {
  const p = plan(); p.subtitles[0].unresolvedCount = 1; assert.equal(remap(p, [cue('1', 0, 1000)]).ok, false);
  p.subtitles[0].unresolvedCount = 0; assert.equal(remap(p, [cue('1', 4900, 5100)]).ok, false);
});
test('reject timeline gaps, overlaps, mismatched fps and unknown fields', () => {
  for (const mutate of [p => p.clips[1].atFrame = 61, p => p.clips[1].atFrame = 59, p => p.sources[0].fps.num = 25, p => p.clips[0].speed = 2]) {
    const p = plan(); mutate(p); assert.equal(validatePlan(p).ok, false);
  }
});
test('reject unexplained deletions and deletions that overlap retained frames', () => {
  const p = plan(); p.removedRanges = []; assert.equal(validatePlan(p).ok, false);
  p.removedRanges = [{ sourceId: 'a1', inFrame: 50, outFrame: 90, reason: '删除', evidence: '对齐证据' }]; assert.equal(validatePlan(p).ok, false);
});
test('external voice uses explicit sample offset and sufficient duration', () => {
  const p = plan(); p.sources.push({ id: 'voice', path: '原创视频/test/voice.wav', kind: 'audio', role: 'voice', sampleRate: 48000, durationSamples: 240000 });
  p.clips[1].audio = { kind: 'external', sourceId: 'voice', inSample: 144000, alignmentEvidence: '对照波形' };
  assert.equal(validatePlan(p).ok, true); p.clips[1].audio.inSample++; assert.equal(validatePlan(p).ok, false);
});
test('b-roll checks source ROI and placement; audible b-roll is not silently accepted', () => {
  const p = plan(); p.sources.push({ id: 'b1', path: '原创视频/test/b.mp4', kind: 'video', role: 'b-roll', fps: p.fps, durationFrames: 60, width: 100, height: 100, hasAudio: true });
  p.broll.push({ id: 'bclip', sourceId: 'b1', inFrame: 0, outFrame: 30, atFrame: 30, reason: '展示操作', audio: 'muted', burnedInSubtitles: true, roi: { x: 10, y: 10, width: 80, height: 80 } });
  assert.equal(validatePlan(p).ok, true); p.broll[0].roi.width = 100; assert.equal(validatePlan(p).ok, false);
  p.broll[0].roi.width = 80; p.broll[0].audio = 'source'; assert.equal(validatePlan(p).ok, false);
});
test('SRT decoding rejects GBK/invalid UTF-8, malformed ids/times and overlaps', () => {
  assert.throws(() => parseSrt(Buffer.from([0xff, 0xfe])));
  assert.throws(() => parseSrt('1\n00:60:00,000 --> 00:60:01,000\n错误'));
  assert.throws(() => parseSrt('x\n00:00:00,000 --> 00:00:01,000\n错误'));
  assert.throws(() => parseSrt(serializeSrt([cue('1', 0, 1000), cue('2', 500, 1500)])));
  assert.equal(parseSrt(Buffer.from('\uFEFF1\r\n00:00:00,000 --> 00:00:01,000\r\n中文\r\n'))[0].text, '中文');
});
test('SRT remapping preserves spoken text whitespace as well as multiline text', () => {
  const source = '\n1\r\n00:00:00,000 --> 00:00:01,000\r\n  原句  \r\n第二行  \r\n\r\n';
  const parsed = parseSrt(Buffer.from(source)); assert.equal(parsed[0].text, '  原句  \n第二行  ');
  const out = remap(plan(), parsed); assert.equal(parseSrt(serializeSrt(out.cues))[0].text, parsed[0].text);
});
test('one physical input cannot be registered twice and original subtitles stay distinct', () => {
  const p = plan(); p.sources.push({ ...p.sources[0], id: 'a2' }); assert.equal(validatePlan(p).ok, false);
  p.sources.pop(); p.subtitles[0].originalPath = p.subtitles[0].correctedPath; assert.equal(validatePlan(p).ok, false);
});
test('source audio absence, missing subtitle binding and B-roll overlaps are explicit errors', () => {
  let p = plan(); p.sources[0].hasAudio = false; assert.equal(validatePlan(p).ok, false);
  p = plan(); p.subtitles = []; assert.equal(validatePlan(p).ok, false);
  p = plan(); p.sources.push({ id: 'b1', path: '原创视频/test/b.mp4', kind: 'video', role: 'b-roll', fps: p.fps, durationFrames: 60, width: 100, height: 100, hasAudio: false });
  const b = { id: 'b', sourceId: 'b1', inFrame: 0, outFrame: 30, atFrame: 0, reason: '操作', audio: 'muted', burnedInSubtitles: false };
  p.broll = [b, { ...b, id: 'b2', atFrame: 15 }]; assert.equal(validatePlan(p).ok, false);
});
test('exclusive batch writes roll back only this batch when a later file cannot be written', (t) => {
  const root = temp(t); fs.mkdirSync(path.join(root, 'data'));
  assert.throws(() => writeArtifacts(root, [{ path: 'data/first.json', content: '{}' }, { path: 'missing/second.json', content: '{}' }]));
  assert.equal(fs.existsSync(path.join(root, 'data/first.json')), false);
});
test('paths reject machine-specific/escaping paths; malformed input yields diagnostics', (t) => {
  const root = temp(t);
  for (const value of ['../outside', 'D:/outside', '/outside', '素材\\file.mp4', '素材/../file.mp4', '素材//file.mp4']) assert.throws(() => repoPath(root, value));
  const p = plan(); p.sources[0].path = 123; p.subtitles[0].correctedPath = 123; assert.equal(validatePlan(p).ok, false);
  assert.equal(validatePlan(null).ok, false);
});
test('prepare writes data-only artifacts; repeat refuses overwrite and preserves original inputs', (t) => {
  const { root, p, srt, dir } = fixture(t);
  const result = prepareArtifacts(p, root); assert.equal(result.ok, true); assert.equal(result.handoff.readyForPackaging, false); assert.equal(result.handoff.mediaValidated, false);
  writeArtifacts(root, result.artifacts); assert.equal(fs.readdirSync(dir).length, 5);
  assert.throws(() => writeArtifacts(root, result.artifacts), /overwrite/);
  assert.equal(fs.readFileSync(path.join(root, p.subtitles[0].originalPath), 'utf8'), srt);
  assert.equal(fs.readFileSync(path.join(root, p.subtitles[0].correctedPath), 'utf8'), srt);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'subtitle-remap-report.json'), 'utf8')).mapping[1].sourceCueId, '3');
});
test('corrected SRT content drift and missing files block preparation', (t) => {
  const { root, p } = fixture(t); fs.appendFileSync(path.join(root, p.subtitles[0].correctedPath), '\n');
  assert.equal(prepareArtifacts(p, root).ok, false); fs.unlinkSync(path.join(root, p.sources[0].path)); assert.equal(validatePlan(p, { root, checkFiles: true }).ok, false);
});
test('unresolved boundary produces no deliverable files', (t) => {
  const { root, p, dir } = fixture(t); const srt = serializeSrt([cue('1', 1800, 3200)]);
  fs.writeFileSync(path.join(root, p.subtitles[0].correctedPath), srt); p.subtitles[0].correctedSha256 = hash(srt);
  const result = prepareArtifacts(p, root); assert.equal(result.ok, false); assert.equal(result.artifacts, undefined); assert.deepEqual(fs.readdirSync(dir), ['edit-plan.json']);
});
test('burned-in subtitle coverage is handed off without deleting authoritative voice captions', (t) => {
  const { root, p } = fixture(t);
  p.sources.push({ id: 'b1', path: '原创视频/test/b.mp4', kind: 'video', role: 'b-roll', fps: p.fps, durationFrames: 30, width: 1920, height: 1080, hasAudio: false });
  fs.writeFileSync(path.join(root, p.sources[1].path), 'synthetic');
  p.broll.push({ id: 'b', sourceId: 'b1', inFrame: 0, outFrame: 30, atFrame: 0, reason: '操作', audio: 'muted', burnedInSubtitles: true });
  const result = prepareArtifacts(p, root); const map = JSON.parse(result.artifacts[0].content);
  assert.deepEqual(map.subtitleSuppressionRanges, [{ brollId: 'b', startFrame: 0, endFrame: 30 }]); assert.equal(result.report.cueCount, 2);
});
test('CLI validation is read-only and only accepts the single-title plan location', (t) => {
  const { root, dir, planPath, p } = fixture(t);
  assert.equal(main(['validate', planPath], root), 0); assert.deepEqual(fs.readdirSync(dir), ['edit-plan.json']);
  fs.writeFileSync(path.join(dir, 'other.json'), JSON.stringify(p));
  assert.throws(() => main(['validate', planPath.replace('edit-plan.json', 'other.json')], root), /single-title/);
});
test('CLI preparation creates the four data outputs, never a rendered video or final package', (t) => {
  const { root, dir, planPath } = fixture(t);
  assert.equal(main(['prepare', planPath], root), 0);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['captions-edited.srt', 'edit-plan.json', 'editing-handoff.json', 'editing-map.json', 'subtitle-remap-report.json']);
  assert.equal(fs.existsSync(path.join(root, 'deliverables')), false);
  assert.throws(() => main(['prepare', planPath], root), /overwrite/);
});
test('a junction cannot redirect file access or output outside the repository', (t) => {
  const root = temp(t); const outside = temp(t);
  fs.symlinkSync(outside, path.join(root, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => repoPath(root, 'redirect/output.json'), /outside repository/);
});
test('missing and wrong-typed fields yield diagnostic failures instead of validator exceptions', () => {
  const locations = [[], ['sources', 0], ['subtitles', 0], ['clips', 0], ['clips', 0, 'audio'], ['removedRanges', 0], ['review']];
  const values = [null, [], {}, 0, 'wrong'];
  for (const location of locations) for (const value of values) {
    const p = plan();
    if (!location.length) { assert.equal(validatePlan(value).ok, false); continue; }
    let parent = p;
    for (const key of location.slice(0, -1)) parent = parent[key];
    parent[location.at(-1)] = value;
    assert.equal(validatePlan(p).ok, false);
  }
});
