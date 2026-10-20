// Editable REVIEW draft only: reuse the public plan, never replace subtitle approval.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('./editing.cjs');
const { ROOT, repoPath, digest, json, fileHash, relative, mediaProbe, writeNew, args } = require('./common.cjs');

async function execute(a, { root = ROOT, probe = mediaProbe } = {}) {
  if (a['review-only'] !== true || !['plan', 'name', 'output', 'draft-name'].every(k => typeof a[k] === 'string') ||
      Object.keys(a).some(k => !['plan', 'name', 'output', 'draft-name', 'review-only'].includes(k))) {
    throw new Error('Usage: jianying_adapter.cjs --plan REPO_PATH --name SOURCE_FILENAME --output NEW_REPO_DIR --draft-name NAME --review-only');
  }
  if (!a.name || /[\\/]/.test(a.name) || !a['draft-name'].trim() || /[\\/:*?"<>|]/.test(a['draft-name'])) throw new Error('Unsafe source/draft name');
  const planPath = repoPath(root, a.plan), bytes = fs.readFileSync(planPath), plan = json(planPath);
  const output = repoPath(root, a.output);
  if (fs.existsSync(output)) throw new Error('Refusing to overwrite existing draft output');
  const media = {};
  for (const p of new Set([plan.source, ...(plan.broll || []).map(b => b.source)])) {
    const absolute = repoPath(root, p), metadata = probe(absolute);
    const nominal = metadata.nominalRate?.split('/').map(Number);
    if (nominal && nominal[0] * metadata.fps.den !== metadata.fps.num * nominal[1]) throw new Error('VFR requires explicit conforming');
    media[p] = { ...metadata, absolute, sha256: await fileHash(absolute) };
  }
  if (!media[plan.source].hasAudio) throw new Error('A-roll speech audio is missing');
  const identity = json(repoPath(root, `asr-inbox/${a.name}/source.json`));
  if (identity.source !== plan.source || identity.sourceSha256 !== media[plan.source].sha256) throw new Error('Source identity mismatch');
  const compiled = compile(plan, media[plan.source], media, root);
  if (digest(fs.readFileSync(planPath)) !== digest(bytes)) throw new Error('Plan changed during preparation');
  const spec = { source: plan.source, ...compiled, name: a['draft-name'], media, output: path.join(output, a['draft-name']) };
  fs.mkdirSync(output);
  const python = spawnSync('python', [path.join(__dirname, 'jianying_backend.py')], {
    input: JSON.stringify(spec), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }, maxBuffer: 2 * 1024 * 1024,
  });
  if (python.error || python.status !== 0) throw new Error(`Draft generation failed (partial output preserved): ${python.error?.message || python.stderr}`);
  const result = JSON.parse(python.stdout);
  const draft = path.join(spec.output, 'draft_content.json');
  const receipt = { ...result, plan: relative(planPath, root), planSha256: digest(bytes),
    source: plan.source, sourceSha256: media[plan.source].sha256,
    draft: relative(spec.output, root), draftContentSha256: await fileHash(draft),
    sourceFrames: compiled.sourceFrames, totalFrames: compiled.totalFrames, fps: compiled.fps, brollSegments: compiled.broll.length,
    sourceMediaEmbedded: false, subtitleStatus: 'not-included-pending-correction',
    evidence: 'Serialized file readback only; local Jianying must open and review the draft.' };
  writeNew(path.join(output, 'receipt.json'), receipt);
  writeNew(path.join(output, '使用说明.txt'), `可编辑口播审片草稿：${a['draft-name']}\n\n` +
    '将同名草稿文件夹放入剪映设置中的草稿目录，再在首页刷新并打开。不是通过“导入媒体”导入 JSON。\n' +
    '本工程引用完整源视频，片段可继续拖动、修剪、恢复前后内容；没有压成单条成片。\n' +
    '源视频引用项目素材副本，移动或删除副本将需要重新链接。\n' +
    `当前无字幕或包装；B-roll ${compiled.broll.length ? `含 ${compiled.broll.length} 段另轨静音覆盖，配画面与接缝待实际看听` : '未加入'}。切点、气口残留及重复选择待实际听审。\n` +
    '文件结构校验通过不等于剪映成功打开；若提示损坏，停止并反馈版本和提示，不覆盖现有工程。\n' +
    '达芬奇免费版脚本和 DRP 保留，不需要 Studio，也没有调用剪映界面自动化。\n');
  return receipt;
}
if (require.main === module) execute(args(process.argv.slice(2))).then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { execute };
