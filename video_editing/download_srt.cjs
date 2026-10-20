// Persist the exact completed-export bytes, never regenerate subtitles with an LLM.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, repoPath, json, digest, args, writeNew } = require('./common.cjs');
const { accept } = require('./voice_adapter.cjs');
function pointer(value, location) {
  if (typeof location !== 'string' || !location.startsWith('/')) throw new Error('Use an explicit JSON pointer to the actual completed export URL');
  for (const component of location.slice(1).split('/')) {
    const key = component.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || !Object.hasOwn(value, key)) throw new Error('Export URL pointer not found');
    value = value[key];
  }
  if (typeof value !== 'string' || new URL(value).protocol !== 'https:') throw new Error('Expected a completed HTTPS export URL');
  return value;
}
async function main(argv) {
  const a = args(argv);
  if (!['name', 'result', 'pointer'].every(k => typeof a[k] === 'string') || a['full-source'] !== true || (a.words !== undefined && typeof a.words !== 'string') || Object.keys(a).some(k => !['name', 'result', 'pointer', 'full-source', 'words'].includes(k))) throw new Error('Usage: download_srt.cjs --name FILENAME --result REPO_JSON --pointer /actual/url/key --full-source [--words RAW_JSON]');
  const url = pointer(json(repoPath(ROOT, a.result)), a.pointer);
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Subtitle download failed (${response.status})`);
  const limit = 10 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Export too large for this SRT-only receiver');
  const chunks = []; let size = 0;
  for await (const part of response.body) {
    size += part.length;
    if (size > limit) { await response.body.cancel().catch(() => {}); throw new Error('Export too large for SRT-only receiver'); }
    chunks.push(part);
  }
  const bytes = Buffer.concat(chunks);
  const dir = repoPath(ROOT, 'remotion-clone/.tmp/chatcut'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${digest(bytes)}.srt`);
  if (!fs.existsSync(file)) writeNew(file, bytes);
  // Validation happens before any fixed inbox file is accepted.
  return accept(a.name, file, { fullSource: true, words: a.words });
}
if (require.main === module) main(process.argv.slice(2)).then(v => console.log(JSON.stringify(v, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { pointer };
