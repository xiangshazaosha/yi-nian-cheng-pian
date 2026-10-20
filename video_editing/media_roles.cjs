// Naming-only intake. No media decoding, ASR, vision or workflow imports here.
const fs = require('node:fs');
const path = require('node:path');
const VIDEO = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);
const SKIP = new Set(['node_modules', '.git', 'review', 'out', 'dist']);
function namedRole(value) {
  const name = value.normalize('NFKC');
  const b = /(?:^|[^a-z])b[-_ ]?roll(?=$|[^a-z])/iu.test(name);
  const a = /口播|主讲|(?:^|[^a-z])a[-_ ]?roll(?=$|[^a-z])/iu.test(name);
  return b && a ? 'conflict' : b ? 'broll' : a ? 'speech' : null;
}
function classifyPaths(paths, { rootName = '', mode = 'auto' } = {}) {
  if (!Array.isArray(paths) || !['auto', 'vlog'].includes(mode)) throw new Error('Expected paths and auto/vlog mode');
  const videos = paths.filter(p => VIDEO.has(path.posix.extname(p).toLowerCase())).sort().map(p => {
    if (typeof p !== 'string' || p.includes('\\') || p.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('Expected relative forward-slash paths');
    const parts = p.split('/'), filename = parts.pop();
    let role = namedRole(path.posix.parse(filename).name), evidence = role ? 'filename' : null;
    for (const part of [...parts].reverse().concat(rootName)) {
      if (role) break;
      role = namedRole(part); if (role) evidence = 'folder';
    }
    return { path: p, role: role || 'speech', roleEvidence: evidence || 'unmarked-default-speech',
      nameHint: path.posix.parse(filename).name, nameIsContentProof: false };
  });
  const conflicts = videos.filter(v => v.role === 'conflict').map(v => v.path);
  const brollVideos = videos.filter(v => v.role === 'broll').map(v => v.path);
  const speechVideos = videos.filter(v => v.role === 'speech').map(v => v.path);
  const workflow = conflicts.length ? 'naming-conflict' : !videos.length ? 'no-video' : mode === 'vlog' ? 'visual-vlog'
    : brollVideos.length ? speechVideos.length ? 'speech-with-broll' : 'broll-only' : 'speech-only';
  const needsVisualSelection = !conflicts.length && videos.length > 0 && (mode === 'vlog' || brollVideos.length > 0);
  return { schemaVersion: 1, mode, workflow, hasBroll: brollVideos.length > 0, needsVisualSelection,
    speechVideos, brollVideos, visualVideos: mode === 'vlog' ? videos.map(v => v.path) : brollVideos,
    conflicts, videos, rulesToLoad: needsVisualSelection ? [mode === 'vlog' ? 'docs/workflows/visual-vlog.md' : 'docs/workflows/broll-selection.md'] : [],
    note: 'Naming selects roles and workflow only; it does not authorize editing or prove visual content.' };
}
function scanInput(input, { depth = 2, mode = 'auto' } = {}) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 32) throw new Error('Depth must be an integer from 0 to 32');
  const absolute = path.resolve(input), stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error('Select a real input, not a symlink/junction');
  const scope = stat.isDirectory() ? absolute : path.dirname(absolute);
  const files = [], unscannedDirectories = [];
  function walk(dir, level) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name), rel = path.relative(scope, p).split(path.sep).join('/');
      if (e.isSymbolicLink()) { unscannedDirectories.push(rel); continue; }
      if (e.isDirectory()) {
        if (SKIP.has(e.name.toLowerCase())) continue;
        if (level < depth) walk(p, level + 1); else unscannedDirectories.push(rel);
      } else if (e.isFile()) files.push(rel);
      if (files.length > 100000) throw new Error('Input too large; select a narrower media folder');
    }
  }
  if (stat.isDirectory()) walk(scope, 0);
  else if (stat.isFile()) files.push(path.basename(absolute));
  else throw new Error('Input must be a file or directory');
  return { ...classifyPaths(files, { rootName: path.basename(scope), mode }),
    namingCoverageComplete: unscannedDirectories.length === 0, unscannedDirectories };
}
if (require.main === module) {
  try {
    const a = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const k = process.argv[i];
      if (!['--input', '--depth', '--mode'].includes(k) || a[k] !== undefined || !process.argv[i + 1]) throw new Error('Usage: media_roles.cjs --input PATH [--depth 2] [--mode auto|vlog]');
      a[k] = process.argv[i + 1];
    }
    if (!a['--input']) throw new Error('--input is required');
    // ASCII JSON survives Windows PowerShell 5 native-pipe codepages.
    console.log(JSON.stringify(scanInput(a['--input'], { depth: Number(a['--depth'] ?? 2), mode: a['--mode'] || 'auto' }), null, 2)
      .replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { namedRole, classifyPaths, scanInput };
