const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execute } = require('./jianying_adapter.cjs');
const { ROOT, digest } = require('./common.cjs');

function fixture(t) {
  const parent = path.join(ROOT, 'tools/jianying-draft/tmp');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'node-test-'));
  t.after(() => {
    const absolute = fs.realpathSync(root);
    assert.equal(path.dirname(absolute), fs.realpathSync(parent));
    assert.ok(path.basename(absolute).startsWith('node-test-'));
    fs.rmSync(absolute, { recursive: true });
  });
  fs.mkdirSync(path.join(root, 'asr-inbox/source.mp4'), { recursive: true });
  fs.writeFileSync(path.join(root, 'source.mp4'), 'fixture');
  fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify({ source: 'source.mp4', cuts: [], broll: [] }));
  fs.writeFileSync(path.join(root, 'asr-inbox/source.mp4/source.json'), JSON.stringify({ source: 'source.mp4', sourceSha256: digest('fixture') }));
  return { root, a: { plan: 'plan.json', name: 'source.mp4', output: 'new-output', 'draft-name': 'test', 'review-only': true },
    probe: () => ({ duration: 1, frames: 30, fps: { num: 30, den: 1 }, nominalRate: '30/1', hasAudio: true, width: 1920, height: 1080 }) };
}
test('requires explicit review-only and rejects unknown arguments', async t => {
  const f = fixture(t);
  await assert.rejects(execute({ ...f.a, 'review-only': false }, f), /Usage/);
  await assert.rejects(execute({ ...f.a, final: true }, f), /Usage/);
});
test('refuses overwrite without modifying existing output', async t => {
  const f = fixture(t), output = path.join(f.root, f.a.output);
  fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'keep'), 'untouched');
  await assert.rejects(execute(f.a, f), /overwrite/);
  assert.equal(fs.readFileSync(path.join(output, 'keep'), 'utf8'), 'untouched');
});
test('requires bound source identity', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'source.mp4'), 'changed');
  await assert.rejects(execute(f.a, f), /identity/);
  assert.ok(!fs.existsSync(path.join(f.root, f.a.output)));
});
test('VFR and missing speech audio stop before output', async t => {
  const f = fixture(t), media = f.probe();
  await assert.rejects(execute(f.a, { ...f, probe: () => ({ ...media, hasAudio: false }) }), /audio/);
  await assert.rejects(execute(f.a, { ...f, probe: () => ({ ...media, nominalRate: '25/1' }) }), /VFR/);
});
