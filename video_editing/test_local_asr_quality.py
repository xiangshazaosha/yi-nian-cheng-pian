import json
from pathlib import Path
import tempfile
import unittest

from local_asr_quality import inspect_outputs, parse_srt


def stamp(ms):
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


class LocalAsrQualityTests(unittest.TestCase):
    def check(self, rows, mutate=None, duration=60):
        with tempfile.TemporaryDirectory() as tmp:
            srt = Path(tmp) / "raw.srt"
            raw = Path(tmp) / "raw.json"
            srt.write_text("\n\n".join(f"{i}\n{stamp(s)} --> {stamp(e)}\n{t}"
                                         for i, (s, e, t) in enumerate(rows, 1)), encoding="utf-8")
            data = {"transcription": [{"offsets": {"from": s, "to": e}, "text": t} for s, e, t in rows]}
            if mutate:
                mutate(data)
            raw.write_text(json.dumps(data), encoding="utf-8")
            before = srt.read_bytes(), raw.read_bytes()
            result = inspect_outputs(srt, raw, duration)
            self.assertEqual(before, (srt.read_bytes(), raw.read_bytes()))
            return result

    def codes(self, report):
        return [e["code"] for e in report["errors"]]

    def test_valid_output_is_still_pending_content_review(self):
        r = self.check([(0, 2000, "朋友们"), (2000, 4000, "本地转写")])
        self.assertTrue(r["passed"])
        self.assertFalse(r["contentVerified"])
        self.assertFalse(r["wordTimingVerified"])

    def test_zero_duration_is_rejected(self):
        self.assertIn("non-positive-duration", self.codes(self.check([(0, 0, "坏时间")])) )

    def test_reversed_duration_is_rejected(self):
        self.assertFalse(self.check([(500, 100, "倒退")])["passed"])

    def test_source_overflow_is_rejected(self):
        self.assertIn("outside-source", self.codes(self.check([(0, 61000, "越界")])) )

    def test_overlap_is_rejected(self):
        self.assertIn("overlapping-or-backward-cue", self.codes(self.check([(0, 3000, "前句"), (2000, 4000, "后句")])) )

    def test_loop_is_blocked_for_review_not_deleted(self):
        r = self.check([(i * 3000, (i + 1) * 3000, "就是说这个口播是有关系性的") for i in range(6)])
        self.assertIn("suspected-repetition-loop-review-required", self.codes(r))
        self.assertEqual(r["cueCount"], 6)

    def test_normal_two_retakes_are_not_a_loop(self):
        self.assertTrue(self.check([(0, 3000, "最后我们分别导出"), (3000, 6000, "最后我们分别导出")])["passed"])

    def test_long_cue_is_warning_not_automatic_deletion(self):
        r = self.check([(0, 14000, "可能是慢速表达，必须核对音频")])
        self.assertTrue(r["passed"])
        self.assertTrue(r["warnings"])

    def test_json_text_mismatch(self):
        r = self.check([(0, 1000, "原文")], lambda j: j["transcription"][0].update(text="别的"))
        self.assertIn("srt-json-cue-mismatch", self.codes(r))

    def test_json_time_mismatch(self):
        r = self.check([(0, 1000, "原文")], lambda j: j["transcription"][0]["offsets"].update(to=999))
        self.assertFalse(r["passed"])

    def test_json_count_mismatch(self):
        self.assertFalse(self.check([(0, 1000, "原文")], lambda j: j.update(transcription=[]))["passed"])

    def test_missing_output(self):
        self.assertFalse(inspect_outputs("not-present.srt", "not-present.json", 5)["passed"])

    def test_bad_srt(self):
        for bad in ["", "1\n00:60:00,000 --> 00:00:01,000\n坏时间", "1\nnot-time\n内容"]:
            with self.assertRaises(ValueError):
                parse_srt(bad)

    def test_crlf_and_bom(self):
        self.assertEqual(parse_srt("\ufeff1\r\n00:00:00,000 --> 00:00:01,000\r\n原文\r\n")[0]["text"], "原文")

    def test_invalid_duration(self):
        self.assertFalse(inspect_outputs("a", "b", float("nan"))["passed"])


if __name__ == "__main__":
    unittest.main()
