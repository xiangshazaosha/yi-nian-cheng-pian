const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { digest, ROOT } = require('./common.cjs');
const { compile } = require('./editing.cjs');
const { samplingFrames, pageSamples, prepare, refine, mergeBatches, validateReview, buildPlan, assembleVlog } = require('./visual_workflow.cjs');
const metadata = (frames = 600) => ({ frames, duration: frames / 30, fps: { num: 30, den: 1 }, nominalRate: '30/1', width: 320, height: 180, hasAudio: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const put = (p, v) => fs.writeFileSync(path.join(root, p), typeof v === 'string' ? v : JSON.stringify(v));
  const hash = p => digest(fs.readFileSync(path.join(root, p)));
  for (const p of ['speech.mp4', 'broll海.mp4', 'old.mp4', 'frame.jpg']) put(p, `fixture ${p}`);
  const base = { source: 'speech.mp4', cuts: [], broll: [{ source: 'old.mp4', start: 6, end: 7, reason: 'Existing approved overlay' }] };
  put('base.json', base); put('captions-edited.srt', '1\n00:00:00,000 --> 00:00:10,000\n浪拍到礁石上。\n');
  const compiled = compile(base, metadata(300), { 'old.mp4': metadata() }, root);
  const spec = { plan: 'base.json', planSha256: hash('base.json'), source: base.source, sources: [{ path: base.source, sha256: hash(base.source) }, { path: 'old.mp4', sha256: hash('old.mp4') }], ...compiled,
    subtitles: 'captions-edited.srt', subtitleSha256: hash('captions-edited.srt'), mediaValidated: false };
  put('prepared.json', spec);
  const manifest = { kind: 'visual-evidence-batch-v1', mode: 'broll', sources: [{ id: 'v1', source: 'broll海.mp4', sha256: hash('broll海.mp4'), meta: metadata() }],
    samples: [{ id: 'v1-f60', sourceId: 'v1', frameIndex: 60, image: 'frame.jpg', imageSha256: hash('frame.jpg') }] };
  put('manifest.json', manifest);
  const review = { schemaVersion: 1, manifestSha256: hash('manifest.json'), preparedSha256: hash('prepared.json'), subtitleSha256: spec.subtitleSha256,
    selections: [{ id: 'wave', sourceId: 'v1', startFrame: 60, endFrame: 210, evidenceSampleIds: ['v1-f60'], description: 'Wave hits rock', reason: 'Observed action', burnedInSubtitles: false,
      dynamicReview: { startFrame: 30, endFrame: 240, evidence: 'Fixture declaration, NOT actual perceptual review' } }],
    placements: [{ selectionId: 'wave', start: 2, end: 4, cueIds: ['1'], reason: 'Matches the spoken action' }] };
  put('review.json', review);
  return { root, put, hash, base, spec, manifest, review,
    options: { root, probe: p => metadata(path.basename(p) === 'speech.mp4' ? 300 : 600) },
    args: { manifest: 'manifest.json', review: 'review.json', prepared: 'prepared.json', output: 'out', 'review-only': true } };
}
test('sampling covers first/last frame without truncation; batches expose remaining work', () => {
  assert.deepEqual(samplingFrames(metadata(601), 10), [0, 300, 600]);
  assert.deepEqual(samplingFrames(metadata(620), 10), [0, 300, 600, 619]);
  const p = pageSamples([{ id: 'v1', meta: metadata(620) }], 10, 1, 2);
  assert.deepEqual(p.chosen.map(s => s.frameIndex), [600, 619]); assert.equal(p.total, 4); assert.equal(p.batchCount, 2);
  assert.throws(() => samplingFrames(metadata(), 0)); assert.throws(() => pageSamples([{ id: 'v1', meta: metadata() }], 10, 9, 1));
});
test('unmarked speech is skipped before decoding/hashing/output creation', async t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.root, 'speech')); f.put('speech/DJI01.mp4', 'not even valid media');
  let calls = 0;
  const r = await prepare({ input: 'speech', output: 'out', mode: 'broll' }, { root: f.root, probe: () => { calls++; throw Error(); }, extract: () => { calls++; } });
  assert.equal(r.status, 'skipped-no-broll'); assert.equal(calls, 0); assert.equal(fs.existsSync(path.join(f.root, 'out')), false);
});
test('name hints are stored as hints, not inferred content', async t => {
  const f = fixture(t);
  const r = await prepare({ input: 'broll海.mp4', output: 'out', mode: 'broll' }, { root: f.root, probe: () => metadata(31),
    extract: async (sources, chosen, out) => { fs.mkdirSync(out); return []; } });
  const m = JSON.parse(fs.readFileSync(path.join(f.root, r.manifest), 'utf8'));
  assert.equal(m.sources[0].nameHint, 'broll海'); assert.equal(m.sources[0].nameIsContentProof, false);
  assert.equal(m.visualUnderstandingCompleted, false);
});
test('reviewed ranges must bind real samples and a dynamic review declaration', t => {
  const f = fixture(t); validateReview(f.manifest, f.review);
  delete f.review.selections[0].dynamicReview; assert.throws(() => validateReview(f.manifest, f.review), /Dynamic review/);
});
test('unrelated-source evidence rejected', t => {
  const f = fixture(t); f.review.selections[0].sourceId = 'missing';
  assert.throws(() => validateReview(f.manifest, f.review), /source range/);
});
test('reviewed source selection becomes existing public broll fields; preserves prior overlay', async t => {
  const f = fixture(t), r = await buildPlan(f.args, f.options), p = JSON.parse(fs.readFileSync(path.join(f.root, r.plan), 'utf8'));
  assert.deepEqual(p.broll[0], f.base.broll[0]); assert.equal(p.broll[1].source_start, 2); assert.equal(p.broll[1].start, 2); assert.equal(p.broll[1].end, 4);
  assert.equal(p.broll[1].burned_in_subtitles, false); assert.equal(r.readyForPackaging, false);
  assert.equal(fs.readFileSync(path.join(f.root, 'base.json'), 'utf8'), JSON.stringify(f.base));
  await assert.rejects(buildPlan(f.args, f.options), /overwrite/);
});
for (const p of ['broll海.mp4', 'speech.mp4', 'old.mp4', 'frame.jpg', 'base.json', 'captions-edited.srt']) {
  test(`changed bound input is blocked: ${p}`, async t => {
    const f = fixture(t); f.put(p, 'changed'); await assert.rejects(buildPlan(f.args, f.options));
    assert.equal(fs.existsSync(path.join(f.root, 'out')), false);
  });
}
test('SRT-window mismatch is blocked rather than placing by raw transcript time', async t => {
  const f = fixture(t); f.review.placements[0].start = 20; f.review.placements[0].end = 22; f.put('review.json', f.review);
  await assert.rejects(buildPlan(f.args, f.options), /SRT window/);
});
test('insufficient selected duration never extends, loops or retimes source', async t => {
  const f = fixture(t); f.review.selections[0].endFrame = 80; f.put('review.json', f.review);
  await assert.rejects(buildPlan(f.args, f.options), /reviewed usable range/);
});
test('new overlap with existing B-roll is blocked', async t => {
  const f = fixture(t); Object.assign(f.review.placements[0], { start: 6, end: 7 }); f.put('review.json', f.review);
  await assert.rejects(buildPlan(f.args, f.options), /non-overlapping/);
});
test('Vlog evidence cannot be silently routed to speech overlay export', async t => {
  const f = fixture(t); f.manifest.mode = 'vlog'; f.put('manifest.json', f.manifest);
  await assert.rejects(buildPlan(f.args, f.options), /Vlog evidence/);
});
test('review/manifest identity mismatch is rejected', async t => {
  const f = fixture(t); f.review.manifestSha256 = 'stale'; f.put('review.json', f.review);
  await assert.rejects(buildPlan(f.args, f.options), /identity mismatch/);
});
test('evidence merge remaps per-file IDs and deduplicates overlapping samples without asserting viewing', async t => {
  const f = fixture(t), second = structuredClone(f.manifest);
  second.sources[0].source = 'old.mp4'; second.sources[0].sha256 = f.hash('old.mp4');
  f.put('second.json', second); f.put('list.json', ['manifest.json', 'second.json', 'manifest.json']);
  const r = await mergeBatches({ manifests: 'list.json', output: 'merged' }, { root: f.root });
  const m = JSON.parse(fs.readFileSync(path.join(f.root, r.manifest), 'utf8'));
  assert.equal(m.sources.length, 2); assert.deepEqual(m.samples.map(s => s.id), ['v1-f60', 'v2-f60']);
  assert.equal(m.visualUnderstandingCompleted, false); assert.equal(m.dynamicReviewCompleted, false);
});
test('evidence merge rejects mixed speech/Vlog modes and changed sample files', async t => {
  const f = fixture(t), second = structuredClone(f.manifest); second.mode = 'vlog';
  f.put('second.json', second); f.put('list.json', ['manifest.json', 'second.json']);
  await assert.rejects(mergeBatches({ manifests: 'list.json', output: 'merged' }, { root: f.root }), /different workflow modes/);
  f.put('list.json', ['manifest.json']); f.put('frame.jpg', 'changed');
  await assert.rejects(mergeBatches({ manifests: 'list.json', output: 'merged' }, { root: f.root }), /sample identity/);
});
test('Vlog assembly rejects an unreviewed range before any draft creation', async t => {
  const f = fixture(t); f.manifest.mode = 'vlog'; f.put('manifest.json', f.manifest);
  f.review.manifestSha256 = f.hash('manifest.json'); f.review.sequence = [{ selectionId: 'wave', sourceEndFrame: 211, reason: 'Too long' }]; f.put('review.json', f.review);
  await assert.rejects(assembleVlog({ manifest: 'manifest.json', review: 'review.json', output: 'out', 'draft-name': 'vlog', 'review-only': true }, f.options), /reviewed usable range/);
  assert.equal(fs.existsSync(path.join(f.root, 'out')), false);
});
test('real synthetic CFR media: accurate selected frames, final batch reaches tail, refinement', async t => {
  const ffmpeg = path.join(ROOT, 'tools/chatcut-runtime/.chatcut/cache/ffmpeg/8.1/win32-x64/ffmpeg.exe');
  const ffprobe = path.join(ROOT, 'remotion-clone/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe');
  if (!fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) { t.skip('Existing project FFmpeg unavailable; no auto-install'); return; }
  const parent = path.join(ROOT, 'remotion-clone/.tmp'); fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'visual-test-'));
  t.after(() => { assert.ok(dir.startsWith(parent + path.sep)); fs.rmSync(dir, { recursive: true }); });
  const source = path.join(dir, 'broll合成.mp4'), relative = p => path.relative(ROOT, p).split(path.sep).join('/');
  const run = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=12', '-t', '3', '-an', '-c:v', 'libx264', source], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  const a = { input: relative(source), mode: 'broll', interval: 0.5, 'batch-size': 4, output: relative(path.join(dir, 'first')) };
  const first = await prepare(a), last = await prepare({ ...a, batch: 1, output: relative(path.join(dir, 'last')) });
  assert.equal(first.batchCount, 2); const m = JSON.parse(fs.readFileSync(path.join(ROOT, last.manifest), 'utf8'));
  assert.equal(m.samples.at(-1).frameIndex, 35); assert.ok(Math.abs(m.samples.at(-1).relativeSeconds - 35 / 12) < 0.001);
  assert.equal(m.visualUnderstandingCompleted, false);
  const refined = await refine({ manifest: last.manifest, source: 'v1', output: relative(path.join(dir, 'fine')), 'start-frame': 12, 'end-frame': 24, interval: 0.25 });
  const fine = JSON.parse(fs.readFileSync(path.join(ROOT, refined.manifest), 'utf8'));
  assert.deepEqual(fine.samples.map(s => s.frameIndex), [12, 15, 18, 21, 23]);
});
test('real synthetic chain: intake naming -> evidence -> SRT-bound plan -> editable Jianying JSON', async t => {
  const ffmpeg = path.join(ROOT, 'tools/chatcut-runtime/.chatcut/cache/ffmpeg/8.1/win32-x64/ffmpeg.exe');
  const backend = path.join(ROOT, 'tools/jianying-draft/runtime/pyJianYingDraft/script_file.py');
  if (!fs.existsSync(ffmpeg) || !fs.existsSync(backend)) { t.skip('Existing optional file runtime unavailable; no installation'); return; }
  const parent = path.join(ROOT, 'remotion-clone/.tmp'); fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'visual-chain-')), name = path.basename(dir) + '.mp4';
  const inbox = path.join(ROOT, 'asr-inbox', name); fs.mkdirSync(inbox);
  t.after(() => { assert.ok(dir.startsWith(parent + path.sep)); assert.equal(path.dirname(inbox), path.join(ROOT, 'asr-inbox'));
    fs.rmSync(dir, { recursive: true }); fs.rmSync(inbox, { recursive: true }); });
  const rel = p => path.relative(ROOT, p).split(path.sep).join('/'), hash = p => digest(fs.readFileSync(p));
  const put = (p, v) => fs.writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v));
  fs.mkdirSync(path.join(dir, '口播')); fs.mkdirSync(path.join(dir, 'broll'));
  const speech = path.join(dir, '口播', '001.mp4'), broll = path.join(dir, 'broll', '海浪示意.mp4');
  for (const [out, audio] of [[speech, true], [broll, false]]) {
    const a = ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', audio ? 'color=c=red:s=320x180:r=30' : 'testsrc2=size=320x180:rate=30'];
    if (audio) a.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000');
    a.push('-t', '3', '-c:v', 'libx264'); if (audio) a.push('-c:a', 'aac'); else a.push('-an'); a.push(out);
    const r = spawnSync(ffmpeg, a, { encoding: 'utf8', windowsHide: true }); assert.equal(r.status, 0, r.stderr);
  }
  const inspect = spawnSync('powershell', ['-NoProfile', '-File', path.join(ROOT, 'remotion-clone/scripts/inspect-production-input.ps1'), '-InputPath', dir], { encoding: 'utf8', windowsHide: true });
  assert.equal(inspect.status, 0, inspect.stderr); const intake = JSON.parse(inspect.stdout.replace(/^\uFEFF/, ''));
  assert.equal(intake.mediaRouting.workflow, 'speech-with-broll'); assert.equal(intake.primaryVideo.path.split('/').at(-1), '001.mp4');
  const sameNameSrt = path.join(path.dirname(speech), '001.srt'), siblingBroll = path.join(path.dirname(speech), 'broll-other.mp4');
  put(sameNameSrt, 'Technical sidecar'); fs.copyFileSync(broll, siblingBroll);
  const direct = spawnSync('powershell', ['-NoProfile', '-File', path.join(ROOT, 'remotion-clone/scripts/inspect-production-input.ps1'), '-InputPath', speech], { encoding: 'utf8', windowsHide: true });
  assert.equal(direct.status, 0, direct.stderr); const single = JSON.parse(direct.stdout.replace(/^\uFEFF/, ''));
  assert.equal(single.mediaRouting.workflow, 'speech-only'); assert.equal(single.videos.length, 1);
  assert.equal(single.hasTimedSubtitles, true); assert.equal(single.timedSubtitleFiles[0], '001.srt');
  fs.unlinkSync(sameNameSrt); fs.unlinkSync(siblingBroll);
  const base = path.join(dir, 'base.json'); put(base, { source: rel(speech), cuts: [], broll: [] });
  const srt = '1\n00:00:00,000 --> 00:00:03,000\n合成技术测试，不代表真实语义验收。\n';
  put(path.join(inbox, 'source.json'), { source: rel(speech), sourceSha256: hash(speech) });
  put(path.join(inbox, 'receipt.json'), { sourceSha256: hash(speech), exportScope: 'declared-full-source', originalSha256: digest(srt) });
  put(path.join(inbox, 'original.srt'), srt); put(path.join(inbox, 'corrected.srt'), srt);
  put(path.join(inbox, 'corrections.json'), { unresolvedCount: 0, changes: [], evidence: 'Synthetic timing fixture, not real speech listening', originalSha256: digest(srt), correctedSha256: digest(srt) });
  const { prepare: prepareBase } = require('./editing.cjs'), { execute } = require('./jianying_adapter.cjs');
  const prepared = await prepareBase(rel(base), name);
  const evidence = await prepare({ input: rel(broll), output: rel(path.join(dir, 'evidence')), mode: 'broll', interval: 0.5 });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, evidence.manifest), 'utf8'));
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, prepared.prepared), 'utf8'));
  const review = { schemaVersion: 1, manifestSha256: hash(path.join(ROOT, evidence.manifest)), preparedSha256: hash(path.join(ROOT, prepared.prepared)), subtitleSha256: spec.subtitleSha256,
    selections: [{ id: 'technical-only', sourceId: 'v1', startFrame: 30, endFrame: 60, evidenceSampleIds: ['v1-f30'], description: 'Synthetic test pattern', reason: 'Technical range fixture only', burnedInSubtitles: false,
      dynamicReview: { startFrame: 30, endFrame: 60, evidence: 'Synthetic fixture declaration; no perceptual/semantic success claimed' } }],
    placements: [{ selectionId: 'technical-only', start: 0.5, end: 1.5, cueIds: ['1'], reason: 'Synthetic timing fixture only' }] };
  const reviewPath = path.join(dir, 'review.json'); put(reviewPath, review);
  const result = await buildPlan({ manifest: evidence.manifest, review: rel(reviewPath), prepared: prepared.prepared, output: rel(path.join(dir, 'candidate')), 'review-only': true });
  const draft = await execute({ plan: result.plan, name, output: rel(path.join(dir, 'draft')), 'draft-name': '技术合成审片', 'review-only': true });
  const content = JSON.parse(fs.readFileSync(path.join(ROOT, draft.draft, 'draft_content.json'), 'utf8'));
  assert.equal(content.tracks.length, 2); assert.equal(content.tracks[1].segments[0].volume, 0);
  assert.equal(content.tracks[1].segments[0].source_timerange.start, 1000000);
  assert.equal(content.tracks[1].segments[0].target_timerange.start, 500000);
  assert.equal(content.tracks[1].segments[0].target_timerange.duration, 1000000);
  assert.equal(draft.brollSegments, 1); assert.equal(draft.applicationOpenVerified, false); assert.equal(draft.readyForPackaging, false);
  const instructions = fs.readFileSync(path.join(ROOT, path.dirname(draft.draft), '使用说明.txt'), 'utf8');
  assert.match(instructions, /含 1 段/); assert.doesNotMatch(instructions, /B-roll 或包装/);
  // Same sources, explicit Vlog: no SRT/ASR identity is consumed by this branch.
  const visual = await prepare({ input: rel(dir), output: rel(path.join(dir, 'vlog-evidence')), mode: 'vlog', interval: 1 });
  const vm = JSON.parse(fs.readFileSync(path.join(ROOT, visual.manifest), 'utf8'));
  const vr = { schemaVersion: 1, manifestSha256: hash(path.join(ROOT, visual.manifest)), selections: vm.sources.map((s, i) => ({
    id: `scene${i}`, sourceId: s.id, startFrame: 0, endFrame: 30, evidenceSampleIds: [`${s.id}-f0`],
    description: 'Synthetic technical footage', reason: 'Serialization test, not perceptual success', burnedInSubtitles: false,
    dynamicReview: { startFrame: 0, endFrame: 30, evidence: 'Synthetic declared range only' },
  })), sequence: vm.sources.map((s, i) => ({ selectionId: `scene${i}`, reason: 'Technical sequence order' })) };
  const vrp = path.join(dir, 'vlog-review.json'); put(vrp, vr);
  const vlog = await assembleVlog({ manifest: visual.manifest, review: rel(vrp), output: rel(path.join(dir, 'vlog-draft')), 'draft-name': 'Vlog技术审片', 'review-only': true });
  const vc = JSON.parse(fs.readFileSync(path.join(ROOT, vlog.draft, 'draft_content.json'), 'utf8'));
  assert.equal(vc.tracks.length, 1); assert.equal(vc.tracks[0].segments.length, 2);
  assert.equal(vc.tracks[0].name, 'Vlog：已审阅选段（保留原声）');
  assert.equal(vc.tracks[0].segments[1].target_timerange.start, 1000000);
  assert.equal(vc.duration, 2000000); assert.equal(vlog.audioPolicy, 'source-audio-preserved-no-music-added');
  assert.equal(vlog.readyForPackaging, false); assert.equal(vlog.applicationOpenVerified, false);
});
