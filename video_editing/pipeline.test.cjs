const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, digest } = require('./common.cjs');
const { inbox, checkCues, accept, inspect } = require('./voice_adapter.cjs');
const { compile, remap, correctedCues, prepare } = require('./editing.cjs');
const { search } = require('./broll_adapter.cjs');
const { handoff } = require('./handoff.cjs');
const { pointer } = require('./download_srt.cjs');
const media = { fps: { num: 10, den: 1 }, nominalRate: '10/1', frames: 100, duration: 10, hasAudio: true };
const plan = () => ({ source: 'remotion-clone/public/source.mp4', cuts: [{ start: 4, end: 6, reason: '合成测试区间' }], broll: [] });
const srt = '1\n00:00:01,000 --> 00:00:02,000\n第一句\n\n2\n00:00:07,000 --> 00:00:08,000\n第二句\n';
function fixture(t) {
  const base = path.resolve(ROOT, 'remotion-clone/.tmp'); fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'pipeline-test-'));
  t.after(() => {
    const r = path.relative(base, fs.realpathSync(root));
    if (!r.startsWith('pipeline-test-') || r.includes(path.sep) || path.isAbsolute(r)) throw new Error('Unsafe fixture cleanup');
    fs.rmSync(root, { recursive: true });
  });
  const write = (p, v) => { const dest = path.join(root, p); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, typeof v === 'string' ? v : JSON.stringify(v)); return dest; };
  write(plan().source, 'synthetic media bytes');
  const sourceSha256 = digest('synthetic media bytes');
  write('asr-inbox/source.mp4/source.json', { source: plan().source, sourceSha256, ...media });
  return { root, write, sourceSha256 };
}
test('minimal plan complements source cuts, no public EDL', () => {
  const c = compile(plan(), media);
  assert.deepEqual(c.clips, [{ inFrame: 0, outFrame: 40, atFrame: 0 }, { inFrame: 60, outFrame: 100, atFrame: 40 }]);
  assert.equal(c.totalFrames, 80);
});
test('no cuts retains the entire source', () => assert.equal(compile({ ...plan(), cuts: [] }, media).totalFrames, 100));
test('unknown fields fail rather than silently change meaning', () => assert.throws(() => compile({ ...plan(), speed: 2 }, media), /Unknown/));
test('negative cuts rejected', () => assert.throws(() => compile({ ...plan(), cuts: [{ start: -1, end: 2, reason: 'x' }] }, media)));
test('overlapping cuts rejected', () => assert.throws(() => compile({ ...plan(), cuts: [...plan().cuts, { start: 5, end: 7, reason: 'x' }] }, media), /overlap/));
test('zero-frame cuts rejected', () => assert.throws(() => compile({ ...plan(), cuts: [{ start: 1.01, end: 1.02, reason: 'x' }] }, media), /empty/));
test('entire-source removal rejected', () => assert.throws(() => compile({ ...plan(), cuts: [{ start: 0, end: 10, reason: 'x' }] }, media), /entire/));
test('repository path traversal rejected', () => assert.throws(() => compile({ ...plan(), source: '../source.mp4' }, media)));
test('human reason required', () => assert.throws(() => compile({ ...plan(), cuts: [{ start: 1, end: 2, reason: '' }] }, media), /reason/));
const b = () => ({ start: 2, end: 4, source: 'remotion-clone/public/b.mp4', source_start: 3, reason: '语义匹配' });
test('B-roll uses edited time and preserves source range/muted audio', () => {
  const c = compile({ ...plan(), broll: [b()] }, media, { [b().source]: media });
  assert.deepEqual([c.broll[0].atFrame, c.broll[0].inFrame, c.broll[0].outFrame, c.broll[0].audio], [20, 30, 50, 'muted']);
  assert.equal(c.broll[0].burnedInSubtitles, null);
});
test('B-roll cannot extend speech duration', () => assert.throws(() => compile({ ...plan(), broll: [{ ...b(), end: 9 }] }, media, { [b().source]: media })));
test('short B-roll cannot silently loop', () => assert.throws(() => compile({ ...plan(), broll: [{ ...b(), source_start: 9 }] }, media, { [b().source]: media })));
test('mixed fps rejected instead of guessing source time', () => assert.throws(() => compile({ ...plan(), broll: [b()] }, media, { [b().source]: { ...media, fps: { num: 20, den: 1 } } }), /frame rate/));
test('overlapping B-roll rejected', () => assert.throws(() => compile({ ...plan(), broll: [b(), { ...b(), start: 3, end: 5 }] }, media, { [b().source]: media }), /overlapping/));
test('SRT remap preserves text and adjusts only fixed offsets', () => {
  const cues = checkCues(Buffer.from(srt), 10); const output = remap(compile(plan(), media), cues);
  assert.equal(output[1].startMs, 5000); assert.equal(output[1].text, '第二句');
});
test('whole removed cue is omitted', () => assert.equal(remap(compile(plan(), media), [{ cueId: '1', startMs: 4200, endMs: 4800, text: 'removed' }]).length, 0));
test('cut through a cue blocks preparation, no half-sentence invention', () => assert.throws(() => remap(compile(plan(), media), [{ cueId: '1', startMs: 3500, endMs: 4500, text: 'one phrase' }]), /crosses/));
test('invalid UTF-8 SRT rejected', () => assert.throws(() => checkCues(Buffer.from([0xff, 0xfe]), 10)));
test('wrong full-source duration rejected', () => assert.throws(() => checkCues(Buffer.from(srt), 5), /duration/));
test('inbox prevents unsafe Windows names', () => { for (const n of ['../x', 'CON.mp4', 'a:b', 'a.']) assert.throws(() => inbox(n)); });
test('full-source declaration required before accepting files', async t => {
  const f = fixture(t); const p = f.write('incoming.srt', srt);
  await assert.rejects(accept('source.mp4', p, { root: f.root }), /full-source/);
});
test('accept/import/check is idempotent-read, immutable-write', async t => {
  const f = fixture(t); const p = f.write('incoming.srt', srt);
  const raw = f.write('words.json', { unknownVendorWords: [] });
  await accept('source.mp4', p, { root: f.root, fullSource: true, words: raw });
  const v = await inspect('source.mp4', f.root);
  assert.equal(v.wordTimingStatus, 'pending-format-and-audio-verification'); assert.equal(v.contentVerified, false);
  await assert.rejects(accept('source.mp4', p, { root: f.root, fullSource: true }), /Existing/);
  assert.equal(fs.readFileSync(path.join(f.root, 'asr-inbox/source.mp4/words.raw.json'), 'utf8'), fs.readFileSync(raw, 'utf8'));
});
test('source replacement blocks transcript reuse', async t => {
  const f = fixture(t); f.write(plan().source, 'changed');
  await assert.rejects(accept('source.mp4', f.write('incoming.srt', srt), { root: f.root, fullSource: true }), /identity/);
});
test('prepared minimal plan binds corrected subtitles and remains data-only', async t => {
  const f = fixture(t); await accept('source.mp4', f.write('incoming.srt', srt), { root: f.root, fullSource: true });
  f.write('asr-inbox/source.mp4/corrected.srt', srt);
  f.write('asr-inbox/source.mp4/corrections.json', { unresolvedCount: 0, changes: [], evidence: 'Synthetic fixture only, not actual audio review', originalSha256: digest(srt), correctedSha256: digest(srt) });
  const file = 'review/edit_plan.json'; f.write(file, plan());
  const result = await prepare(file, 'source.mp4', { root: f.root, probe: () => media });
  assert.equal(result.readyForPackaging, false); assert.equal(result.totalFrames, 80);
  assert.match(fs.readFileSync(path.join(f.root, 'review/captions-edited.srt'), 'utf8'), /00:00:05,000/);
  await assert.rejects(prepare(file, 'source.mp4', { root: f.root, probe: () => media }), /overwrite/);
});
test('unresolved correction prevents outputs', async t => {
  const f = fixture(t); await accept('source.mp4', f.write('incoming.srt', srt), { root: f.root, fullSource: true });
  f.write('asr-inbox/source.mp4/corrected.srt', srt); f.write('asr-inbox/source.mp4/corrections.json', { unresolvedCount: 1 });
  f.write('review/edit_plan.json', plan());
  await assert.rejects(prepare('review/edit_plan.json', 'source.mp4', { root: f.root, probe: () => media }), /unresolved/);
  assert.equal(fs.existsSync(path.join(f.root, 'review/resolve-input.json')), false);
});
test('B-roll Chinese/English labels return only candidates', () => {
  const matches = search([{ source: b().source, description: '装修施工录屏', tags: ['软件'] }], '装修软件');
  assert.equal(matches.length, 1); assert.match(matches[0].matchType, /not-verified/);
  assert.equal(search([{ source: b().source, description: '海景', tags: [] }], '软件').length, 0);
});
test('handoff requires reviewed export identities, does not authorize rendering', async t => {
  const f = fixture(t); const subtitle = 'remotion-clone/public/final.srt'; f.write(subtitle, srt);
  const e = { videoSha256: f.sourceSha256, subtitleSha256: digest(srt), timelineLocked: true, unresolvedCount: 0, reviewEvidence: 'Synthetic head/mid/tail review fixture', burnedSubtitleRanges: [] };
  f.write('review/lock.json', e);
  const inputs = { video: plan().source, srt: subtitle, evidence: 'review/lock.json', output: 'review/packaging-input.json', root: f.root, probe: () => media };
  assert.equal((await handoff(inputs)).fullRenderAuthorized, false);
  f.write('review/lock.json', { ...e, videoSha256: 'wrong' });
  await assert.rejects(handoff({ ...inputs, output: 'review/another.json' }), /stale/);
});
test('unlocked final timeline rejected', async t => {
  const f = fixture(t); f.write('s.srt', srt); f.write('e.json', { videoSha256: f.sourceSha256, subtitleSha256: digest(srt), timelineLocked: false });
  await assert.rejects(handoff({ video: plan().source, srt: 's.srt', evidence: 'e.json', output: 'out.json', root: f.root, probe: () => media }), /Locked/);
});
test('download URL comes from explicit returned structure, not guessed tool fields', () => {
  assert.equal(pointer({ result: { downloadUrl: 'https://example.test/subtitles.srt' } }, '/result/downloadUrl'), 'https://example.test/subtitles.srt');
  assert.throws(() => pointer({ result: {} }, '/result/downloadUrl'), /not found/);
  assert.throws(() => pointer({ downloadUrl: 'file:///local' }, '/downloadUrl'), /HTTPS/);
});
test('changed subtitle text cannot be hidden behind an empty correction log', () => {
  const changed = srt.replace('第一句', '校正句');
  assert.throws(() => correctedCues(Buffer.from(srt), Buffer.from(changed), { changes: [] }), /correction log/);
  assert.equal(correctedCues(Buffer.from(srt), Buffer.from(changed), { changes: [{ cueId: '1', original: '第一句', corrected: '校正句', evidence: 'synthetic audio evidence' }] })[0].text, '校正句');
});
test('timing repairs require exact before/after evidence', () => {
  const changed = srt.replace('00:00:01,000', '00:00:01,100');
  assert.throws(() => correctedCues(Buffer.from(srt), Buffer.from(changed), { changes: [{ cueId: '1', original: '第一句', corrected: '第一句', evidence: 'x' }] }), /Timestamp/);
});
test('29.97 fps SRT millisecond roundoff is clamped without duplicating or cutting text', () => {
  const m = { ...media, fps: { num: 30000, den: 1001 }, frames: 2253 };
  const c = compile({ ...plan(), cuts: [{ start: 24.892, end: 40.44, reason: 'numeric boundary fixture' }] }, m);
  const cues = [{ cueId: '1', startMs: 22122, endMs: 24892, text: 'kept before' }, { cueId: '2', startMs: 40440, endMs: 42276, text: 'kept after' }];
  const output = remap(c, cues);
  assert.equal(output.length, 2); assert.equal(output[0].text, 'kept before');
  assert.equal(output[0].endMs, output[1].startMs);
  assert.throws(() => remap(c, [{ ...cues[0], endMs: 24900 }]), /crosses/);
});

