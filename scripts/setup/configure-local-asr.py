"""Generate a new host-specific Vulkan config; no install, inference or overwrite."""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def component(root, value):
    path = (root / value).resolve(strict=True)
    tool_root = (root / 'tools/whisper-cpp').resolve()
    # Resolve both paths so symlinks cannot smuggle components outside the project.
    if not tool_root.is_relative_to(root) or not path.is_relative_to(tool_root) or not path.is_file():
        raise ValueError('Components must be real files inside project tools/whisper-cpp')
    if path.stat().st_size == 0:
        raise ValueError('Components must not be empty placeholder files')
    return path


def main(argv=None, project_root=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, help='Project-relative installed whisper-cli')
    parser.add_argument('--model', required=True, help='Project-relative verified full multilingual large-v3')
    parser.add_argument('--version', required=True, help='Actual installed whisper.cpp version')
    parser.add_argument('--gpu-name', required=True, help='Exact target GPU name from the actual GPU log')
    args = parser.parse_args(argv)
    if not args.version.strip() or not args.gpu_name.strip() or any(
            marker in value.upper() for value in (args.version, args.gpu_name) for marker in ('REPLACE_', 'PLACEHOLDER')):
        raise ValueError('Real installed version and GPU name are required')
    root = Path(project_root).resolve() if project_root else Path(__file__).resolve().parents[2]
    output = root / 'tools/whisper-cpp/runtime-config.json'
    if output.exists():
        raise FileExistsError('Existing runtime-config.json preserved; revalidate it or archive it explicitly first')
    template = root / 'config/examples/whisper-cpp-vulkan.example.json'
    config = json.loads(template.read_text(encoding='utf-8-sig'))
    binary, model = component(root, args.binary), component(root, args.model)
    config.update(version=args.version.strip(), binary=binary.relative_to(root).as_posix(),
                  binarySha256=sha256(binary), model=model.relative_to(root).as_posix(),
                  modelSha256=sha256(model), modelBytes=model.stat().st_size,
                  expectedGpuName=args.gpu_name.strip())
    # The template contains no author-host GPU workarounds or passed states.
    with output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(config, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'saved': output.relative_to(root).as_posix(), 'gpuVerified': False,
                      'sourceAuthenticityVerified': False, 'inferenceStatus': 'not-validated',
                      'nextStep': 'Verify official component sources, --help compatibility, and a real GPU speech sample.'}))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        raise SystemExit(1)
