"""Import one confirmed user SFX; retain provenance, never copy the external original.

No automatic segmentation: inspect a source before choosing --start/--end.
The peak marker is measured, not a claim of independent listening.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'remotion-clone/public'
FFMPEG = ROOT / 'tools/chatcut-runtime/.chatcut/cache/ffmpeg/8.1/win32-x64/ffmpeg.exe'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True, type=Path)
    p.add_argument('--id', required=True)
    p.add_argument('--name', required=True)
    p.add_argument('--use', required=True)
    p.add_argument('--start', type=float, default=0)
    p.add_argument('--end', type=float)
    args = p.parse_args()
    if not re.fullmatch(r'user-[a-z0-9]+(?:-[a-z0-9]+)*', args.id):
        raise ValueError('Stable asset ID must be user-<lowercase-hyphenated-name>')
    catalog_path = PUBLIC / 'sfx/catalog.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    data = subprocess.check_output([str(FFMPEG), '-v', 'error', '-nostdin', '-i', str(args.source),
        '-ar', '44100', '-ac', '2', '-f', 'f32le', 'pipe:1'], creationflags=0x08000000)
    original = np.frombuffer(data, dtype='<f4').reshape(-1, 2)
    end = args.end if args.end is not None else len(original) / 44100
    if not 0 <= args.start < end <= len(original) / 44100 + 1e-6:
        raise ValueError('Invalid source range')
    x = original[round(args.start * 44100):round(end * 44100)].copy()
    # Tiny endpoint fades only; no speed, pitch, denoise or per-film gain baked in.
    n = min(132, len(x) // 2)
    x[:n] *= np.linspace(0, 1, n)[:, None]
    x[-n:] *= np.linspace(1, 0, n)[:, None]
    peak = float(np.max(np.abs(x)))
    gain = min(1.0, 0.85 / max(peak, 1e-12))
    x *= gain
    runtime = f'sfx/{args.id}.wav'
    output = PUBLIC / runtime
    source_hash = sha(args.source)
    previous = catalog['assets'].get(args.id)
    if previous:
        if (previous['originalSha256'] != source_hash or
            previous['sourceRangeSeconds'] != [args.start, end] or
            not output.exists() or sha(output) != previous['sha256']):
            raise ValueError('Refusing conflicting asset ID or changed existing file')
        print(json.dumps({'status': 'already-imported', 'id': args.id}))
        return
    if output.exists():
        raise ValueError('Refusing unregistered file overwrite')
    scratch_root = ROOT / 'remotion-clone/.tmp'
    scratch_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=scratch_root) as scratch:
        staged = Path(scratch) / 'asset.wav'
        subprocess.run([str(FFMPEG), '-v', 'error', '-nostdin', '-n', '-f', 'f32le',
            '-ar', '44100', '-ac', '2', '-i', 'pipe:0', '-c:a', 'pcm_s24le', str(staged)],
            input=x.astype('<f4').tobytes(), check=True, creationflags=0x08000000)
        staged.replace(output)
    catalog['assets'][args.id] = {
        'id': args.id, 'displayName': args.name, 'runtimePath': runtime,
        'sourceKind': 'user_provided', 'originalFilename': args.source.name,
        'sourceRetainedInProject': False, 'originalSha256': source_hash,
        'sourceRangeSeconds': [args.start, end],
        'processing': '3ms endpoint fades; peak cap 0.85 only if needed; PCM24 44100Hz stereo; no speed or pitch change',
        'masterGain': gain, 'durationSeconds': len(x) / 44100, 'sha256': sha(output),
        'measuredPeakOffsetSeconds': int(np.max(np.abs(x), axis=1).argmax()) / 44100,
        'measuredPeak': float(np.max(np.abs(x))), 'intendedUse': args.use,
        'tags': [], 'reuseRights': 'user supplied; upstream commercial license not independently verified',
        'references': [], 'listenedByAgent': False,
    }
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'imported', 'id': args.id, 'runtimePath': runtime, 'duration': len(x)/44100}))

if __name__ == '__main__':
    main()
