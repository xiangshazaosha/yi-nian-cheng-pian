import copy
import unittest
from jianying_backend import frame_us, ranges, validate_content, generate
from unittest.mock import patch
from jianying_install import append_entry


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.fps = {"num": 30000, "den": 1001}
        self.clips = [{"inFrame": 7, "outFrame": 318, "atFrame": 0},
                      {"inFrame": 323, "outFrame": 539, "atFrame": 311}]
        self.spec = {"clips": self.clips, "broll": [], "fps": self.fps,
                     "source": "source.mp4", "media": {"source.mp4": {"absolute": "source.mp4"}}, "totalFrames": 527}
        self.content = {"duration": frame_us(527, self.fps),
                        "materials": {"videos": [{"id": "m", "path": "source.mp4"}]},
                        "tracks": [{"type": "video", "segments": [self.segment(c) for c in self.clips]}]}

    def segment(self, clip):
        src, dst = ranges(clip, self.fps)
        return {"source_timerange": src, "target_timerange": dst, "speed": 1.0, "volume": 1.0, "material_id": "m"}

    def test_ntsc_total(self):
        self.assertEqual(frame_us(1319, self.fps), 44010633)

    def test_absolute_boundaries_no_cumulative_drift(self):
        for frame in range(2252):
            _, a = ranges({"inFrame": frame, "outFrame": frame + 1, "atFrame": frame}, self.fps)
            _, b = ranges({"inFrame": frame + 1, "outFrame": frame + 2, "atFrame": frame + 1}, self.fps)
            self.assertEqual(a["start"] + a["duration"], b["start"])

    def test_file_readback(self):
        validate_content(self.content, self.spec)

    def test_wrong_source_cut_rejected(self):
        broken = copy.deepcopy(self.content)
        broken["tracks"][0]["segments"][1]["source_timerange"]["start"] += 1
        with self.assertRaises(ValueError): validate_content(broken, self.spec)

    def test_wrong_material_rejected(self):
        self.content["materials"]["videos"][0]["path"] = "wrong.mp4"
        with self.assertRaises(ValueError): validate_content(self.content, self.spec)

    def test_lost_audio_rejected(self):
        self.content["tracks"][0]["segments"][0]["volume"] = 0
        with self.assertRaises(ValueError): validate_content(self.content, self.spec)

    def test_broll_must_be_muted(self):
        b = {"inFrame": 0, "outFrame": 30, "atFrame": 100, "source": "broll.mp4"}
        self.spec["broll"] = [b]; self.spec["media"]["broll.mp4"] = {"absolute": "broll.mp4"}
        segment = self.segment(b); segment.update(volume=0.0, material_id="b")
        self.content["materials"]["videos"].append({"id": "b", "path": "broll.mp4"})
        self.content["tracks"].append({"type": "video", "segments": [segment]})
        validate_content(self.content, self.spec)
        segment["volume"] = 1
        with self.assertRaises(ValueError): validate_content(self.content, self.spec)

    def test_catalog_only_appends_new_entry(self):
        catalog = {"all_draft_store": [{"draft_id": "old", "draft_name": "Old", "unknown": [1]}], "draft_ids": 193}
        original = copy.deepcopy(catalog)
        new = {"draft_id": "new", "draft_name": "New", "draft_fold_path": "new"}
        result = append_entry(catalog, new)
        self.assertEqual(catalog, original)
        self.assertEqual(result["all_draft_store"][1:], original["all_draft_store"])
        self.assertEqual(result["draft_ids"], 193)

    def test_catalog_duplicate_rejected(self):
        catalog = {"all_draft_store": [{"draft_id": "old", "draft_name": "Old"}]}
        with self.assertRaises(ValueError): append_entry(catalog, {"draft_id": "new", "draft_name": "Old", "draft_fold_path": "new"})

    def test_retired_markers_rejected_before_backend_or_files(self):
        with patch('jianying_backend.backend') as backend, patch('jianying_backend.Path.mkdir') as mkdir:
            with self.assertRaisesRegex(ValueError, 'markers have been removed'):
                generate({'reviewMarkers': [{'startFrame': 30, 'note': 'Review'}]})
            backend.assert_not_called()
            mkdir.assert_not_called()

    def test_normal_inputs_pass_retired_feature_guard(self):
        for legacy in ({}, {'reviewMarkers': []}):
            with self.subTest(legacy=legacy), patch('jianying_backend.backend', side_effect=RuntimeError('backend reached')):
                with self.assertRaisesRegex(RuntimeError, 'backend reached'):
                    generate(legacy)


if __name__ == "__main__": unittest.main()
