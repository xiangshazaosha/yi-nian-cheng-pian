"""Synthetic official-API contract tests, not a claim of live Resolve verification."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import resolve_adapter as adapter


class Clip:
    def __init__(self, info):
        self.info = info
    def GetStart(self):
        return self.info["recordFrame"]
    def GetDuration(self):
        # Live Resolve 21.1.1.10 uses an exclusive AppendToTimeline endFrame.
        return self.info["endFrame"] - self.info["startFrame"]
    def GetLeftOffset(self):
        return self.info["startFrame"]


class Media:
    def GetClipProperty(self, key):
        return "0" if key == "Start" else ""


class Timeline:
    def __init__(self, name):
        self.name = name
        self.tracks = {"video": [[]], "audio": [[]]}
        self.links = []
    def SetStartTimecode(self, value):
        return value == "00:00:00:00"
    def GetStartFrame(self):
        return 0
    def GetSetting(self, key):
        return "10" if key == "timelineFrameRate" else None
    def GetTrackCount(self, kind):
        return len(self.tracks[kind])
    def AddTrack(self, kind):
        self.tracks[kind].append([])
        return True
    def SetClipsLinked(self, clips, enabled):
        self.links.append(clips)
        return enabled
    def GetItemListInTrack(self, kind, index):
        return self.tracks[kind][index - 1] if index <= len(self.tracks[kind]) else []


class Pool:
    def __init__(self, project):
        self.project = project
    def ImportMedia(self, paths):
        return [Media()]
    def CreateEmptyTimeline(self, name):
        t = Timeline(name)
        self.project.timelines.append(t)
        return t
    def AppendToTimeline(self, infos):
        clips = []
        for info in infos:
            c = Clip(info)
            kind = "video" if info["mediaType"] == 1 else "audio"
            self.project.current.tracks[kind][info["trackIndex"] - 1].append(c)
            clips.append(c)
        return clips


class Project:
    def __init__(self):
        self.timelines = []
        self.current = None
        self.pool = Pool(self)
    def SetSetting(self, name, value):
        return name == "timelineFrameRate"
    def GetMediaPool(self):
        return self.pool
    def SetCurrentTimeline(self, t):
        self.current = t
        return True


class Manager:
    def __init__(self, names=None):
        self.names = names or []
        self.project = None
    def GetProjectListInCurrentFolder(self):
        return self.names
    def GetCurrentProject(self):
        return self.project
    def CreateProject(self, name, media_location=None):
        self.project = Project()
        return self.project
    def SaveProject(self):
        return True
    def ExportProject(self, name, destination):
        Path(destination).write_bytes(b"SYNTHETIC DRP PLACEHOLDER - NOT A RESOLVE FILE")
        return True


class Resolve:
    def __init__(self, manager=None):
        self.manager = manager or Manager()
    def GetProjectManager(self):
        return self.manager


class ResolveTests(unittest.TestCase):
    def setUp(self):
        base = adapter.ROOT / "remotion-clone/.tmp"
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="resolve-test-", dir=base)
        self.root = Path(self.temp.name).resolve()
        self.base = base.resolve()
        def write(name, data):
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        write("source.mp4", b"synthetic media")
        write("broll.mp4", b"synthetic broll")
        write("edit_plan.json", json.dumps({"source": "source.mp4", "cuts": [{"start": 4, "end": 6, "reason": "synthetic"}], "broll": [{"start": 2, "end": 4, "source": "broll.mp4", "source_start": 1, "reason": "synthetic"}]}).encode())
        write("captions-edited.srt", b"synthetic subtitles")
        self.spec = {
            "plan": "edit_plan.json", "planSha256": adapter.digest_file(self.root / "edit_plan.json"),
            "subtitles": "captions-edited.srt", "subtitleSha256": adapter.digest_file(self.root / "captions-edited.srt"),
            "source": "source.mp4", "sourceFrames": 100, "totalFrames": 80,
            "sources": [{"path": n, "sha256": adapter.digest_file(self.root / n)} for n in ("source.mp4", "broll.mp4")],
            "fps": {"num": 10, "den": 1},
            "clips": [{"inFrame": 0, "outFrame": 40, "atFrame": 0}, {"inFrame": 60, "outFrame": 100, "atFrame": 40}],
            "broll": [{"source": "broll.mp4", "inFrame": 10, "outFrame": 30, "atFrame": 20, "reason": "synthetic", "audio": "muted", "burnedInSubtitles": None}],
        }
        self.save_spec()
    def save_spec(self):
        (self.root / "resolve-input.json").write_text(json.dumps(self.spec), encoding="utf-8")
    def tearDown(self):
        # Verify absolute recursive cleanup target is a test directory under .tmp.
        self.assertTrue(self.root.is_relative_to(self.base))
        self.assertTrue(self.root.name.startswith("resolve-test-"))
        self.temp.cleanup()
    def test_constructs_raw_and_edited_editable_tracks(self):
        r = Resolve()
        result = adapter.execute(r, "resolve-input.json", "test", self.root)
        self.assertEqual(result["timelines"], ["01-original", "02-ai-edit"])
        self.assertFalse(result["readyForPackaging"])
        self.assertFalse(result["audioVisualReviewed"])
        t = r.manager.project.current
        self.assertEqual(len(t.tracks["video"][1]), 1)
        self.assertEqual(len(t.tracks["audio"]), 1)
        self.assertEqual([c.GetDuration() for c in t.tracks["audio"][0]], [40, 40])
        self.assertEqual(len(t.links), 2)
    def test_exclusive_api_end_frame(self):
        r = Resolve()
        adapter.execute(r, "resolve-input.json", "test", self.root)
        last = r.manager.project.current.tracks["video"][0][-1]
        self.assertEqual(last.info["endFrame"], 100)
    def test_existing_project_is_not_overwritten(self):
        with self.assertRaisesRegex(ValueError, "Existing project"):
            adapter.execute(Resolve(Manager(["test"])), "resolve-input.json", "test", self.root)
    def test_changed_plan_is_rejected(self):
        (self.root / "edit_plan.json").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "Plan changed"):
            adapter.load_spec("resolve-input.json", self.root)
    def test_changed_source_is_rejected(self):
        (self.root / "source.mp4").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "identity"):
            adapter.load_spec("resolve-input.json", self.root)
    def test_invalid_timeline_geometry_is_rejected(self):
        self.spec["clips"][1]["atFrame"] = 41
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "geometry"):
            adapter.load_spec("resolve-input.json", self.root)
    def test_no_output_overwrite(self):
        (self.root / "resolve-project.drp").write_bytes(b"old")
        with self.assertRaisesRegex(ValueError, "overwrite"):
            adapter.execute(Resolve(), "resolve-input.json", "test", self.root)
    def test_paths_cannot_escape(self):
        for p in ["../escape", "C:/file", "bad\\path", "/absolute"]:
            with self.assertRaises(ValueError):
                adapter.repo_path(p, self.root)
    def test_changed_derived_broll_is_rejected(self):
        self.spec["broll"][0]["atFrame"] = 21
        self.save_spec()
        with self.assertRaisesRegex(ValueError, "B-roll differs"):
            adapter.load_spec("resolve-input.json", self.root)


if __name__ == "__main__":
    unittest.main()
