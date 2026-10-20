// Small-library retrieval, no video model/embedding download. AI judges the shortlist.
const { ROOT, repoPath, json, args } = require('./common.cjs');
function tokens(text) {
  return new Set(String(text).toLowerCase().match(/[\p{Script=Han}]|[a-z0-9]+/gu) || []);
}
function search(entries, query, { root = ROOT, limit = 8 } = {}) {
  if (!Array.isArray(entries) || typeof query !== 'string' || !query.trim()) throw new Error('Expected inventory array and non-empty query');
  const wanted = tokens(query);
  return entries.map(e => {
    repoPath(root, e.source);
    if (typeof e.description !== 'string' || !Array.isArray(e.tags) || e.tags.some(t => typeof t !== 'string')) throw new Error('Each B-roll needs a description and tags');
    const terms = tokens([e.description, ...e.tags].join(' '));
    const score = [...wanted].filter(t => terms.has(t)).length / wanted.size;
    return { ...e, score, matchType: 'lexical-shortlist-not-verified-visual-match' };
  }).filter(e => e.score > 0).sort((a, b) => b.score - a.score || a.source.localeCompare(b.source)).slice(0, limit);
}
if (require.main === module) {
  try {
    const a = args(process.argv.slice(2));
    if (typeof a.index !== 'string' || typeof a.query !== 'string' || Object.keys(a).some(k => !['index', 'query'].includes(k))) throw new Error('Usage: broll_adapter.cjs --index REPO_PATH --query TEXT');
    console.log(JSON.stringify(search(json(repoPath(ROOT, a.index)), a.query), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { tokens, search };
