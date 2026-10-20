const fs = require('node:fs');
const path = require('node:path');
const { hash, repoPath, validatePlan, mapTimeline } = require('./contract.cjs');
const { parseSrt, remapSubtitles, serializeSrt } = require('./subtitles.cjs');

function prepareArtifacts(plan, root) {
  const checked = validatePlan(plan, { root, checkFiles: true });
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const cuesBySource = Object.create(null);
  const subtitleInputs = [];
  for (const sub of plan.subtitles) {
    const corrected = fs.readFileSync(repoPath(root, sub.correctedPath));
    if (hash(corrected) !== sub.correctedSha256) throw new Error('Subtitle changed during preparation');
    cuesBySource[sub.sourceId] = parseSrt(corrected);
    subtitleInputs.push({ sourceId: sub.sourceId, originalPath: sub.originalPath,
      originalSha256: hash(fs.readFileSync(repoPath(root, sub.originalPath))),
      correctedPath: sub.correctedPath, correctedSha256: sub.correctedSha256,
      correctionLogPath: sub.correctionLogPath });
  }
  const remapped = remapSubtitles(plan, cuesBySource);
  if (!remapped.ok) return { ok: false, errors: remapped.unresolved, report: remapped };
  const dir = `remotion-clone/review/workflow-flash/${plan.title}`;
  const paths = {
    plan: `${dir}/edit-plan.json`, map: `${dir}/editing-map.json`,
    subtitles: `${dir}/captions-edited.srt`, report: `${dir}/subtitle-remap-report.json`,
    handoff: `${dir}/editing-handoff.json`,
  };
  const identity = { schemaVersion: 1, title: plan.title, revision: plan.revision, planSha256: hash(JSON.stringify(plan)), fps: plan.fps, totalFrames: plan.totalFrames };
  const map = { ...identity, frameConvention: '[start,end)', clips: mapTimeline(plan), removedRanges: plan.removedRanges,
    broll: plan.broll, subtitleSuppressionRanges: plan.broll.filter((item) => item.burnedInSubtitles).map((item) => ({
      brollId: item.id, startFrame: item.atFrame, endFrame: item.atFrame + item.outFrame - item.inFrame,
    })) };
  const editedSrt = serializeSrt(remapped.cues);
  const report = { ...identity, subtitleInputs, editedSha256: hash(editedSrt),
    cueCount: remapped.cues.length, mapping: remapped.cues, removed: remapped.removed, unresolved: [] };
  const handoff = { ...identity, intent: plan.intent, phase: 'data-prepared', paths,
    sources: plan.sources.map(({ id, path: sourcePath, role }) => ({ id, path: sourcePath, role })),
    timelineReview: plan.review, dataValidated: true, mediaValidated: false, readyForPackaging: false,
    unresolvedCount: 0, nextAction: 'Execute or verify the media edit; this data-only handoff does not authorize packaging or Resolve control.' };
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  return { ok: true, artifacts: [
    { path: paths.map, content: json(map) }, { path: paths.subtitles, content: editedSrt },
    { path: paths.report, content: json(report) }, { path: paths.handoff, content: json(handoff) },
  ], handoff, report };
}

function writeArtifacts(root, artifacts) {
  const targets = artifacts.map((artifact) => ({ ...artifact, target: repoPath(root, artifact.path) }));
  for (const artifact of targets) if (fs.existsSync(artifact.target)) throw new Error(`Refusing to overwrite existing artifact: ${artifact.path}`);
  const created = [];
  try {
    for (const artifact of targets) {
      // The review project must already exist; do not create a second project.
      const fd = fs.openSync(artifact.target, 'wx');
      created.push(artifact.target);
      try { fs.writeFileSync(fd, artifact.content, 'utf8'); } finally { fs.closeSync(fd); }
    }
  } catch (error) {
    for (const target of created) fs.unlinkSync(target);
    throw error;
  }
}

function main(argv, root = path.resolve(__dirname, '../..')) {
  const [command, planPath, ...extra] = argv;
  if (!['validate', 'prepare'].includes(command) || !planPath || extra.length) throw new Error('Usage: cli.cjs <validate|prepare> <repository-relative edit-plan.json>');
  const file = repoPath(root, planPath);
  const planBytes = fs.readFileSync(file);
  const plan = JSON.parse(planBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const checked = validatePlan(plan, { root, checkFiles: true });
  if (!checked.ok) { process.stdout.write(JSON.stringify(checked, null, 2) + '\n'); return 1; }
  if (!/^[^<>:"/\\|?*\u0000-\u001f]+$/.test(plan.title) || /[. ]$/.test(plan.title) || plan.title === '.' || plan.title === '..') throw new Error('Invalid project title');
  const expected = `remotion-clone/review/workflow-flash/${plan.title}/edit-plan.json`;
  if (planPath !== expected) throw new Error(`Plan must be stored in its existing single-title review project: ${expected}`);
  if (command === 'validate') {
    // Validate timing and UTF-8 SRT too, without creating any artifacts.
    const result = prepareArtifacts(plan, root);
    process.stdout.write(JSON.stringify(result.ok ? { ok: true, scope: 'data-only', title: plan.title, revision: plan.revision, totalFrames: plan.totalFrames, cueCount: result.report.cueCount } : { ok: false, errors: result.errors }, null, 2) + '\n');
    return result.ok ? 0 : 1;
  }
  const result = prepareArtifacts(plan, root);
  if (!result.ok) { process.stdout.write(JSON.stringify({ ok: false, errors: result.errors }, null, 2) + '\n'); return 1; }
  if (hash(fs.readFileSync(file)) !== hash(planBytes)) throw new Error('Plan changed during preparation; rerun against the current revision');
  writeArtifacts(root, result.artifacts);
  process.stdout.write(JSON.stringify({ ok: true, paths: result.handoff.paths, mediaValidated: false, readyForPackaging: false }, null, 2) + '\n');
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = { prepareArtifacts, writeArtifacts, main };
