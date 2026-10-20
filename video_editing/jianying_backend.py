"""File-only pyJianYingDraft adapter. Never imports its GUI controller."""
import importlib.metadata
import json
from pathlib import Path
import sys
import types
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "tools/jianying-draft/runtime"


def frame_us(frame, fps):
    """Round absolute boundaries, not each duration, to avoid cumulative gaps."""
    n, d = fps["num"], fps["den"]
    if type(frame) is not int or frame < 0 or n <= 0 or d <= 0:
        raise ValueError("Invalid frame boundary")
    return (frame * d * 1_000_000 + n // 2) // n


def ranges(clip, fps):
    start = frame_us(clip["inFrame"], fps)
    end = frame_us(clip["outFrame"], fps)
    target = frame_us(clip["atFrame"], fps)
    target_end = frame_us(clip["atFrame"] + clip["outFrame"] - clip["inFrame"], fps)
    if end <= start or target_end <= target:
        raise ValueError("Empty clip")
    return {"start": start, "duration": end - start}, {"start": target, "duration": target_end - target}


def backend():
    if not (RUNTIME / "pyJianYingDraft/script_file.py").is_file():
        raise RuntimeError("Install the file-only backend under tools/jianying-draft/runtime first")
    sys.path.insert(0, str(RUNTIME))
    # Skip only the optional top-level convenience imports, which include Windows
    # UI Automation. All draft/material/track serializers remain upstream code.
    package = types.ModuleType("pyJianYingDraft")
    package.__path__ = [str(RUNTIME / "pyJianYingDraft")]
    sys.modules["pyJianYingDraft"] = package
    from pyJianYingDraft.script_file import ScriptFile
    from pyJianYingDraft.local_materials import VideoMaterial
    from pyJianYingDraft.video_segment import VideoSegment
    from pyJianYingDraft.time_util import Timerange
    from pyJianYingDraft.track import TrackType, TrackSpec
    return ScriptFile, VideoMaterial, VideoSegment, Timerange, TrackType, TrackSpec


def validate_content(content, spec):
    expected = [(spec["clips"], 1.0)]
    if spec["broll"]:
        expected.append((spec["broll"], 0.0))
    if len(content["tracks"]) != len(expected):
        raise ValueError("Wrong track count")
    materials = {m["id"]: m for m in content["materials"]["videos"]}
    for track, (clips, volume) in zip(content["tracks"], expected):
        if track["type"] != "video" or len(track["segments"]) != len(clips):
            raise ValueError("Wrong segment count/type")
        for segment, clip in zip(track["segments"], clips):
            source, target = ranges(clip, spec["fps"])
            if segment["source_timerange"] != source or segment["target_timerange"] != target:
                raise ValueError("Serialized cut boundaries differ from the plan")
            if segment["volume"] != volume or segment["speed"] != 1.0:
                raise ValueError("Unexpected audio/speed setting")
            expected_path = spec["media"][clip.get("source", spec["source"])]["absolute"]
            if Path(materials[segment["material_id"]]["path"]).resolve() != Path(expected_path).resolve():
                raise ValueError("Wrong material reference")
    if content["duration"] != frame_us(spec["totalFrames"], spec["fps"]):
        raise ValueError("Wrong draft duration")


def generate(spec):
    # Retired by user request. Reject legacy inputs before creating any output,
    # rather than silently recreating unreadable review annotations.
    if spec.get("reviewMarkers"):
        raise ValueError("Review markers have been removed; omit reviewMarkers")
    ScriptFile, VideoMaterial, VideoSegment, Timerange, TrackType, TrackSpec = backend()
    out = Path(spec["output"])
    out.mkdir()  # Never overwrite any existing draft.
    meta = spec["media"][spec["source"]]
    script = ScriptFile(meta["width"], meta["height"], spec["fps"]["num"] / spec["fps"]["den"], True)
    script.content["id"] = uuid.uuid4().hex.upper()
    script.content["name"] = spec["name"]
    cache = {p: VideoMaterial(m["absolute"]) for p, m in spec["media"].items()}
    tracks = [(spec["clips"], 1.0, spec.get("primaryTrackLabel", "口播：重复保留末次完整表达"))]
    if spec["broll"]:
        tracks.append((spec["broll"], 0.0, "B-roll（静音覆盖）"))
    for clips, volume, label in tracks:
        ref = script.append_track(TrackSpec(TrackType.video, name=label))
        for clip in clips:
            src, target = ranges(clip, spec["fps"])
            segment = VideoSegment(cache[clip.get("source", spec["source"])],
                                   Timerange(target["start"], target["duration"]),
                                   source_timerange=Timerange(src["start"], src["duration"]),
                                   speed=1.0, volume=volume)
            # Upstream derives target duration from source duration even at 1x.
            # NTSC absolute rounding can differ by 1us at another timeline phase.
            # Restore the compiled absolute target boundaries before adding it.
            segment.target_timerange = Timerange(target["start"], target["duration"])
            script.add_segment(segment, ref)
    content = json.loads(script.dumps())
    validate_content(content, spec)
    assets = RUNTIME / "pyJianYingDraft/assets"
    info = json.loads((assets / "draft_meta_info.json").read_text(encoding="utf-8"))
    info.update(draft_id=content["id"], draft_name=spec["name"], tm_duration=content["duration"],
                draft_fold_path=str(out), draft_root_path=str(out.parent))
    # Current installed native exporter writes both plaintext names. Keep them
    # identical for new drafts, never decode or rewrite encrypted user projects.
    for name, data in [("draft_content.json", content), ("draft_info.json", content), ("draft_meta_info.json", info)]:
        with (out / name).open("x", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
    validate_content(json.loads((out / "draft_content.json").read_text(encoding="utf-8")), spec)
    return {"generator": "pyJianYingDraft", "version": importlib.metadata.version("pyjianyingdraft"),
            "durationUs": content["duration"], "segments": len(spec["clips"]),
            "guiModulesLoaded": any(k in sys.modules for k in ["uiautomation", "pyJianYingDraft.jianying_controller"]),
            "fileValidationPassed": True, "applicationOpenVerified": False,
            "audioVisualReviewed": False, "subtitlesIncluded": False, "readyForPackaging": False}


if __name__ == "__main__":
    result = generate(json.loads(sys.stdin.buffer.read().decode("utf-8")))
    print(json.dumps(result, ensure_ascii=True))
