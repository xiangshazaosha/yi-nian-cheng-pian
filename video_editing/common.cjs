const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { repoPath } = require('../scripts/editing/contract.cjs');
const ROOT = path.resolve(__dirname, '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
async function fileHash(p) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(p)) h.update(chunk);
  return h.digest('hex');
}
function relative(p, root = ROOT) { return path.relative(root, p).split(path.sep).join('/'); }
function mediaProbe(p) {
  const exe = process.env.VIDEO_FFPROBE || path.join(ROOT, 'remotion-clone/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe');
  const r = spawnSync(exe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p], { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`Media probe failed: ${r.error?.message || r.stderr}`);
  const v = JSON.parse(r.stdout); const video = v.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video) throw new Error('A video stream is required');
  const fps = video.avg_frame_rate.split('/').map(Number);
  if (fps.length !== 2 || !fps.every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid video frame rate');
  const duration = Number(video.duration || v.format.duration);
  if (!(duration > 0 && Number.isFinite(duration))) throw new Error('Invalid video duration');
  return { duration, fps: { num: fps[0], den: fps[1] }, nominalRate: video.r_frame_rate,
    frames: Number(video.nb_frames) || Math.round(duration * fps[0] / fps[1]),
    width: video.width, height: video.height, hasAudio: v.streams.some(s => s.codec_type === 'audio') };
}
function writeNew(p, value) {
  fs.writeFileSync(p, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
function args(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    if (!/^--[a-z-]+$/.test(argv[i]) || values[argv[i].slice(2)] !== undefined) throw new Error('Use unique --name value arguments');
    const key = argv[i].slice(2);
    values[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return values;
}
module.exports = { ROOT, repoPath, digest, json, fileHash, relative, mediaProbe, writeNew, args };
