"""Generator tests only; actual Resolve evidence is recorded separately."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import resolve_smoke


class SmokeGeneratorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='video-resolve-smoke-')
        self.root = Path(self.tmp.name)
        self.addCleanup(self.cleanup)
        (self.root / 'source.mp4').write_bytes(b'fixture-not-real-video')
        inbox = self.root / 'asr-inbox/source.mp4'
        inbox.mkdir(parents=True)
        self.metadata = inbox / 'source.json'
        self.metadata.write_text(json.dumps({
            'source': 'source.mp4', 'frames': 2253, 'fps': {'num': 30000, 'den': 1001},
            'sourceSha256': hashlib.sha256(b'fixture-not-real-video').hexdigest(),
        }), encoding='utf-8')
        (self.root / 'review').mkdir()
        (self.root / 'review/project.json').write_text('{}', encoding='utf-8')
    def prepare(self):
        return resolve_smoke.prepare('source.mp4', 'review', 'test', self.root)
    def cleanup(self):
        self.assertEqual(self.root.resolve().parent, Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.root.name.startswith('video-resolve-smoke-'))
        self.tmp.cleanup()
    def test_generates_explicit_non_editorial_fixture(self):
        self.prepare()
        report = json.loads((self.root / 'review/technical-test.json').read_text(encoding='utf-8'))
        self.assertEqual(report['expectedEditedFrames'], 2193)
        self.assertFalse(report['editorialApproved'])
        self.assertFalse(report['readyForPackaging'])
        script = (self.root / 'review/resolve-smoke.lua').read_text(encoding='utf-8')
        self.assertNotIn('@MEDIA_DIR@', script)
        self.assertIn('endFrame=origin+span[2],', script)
        self.assertIn('02-api-test-NOT-FINAL', script)
    def test_refuses_overwrite(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            self.prepare()
    def test_rejects_changed_source(self):
        (self.root / 'source.mp4').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            self.prepare()
    def test_rejects_escaping_source_name(self):
        with self.assertRaisesRegex(ValueError, 'filename'):
            resolve_smoke.prepare('../source.mp4', 'review', 'test', self.root)


if __name__ == '__main__':
    unittest.main()
