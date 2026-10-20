const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, digest } = require('./common.cjs');
const { route, registerAligned, selectForPackaging, materialize } = require('./packaging_broll.cjs');
const meta = { frames: 300, fps: { num: 30, den: 1 }, nominalRate: '30/1', width: 320, height: 180, hasAudio: false };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packaging-broll-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  fs.mkdirSync(path.join(root, 'remotion-clone/public'), { recursive: true });
  const put = (p, v) => fs.writeFileSync(path.join(root, p), typeof v === 'string' ? v : JSON.stringify(v));
  const hash = p => digest(fs.readFileSync(path.join(root, p)));
  put('remotion-clone/public/speech.mp4', 'locked speech fixture');
  put('broll.mp4', 'separately exported b-roll fixture'); put('image.jpg', 'sample fixture');
  put('final.srt', '1\n00:00:00,000 --> 00:00:05,000\n当前定剪语义。\n');
  const input = { readyForPackagingPlanning: true, video: 'remotion-clone/public/speech.mp4', videoSha256: hash('remotion-clone/public/speech.mp4'),
    subtitles: 'final.srt', subtitleSha256: hash('final.srt'), totalFrames: 300, fps: meta.fps };
  put('packaging.json', input);
  const state = { kind: 'packaging-broll-state-v1', videoSha256: input.videoSha256, subtitleSha256: input.subtitleSha256,
    alignedTracks: [], selections: [], processedSources: [] };
  put('state.json', state);
  return { root, put, hash, input, state, options: { root, probe: () => meta } };
}
test('ordinary speech without additional B-roll skips visual rules', async t => {
  const f = fixture(t);
  const r = await route({ packaging: 'packaging.json', input: 'remotion-clone/public/speech.mp4' }, f.options);
  assert.equal(r.status, 'no-additional-broll'); assert.deepEqual(r.rulesToLoad, []); assert.equal(r.needsVisualSelection, false);
  assert.equal(r.jianyingRequired, false);
});
test('independent aligned export continues existing packaging, not semantic re-selection or merged-video assumption', async t => {
  const f = fixture(t), visualPath = require.resolve('./visual_workflow.cjs'), loaded = !!require.cache[visualPath];
  await registerAligned({ packaging: 'packaging.json', source: 'broll.mp4', id: 'aligned', 'timeline-start-frame': 0,
    'source-offset-frame': 0, 'duration-frames': 300, 'alignment-evidence': 'Synthetic matching timeline origins', output: 'aligned.json' }, f.options);
  const r = await route({ packaging: 'packaging.json', state: 'aligned.json', input: 'broll.mp4' }, f.options);
  assert.equal(r.status, 'aligned-track-continue-existing-packaging'); assert.deepEqual(r.rulesToLoad, []);
  assert.equal(r.alignedTracks.length, 1); assert.equal(r.newSources.length, 0); assert.equal(!!require.cache[visualPath], loaded);
  const result = await materialize({ packaging: 'packaging.json', state: 'aligned.json', output: 'remotion-clone/public/aligned-assets' }, f.options);
  const asset = JSON.parse(fs.readFileSync(path.join(f.root, result.saved), 'utf8'));
  assert.equal(asset.clips.length, 0); assert.equal(asset.alignedTracks.length, 1);
  assert.equal(asset.alignedTracks[0].continuePackagingBlackGapCropRoiChecks, true);
  assert.equal(f.hash('remotion-clone/public/aligned-assets/aligned-001.mp4'), f.hash('broll.mp4'));
  assert.equal(asset.jianyingGenerated, false); assert.equal(asset.compositionModified, false);
  assert.equal(!!require.cache[visualPath], loaded);
});
test('aligned origin/duration must be explicit and in range', async t => {
  const f = fixture(t);
  await assert.rejects(registerAligned({ packaging: 'packaging.json', source: 'broll.mp4', id: 'a', 'alignment-evidence': 'not enough', output: 'a.json' }, f.options), /explicit in-range/);
});
test('an aligned public export is referenced directly, not copied or cut again', async t => {
  const f = fixture(t); f.put('remotion-clone/public/broll-export.mp4', 'existing aligned file');
  await registerAligned({ packaging: 'packaging.json', source: 'remotion-clone/public/broll-export.mp4', id: 'a', 'timeline-start-frame': 0,
    'source-offset-frame': 0, 'duration-frames': 300, 'alignment-evidence': 'Synthetic alignment fixture', output: 'aligned.json' }, f.options);
  const r = await materialize({ packaging: 'packaging.json', state: 'aligned.json', output: 'remotion-clone/public/assets' }, f.options);
  const output = JSON.parse(fs.readFileSync(path.join(f.root, r.saved), 'utf8'));
  assert.equal(output.alignedTracks[0].src, 'broll-export.mp4'); assert.deepEqual(fs.readdirSync(path.join(f.root, 'remotion-clone/public/assets')), ['packaging-broll.json']);
});
test('only newly supplied/unprocessed sources activate selection rules', async t => {
  const f = fixture(t); f.put('broll-new.mp4', 'new raw source');
  f.state.processedSources.push({ source: 'broll.mp4', sha256: f.hash('broll.mp4') }); f.put('state.json', f.state);
  const r = await route({ packaging: 'packaging.json', state: 'state.json', input: 'broll-new.mp4' }, f.options);
  assert.equal(r.needsVisualSelection, true); assert.deepEqual(r.newSources, ['broll-new.mp4']); assert.equal(r.jianyingRequired, false);
});
test('target edit changes invalidate placements, not justify guessing a global offset', async t => {
  const f = fixture(t); f.input.subtitleSha256 = f.hash('final.srt');
  f.state.subtitleSha256 = 'previous-version'; f.put('state.json', f.state);
  await assert.rejects(route({ packaging: 'packaging.json', state: 'state.json' }, f.options), /target timeline changed/);
});
test('changed aligned export is not silently reused', async t => {
  const f = fixture(t);
  f.state.alignedTracks.push({ id: 'a', source: 'broll.mp4', sourceSha256: 'stale', timelineStartFrame: 0, sourceOffsetFrames: 0, durationInFrames: 300, alignmentEvidence: 'synthetic' });
  f.put('state.json', f.state); await assert.rejects(route({ packaging: 'packaging.json', state: 'state.json' }, f.options), /source changed/);
});
function reviewed(t) {
  const f = fixture(t);
  const manifest = { kind: 'visual-evidence-batch-v1', mode: 'broll', sources: [{ id: 'v1', source: 'broll.mp4', sha256: f.hash('broll.mp4'), meta }],
    samples: [{ id: 'v1-f30', sourceId: 'v1', frameIndex: 30, image: 'image.jpg', imageSha256: f.hash('image.jpg') }] };
  f.put('manifest.json', manifest);
  const review = { schemaVersion: 1, manifestSha256: f.hash('manifest.json'), packagingSha256: f.hash('packaging.json'), subtitleSha256: f.input.subtitleSha256,
    selections: [{ id: 'new-shot', sourceId: 'v1', startFrame: 30, endFrame: 90, evidenceSampleIds: ['v1-f30'], description: 'Synthetic candidate', reason: 'Fixture only', burnedInSubtitles: false,
      dynamicReview: { startFrame: 30, endFrame: 90, evidence: 'Synthetic declaration, not a perceptual result' } }],
    placements: [{ selectionId: 'new-shot', start: 1, end: 2, cueIds: ['1'], reason: 'Synthetic current-SRT link' }] };
  f.put('review.json', review);
  return { ...f, review, args: { packaging: 'packaging.json', manifest: 'manifest.json', review: 'review.json', output: 'selected.json' } };
}
test('unprocessed raw selection binds final SRT directly without original ASR/Resolve/Jianying artifacts', async t => {
  const f = reviewed(t), r = await selectForPackaging(f.args, f.options);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, r.saved), 'utf8'));
  assert.equal(state.selections[0].sourceStartFrame, 30); assert.equal(state.selections[0].targetStartFrame, 30);
  assert.equal(state.selections[0].durationInFrames, 30); assert.equal(state.alignedTracks.length, 0); assert.equal(r.jianyingGenerated, false);
  assert.equal(fs.existsSync(path.join(f.root, 'asr-inbox')), false);
  const again = await route({ packaging: 'packaging.json', state: r.saved, input: 'broll.mp4' }, f.options);
  assert.equal(again.needsVisualSelection, false); assert.equal(again.reusableSelections.length, 1);
});
for (const change of ['subtitle', 'manifest', 'range', 'overlap']) {
  test(`packaging selection blocks ${change} mismatch`, async t => {
    const f = reviewed(t);
    if (change === 'subtitle') f.review.subtitleSha256 = 'stale';
    if (change === 'manifest') f.review.manifestSha256 = 'stale';
    if (change === 'range') f.review.placements[0].end = 4;
    if (change === 'overlap') f.review.placements.push({ ...f.review.placements[0], id: 'another' });
    f.put('review.json', f.review); await assert.rejects(selectForPackaging(f.args, f.options));
    assert.equal(fs.existsSync(path.join(f.root, 'selected.json')), false);
  });
}
test('real synthetic slicing preserves audio and dimensions; whole selected public clip is reused', async t => {
  const ffmpeg = path.join(ROOT, 'tools/chatcut-runtime/.chatcut/cache/ffmpeg/8.1/win32-x64/ffmpeg.exe');
  if (!fs.existsSync(ffmpeg)) { t.skip('Existing FFmpeg unavailable; no installation'); return; }
  const parent = path.join(ROOT, 'remotion-clone/public'), dir = fs.mkdtempSync(path.join(parent, 'packaging-broll-test-'));
  t.after(() => { assert.ok(dir.startsWith(parent + path.sep)); fs.rmSync(dir, { recursive: true }); });
  const rel = p => path.relative(ROOT, p).split(path.sep).join('/'), put = (p, v) => fs.writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v));
  const source = path.join(dir, 'broll-source.mp4'), hash = p => digest(fs.readFileSync(p));
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30', '-f', 'lavfi', '-i', 'sine=frequency=400:sample_rate=48000',
    '-t', '6', '-c:v', 'libx264', '-c:a', 'aac', source], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  const srt = path.join(dir, 'final.srt'); put(srt, '1\n00:00:00,000 --> 00:00:06,000\nTechnical fixture only.\n');
  const input = { readyForPackagingPlanning: true, video: rel(source), videoSha256: hash(source), subtitles: rel(srt), subtitleSha256: hash(srt), totalFrames: 180, fps: meta.fps };
  const pp = path.join(dir, 'packaging.json'); put(pp, input);
  const state = { kind: 'packaging-broll-state-v1', videoSha256: input.videoSha256, subtitleSha256: input.subtitleSha256, alignedTracks: [], processedSources: [],
    selections: [{ id: 'one', source: rel(source), sourceSha256: hash(source), sourceStartFrame: 60, sourceEndFrame: 105, targetStartFrame: 30, durationInFrames: 45, burnedInSubtitles: false, reviewEvidence: 'Technical fixture' }] };
  const sp = path.join(dir, 'state.json'); put(sp, state);
  const out = await materialize({ packaging: rel(pp), state: rel(sp), output: rel(path.join(dir, 'clips')) });
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, out.saved), 'utf8'));
  assert.equal(data.clips[0].sourceOffsetFrames, 0); assert.equal(data.clips[0].from, 30); assert.equal(data.clips[0].durationInFrames, 45);
  const clip = path.join(ROOT, 'remotion-clone/public', data.clips[0].src);
  const ffprobe = path.join(ROOT, 'remotion-clone/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe');
  const { probeVideo } = require('./visual_workflow.cjs'); const info = probeVideo(clip, ffprobe);
  assert.equal(info.frames, 45); assert.equal(info.hasAudio, true); assert.equal(info.width, 320); assert.equal(info.height, 180);
  Object.assign(state.selections[0], { source: rel(clip), sourceSha256: hash(clip), sourceStartFrame: 0, sourceEndFrame: 45 }); put(sp, state);
  const reuse = await materialize({ packaging: rel(pp), state: rel(sp), output: rel(path.join(dir, 'reuse')) });
  const reused = JSON.parse(fs.readFileSync(path.join(ROOT, reuse.saved), 'utf8'));
  assert.equal(reused.clips[0].reusedWholeClip, true); assert.equal(reused.clips[0].src, data.clips[0].src);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'reuse')), ['packaging-broll.json']);
  assert.equal(reused.jianyingGenerated, false); assert.equal(reused.compositionModified, false); assert.equal(reused.fullRenderAuthorized, false);
});
