"""Synthetic component files only; no engine, downloads, model or GPU required."""
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('configure-local-asr.py')
spec = importlib.util.spec_from_file_location('configure_asr', SCRIPT)
configure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure)


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        example = 'config/examples/whisper-cpp-vulkan.example.json'
        (self.root / example).parent.mkdir(parents=True)
        shutil.copyfile(SCRIPT.parents[2] / example, self.root / example)
        tool = self.root / 'tools/whisper-cpp'
        tool.mkdir(parents=True)
        (tool / 'engine.exe').write_bytes(b'synthetic engine')
        (tool / 'ggml-large-v3.bin').write_bytes(b'synthetic model; not inference evidence')
        self.args = ['--binary', 'tools/whisper-cpp/engine.exe', '--model',
                     'tools/whisper-cpp/ggml-large-v3.bin', '--version', '1.2.3', '--gpu-name', 'Test GPU']

    def generate(self, args=None):
        with redirect_stdout(io.StringIO()):
            return configure.main(args or self.args, project_root=self.root)

    def test_actual_hashes_but_no_passed_status_or_author_workarounds(self):
        self.assertEqual(self.generate(), 0)
        config = json.loads((self.root / 'tools/whisper-cpp/runtime-config.json').read_text(encoding='utf-8'))
        self.assertEqual(config['binarySha256'], hashlib.sha256(b'synthetic engine').hexdigest())
        self.assertEqual(config['environment'], {})
        self.assertEqual(config['expectedGpuName'], 'Test GPU')
        self.assertEqual(config['inferenceStatus'], 'not-validated')
        self.assertEqual(config['productionQualityStatus'], 'not-validated')
        self.assertFalse(config['autoFallback'])

    def test_existing_configuration_is_never_overwritten(self):
        self.generate()
        output = self.root / 'tools/whisper-cpp/runtime-config.json'
        before = output.read_bytes()
        with self.assertRaises(FileExistsError):
            self.generate()
        self.assertEqual(output.read_bytes(), before)

    def test_outside_component_rejected_without_configuration(self):
        (self.root / 'elsewhere.bin').write_bytes(b'outside')
        args = self.args.copy()
        args[1] = 'elsewhere.bin'
        with self.assertRaisesRegex(ValueError, 'inside project'):
            self.generate(args)
        self.assertFalse((self.root / 'tools/whisper-cpp/runtime-config.json').exists())

    def test_missing_component_is_not_installation(self):
        (self.root / 'tools/whisper-cpp/engine.exe').unlink()
        with self.assertRaises(FileNotFoundError):
            self.generate()

    def test_placeholder_not_accepted_as_real_host(self):
        args = self.args.copy()
        args[-1] = 'REPLACE_WITH_GPU'
        with self.assertRaises(ValueError):
            self.generate(args)


if __name__ == '__main__':
    unittest.main()
