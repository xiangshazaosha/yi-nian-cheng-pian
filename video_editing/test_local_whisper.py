"""Launcher integration tests use a fake engine, no models, GPU, or uploads."""
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import wave

from local_whisper import main


class LocalWhisperTests(unittest.TestCase):
    def run_fake(self, *, invalid=False, gpu=True, code=0, tamper_vad=False, recovery=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "tools/whisper-cpp"
            root.mkdir(parents=True)
            config = {"binary": "tools/whisper-cpp/engine.exe", "model": "tools/whisper-cpp/model.bin",
                      "vadModel": "tools/whisper-cpp/vad.bin", "expectedGpuName": "Test GPU",
                      "environment": {"GGML_VK_DISABLE_COOPMAT": "1"},
                      "extraCliArguments": ["-nfa", "--device", "0", "-mc", "0", "--vad", "-vm", "vad.bin"]}
            for filename, key in [("engine.exe", "binarySha256"), ("model.bin", "modelSha256"), ("vad.bin", "vadModelSha256")]:
                p = root / filename
                p.write_bytes(filename.encode())
                config[key] = hashlib.sha256(p.read_bytes()).hexdigest()
            (root / "runtime-config.json").write_text(json.dumps(config), encoding="utf-8")
            if recovery:
                config['longPauseRecovery'] = True
                (root / "runtime-config.json").write_text(json.dumps(config), encoding="utf-8")
            wav = root / "input.wav"
            with wave.open(str(wav), "wb") as w:
                w.setparams((1, 2, 16000, 16000, "NONE", "not compressed"))
                w.writeframes(b"\x00\x00" * (160000 if recovery else 16000))
            before = wav.read_bytes()
            if tamper_vad:
                (root / "vad.bin").write_bytes(b"changed")

            def engine(args, **kwargs):
                prefix = root / args[args.index("-of") + 1]
                end = 0 if invalid else 1000
                prefix.with_suffix(".srt").write_text(f"1\n00:00:00,000 --> 00:00:0{end//1000},000\n测试字幕\n", encoding="utf-8")
                prefix.with_suffix(".json").write_text(json.dumps({"transcription": [
                    {"offsets": {"from": 0, "to": end}, "text": "测试字幕",
                     'tokens':[{'text':'测试字幕','offsets':{'from':0,'to':end}}]}]}), encoding="utf-8")
                kwargs["stderr"].write(b"Test GPU; using Vulkan0 backend\n" if gpu else b"CPU only\n")
                if recovery and '--vad' in args:
                    kwargs['stderr'].write(b'vad_segment_info: orig_start: 0.00, orig_end: 0.50\nvad_segment_info: orig_start: 9.00, orig_end: 10.00\n')
                elif '--vad' in args:
                    kwargs['stderr'].write(b'vad_segment_info: orig_start: 0.00, orig_end: 1.00\n')
                self.assertNotIn("-ng", args)
                self.assertEqual(kwargs["env"]["GGML_VK_DISABLE_COOPMAT"], "1")
                return subprocess.CompletedProcess(args, code)

            output = io.StringIO()
            with patch("local_whisper.subprocess.run", side_effect=engine) as process, redirect_stdout(output):
                if tamper_vad:
                    with self.assertRaisesRegex(RuntimeError, "identity changed"):
                        main(["--wav", str(wav)], tool_root=root)
                    process.assert_not_called()
                    return
                result = main(["--wav", str(wav)], tool_root=root)
            self.assertEqual(wav.read_bytes(), before)
            receipt = json.loads(output.getvalue())
            self.assertFalse(receipt["contentVerified"])
            self.assertFalse(receipt["readyForPackaging"])
            expected=1 if (not gpu or code) else (3 if recovery else 2)
            self.assertEqual(process.call_count, expected)  # No CPU/cloud fallback.
            return result, receipt

    def test_valid_engine_output_remains_raw(self):
        result, receipt = self.run_fake()
        self.assertEqual(result, 0)
        self.assertTrue(receipt["qualityValidationPassed"])
        self.assertTrue(receipt['fineTimingStructuralPassed'])
        self.assertTrue(receipt['words'].endswith('/source-timing.json'))

    def test_exit_zero_with_bad_captions_is_failure(self):
        result, receipt = self.run_fake(invalid=True)
        self.assertEqual(result, 1)
        self.assertEqual(receipt["status"], "failed-quality-validation")

    def test_cpu_fallback_not_accepted(self):
        self.assertEqual(self.run_fake(gpu=False)[0], 1)

    def test_nonzero_engine_exit_not_accepted(self):
        self.assertEqual(self.run_fake(code=1)[0], 1)

    def test_tampered_vad_rejected_before_engine(self):
        self.run_fake(tamper_vad=True)

    def test_long_pause_recovery_runs_contiguous_chunks(self):
        result, receipt = self.run_fake(recovery=True)
        self.assertEqual(result, 0)
        self.assertTrue(receipt['sourceTimelineRecoveryUsed'])
        self.assertTrue(receipt['srt'].endswith('/source-timeline.srt'))


if __name__ == "__main__":
    unittest.main()
