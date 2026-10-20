"""Synthetic release tests. No real projects, network, credentials or install."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("public_release", Path(__file__).with_name("release.py"))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="synthetic-release-")
        self.root = Path(self.tmp.name).resolve()
        self.addCleanup(self.tmp.cleanup)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Synthetic release test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "core.autocrlf", "false")
        files = {
            ".gitignore": b"tools/\n",
            "AGENTS.md": b"Keep authorization gates.\n",
            "LICENSE": b"Synthetic test license only.\n",
            "README.md": b"# Synthetic\n",
            "package.json": r.encoded({"private": True, "scripts": {"render:full": "old"}}),
            "remotion-clone/package.json": r.encoded({"scripts": {"typecheck": "tsc", "render:full": "old"}}),
            "remotion-clone/src/lib/theme.ts": b"export const COLOR = '#000';\n",
        }
        self.policy = {"version": "0.0.0", "licenseSha256": r.sha(files["LICENSE"]),
                       "files": list(files), "prefixes": ["release/"],
                       "overrides": {}, "omitted_link_prefixes": ["docs/history/"]}
        files[r.POLICY] = r.encoded(self.policy)
        for name, data in files.items():
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        self.git("add", ".")
        self.git("commit", "-qm", "Synthetic")

    def git(self, *args, cwd=None):
        return subprocess.check_output(["git", *args], cwd=cwd or self.root, stderr=subprocess.DEVNULL)

    def build(self, name="one"):
        dest = self.root / "tools/releases" / name
        with contextlib.redirect_stdout(io.StringIO()):
            manifest = r.export("HEAD", dest, self.root)
        return dest, manifest

    def test_deterministic_export(self):
        a, ma = self.build("one")
        b, mb = self.build("two")
        self.assertEqual(ma, mb)
        self.assertEqual((a / r.MANIFEST).read_bytes(), (b / r.MANIFEST).read_bytes())

    def test_existing_output_not_overwritten(self):
        dest, _ = self.build()
        with self.assertRaises(FileExistsError):
            r.export("HEAD", dest, self.root)

    def test_output_outside_scope_rejected(self):
        with self.assertRaises(ValueError):
            r.export("HEAD", self.root / "production", self.root)

    def test_scope_root_not_allowed(self):
        with self.assertRaises(ValueError):
            r.export("HEAD", self.root / "tools/releases", self.root)

    def test_dirty_and_untracked_input_not_exported(self):
        (self.root / "README.md").write_text("Uncommitted private text", encoding="utf-8")
        (self.root / "private.txt").write_text("Untracked private text", encoding="utf-8")
        dest, _ = self.build()
        self.assertEqual((dest / "README.md").read_text(), "# Synthetic\n")
        self.assertFalse((dest / "private.txt").exists())

    def test_unsafe_paths_rejected(self):
        for name in ["../x", "/x", "C:/x", "a\\x", ""]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                r.safe(name)

    def test_link_traversal_rejected(self):
        with self.assertRaises(ValueError):
            r.target("README.md", "../private.md")

    def test_manifest_drift_detected(self):
        dest, _ = self.build()
        (dest / "README.md").write_text("Changed", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "manifest drift"):
            r.check(dest)

    def test_removed_file_detected(self):
        dest, _ = self.build()
        (dest / "README.md").rename(dest / "renamed.md")
        with self.assertRaisesRegex(ValueError, "missing/unsafe"):
            r.check(dest)

    def test_secret_is_reported_without_value(self):
        dest, _ = self.build()
        token = "ghp_" + "a" * 36
        (dest / "README.md").write_text(token, encoding="utf-8")
        with self.assertRaises(ValueError) as ctx:
            r.check(dest)
        self.assertIn("github-token", str(ctx.exception))
        self.assertNotIn(token, str(ctx.exception))

    def test_extra_tracked_data_rejected(self):
        dest, _ = self.build()
        self.git("init", "-q", "-b", "main", cwd=dest)
        (dest / "receipt.json").write_text("{}", encoding="utf-8")
        self.git("add", "receipt.json", cwd=dest)
        with self.assertRaisesRegex(ValueError, "outside manifest"):
            r.check(dest)

    def test_independent_version_not_inferred_from_archive(self):
        dest, manifest = self.build()
        self.assertEqual(manifest["version"], "0.0.0")
        self.assertNotIn("render:full", json.loads((dest / "package.json").read_text())["scripts"])

    def test_headings_unicode_and_duplicates(self):
        self.assertEqual(r.headings("# Hello\n## Hello\n## 字幕 与 规则"),
                         {"hello", "hello-1", "字幕-与-规则"})

    def test_public_transform_is_idempotent(self):
        _, source = r.snapshot("HEAD", self.root)
        once = r.transform(source, self.policy)
        self.assertEqual(once, r.transform(once, self.policy))


if __name__ == "__main__":
    unittest.main()
