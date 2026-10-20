const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { namedRole, classifyPaths, scanInput } = require('./media_roles.cjs');
test('unmarked single folder/multiple takes remains speech without visual rules', () => {
  const r = classifyPaths(['DJI001.mp4', '海浪.mp4', '录屏.mov', 'notes.srt']);
  assert.equal(r.workflow, 'speech-only'); assert.equal(r.needsVisualSelection, false);
  assert.deepEqual(r.rulesToLoad, []); assert.equal(r.speechVideos.length, 3);
});
test('two named folders and unmarked filenames', () => {
  const r = classifyPaths(['口播/DJI001.mp4', 'broll/DJI002.mp4']);
  assert.deepEqual(r.speechVideos, ['口播/DJI001.mp4']); assert.deepEqual(r.brollVideos, ['broll/DJI002.mp4']);
  assert.equal(r.workflow, 'speech-with-broll');
});
test('case/separators/Chinese and digit suffixes, not unrelated English words', () => {
  for (const s of ['BROLL', 'B-roll_浪', 'b_roll 海', 'b roll 01', 'broll01', 'broll海浪', '20261018broll01']) assert.equal(namedRole(s), 'broll');
  for (const s of ['broller', 'abroll', 'scroll', '风景', '录屏']) assert.equal(namedRole(s), null);
});
test('file marker beats folder marker; nearest folder is used', () => {
  const r = classifyPaths(['口播/broll海.mp4', 'broll/口播/001.mp4']);
  assert.deepEqual(r.brollVideos, ['口播/broll海.mp4']);
  assert.deepEqual(r.speechVideos, ['broll/口播/001.mp4']);
});
test('contradictory same name stops rather than guessing', () => {
  const r = classifyPaths(['口播_broll.mp4']); assert.equal(r.workflow, 'naming-conflict');
  assert.equal(r.needsVisualSelection, false); assert.deepEqual(r.rulesToLoad, []);
});
test('explicit vlog overrides unmarked speech default, never inferred from scenery name', () => {
  assert.equal(classifyPaths(['风景.mp4']).needsVisualSelection, false);
  assert.equal(classifyPaths(['风景.mp4'], { mode: 'vlog' }).workflow, 'visual-vlog');
});
test('root broll folder works; input file does not scan its siblings', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-roles-')); t.after(() => fs.rmSync(dir, { recursive: true }));
  fs.mkdirSync(path.join(dir, 'broll')); fs.writeFileSync(path.join(dir, 'broll', '001.mp4'), '');
  fs.writeFileSync(path.join(dir, 'a.mp4'), ''); fs.writeFileSync(path.join(dir, 'broll01.mp4'), '');
  assert.equal(scanInput(path.join(dir, 'broll')).workflow, 'broll-only');
  assert.equal(scanInput(path.join(dir, 'a.mp4')).workflow, 'speech-only');
  assert.equal(scanInput(dir).workflow, 'speech-with-broll');
});
test('depth limits are explicit and do not pretend full naming coverage', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-roles-')); t.after(() => fs.rmSync(dir, { recursive: true }));
  fs.mkdirSync(path.join(dir, 'nested', 'broll'), { recursive: true }); fs.writeFileSync(path.join(dir, 'nested', 'broll', 'x.mp4'), '');
  const r = scanInput(dir, { depth: 0 }); assert.equal(r.namingCoverageComplete, false);
  assert.deepEqual(r.unscannedDirectories, ['nested']); assert.equal(scanInput(dir, { depth: 2 }).hasBroll, true);
});
