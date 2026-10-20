"""Thin official Resolve executor. Run externally (where supported) or in Resolve.

The AI chooses edits; this script only constructs editable timelines. Public
input remains edit_plan.json; resolve-input.json is a checked derivative.
"""
import argparse
import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent


def repo_path(value, root=ROOT):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value or value.startswith("/"):
        raise ValueError("Expected repository-relative path")
    if any(p in ("", ".", "..") for p in value.split("/")):
        raise ValueError("Invalid path component")
    result = (root / value).resolve()
    if not result.is_relative_to(root.resolve()):
        raise ValueError("Path escapes repository")
    return result


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_spec(value, root=ROOT):
    p = repo_path(value, root)
    spec = json.loads(p.read_text(encoding="utf-8-sig"))
    if digest_file(repo_path(spec["plan"], root)) != spec["planSha256"]:
        raise ValueError("Plan changed; prepare again rather than execute stale cuts")
    if digest_file(repo_path(spec["subtitles"], root)) != spec["subtitleSha256"]:
        raise ValueError("Prepared subtitles changed")
    for source in spec["sources"]:
        if digest_file(repo_path(source["path"], root)) != source["sha256"]:
            raise ValueError("Media identity changed")
    at = 0
    source_end = 0
    for c in spec["clips"]:
        if not all(type(c[k]) is int for k in ("inFrame", "outFrame", "atFrame")):
            raise ValueError("Frame values must be integers")
        if c["atFrame"] != at or c["inFrame"] < source_end or not 0 <= c["inFrame"] < c["outFrame"] <= spec["sourceFrames"]:
            raise ValueError("Invalid kept-clip geometry")
        source_end = c["outFrame"]
        at += c["outFrame"] - c["inFrame"]
    if at != spec["totalFrames"] or at <= 0:
        raise ValueError("Invalid timeline duration")
    if not all(type(spec["fps"][k]) is int and spec["fps"][k] > 0 for k in ("num", "den")):
        raise ValueError("Invalid fps")
    # Check the derivative still expresses the actual public plan, not an edited
    # internal frame list. The public seconds and half-open intervals remain truth.
    plan = json.loads(repo_path(spec["plan"], root).read_text(encoding="utf-8-sig"))
    fps = spec["fps"]["num"] / spec["fps"]["den"]
    frame = lambda seconds: math.floor(seconds * fps + 0.5)
    kept = []
    cursor = at = 0
    for cut in sorted(plan["cuts"], key=lambda c: c["start"]):
        start, end = frame(cut["start"]), frame(cut["end"])
        if start < cursor or end <= start or end > spec["sourceFrames"]:
            raise ValueError("Invalid source cuts")
        if start > cursor:
            kept.append({"inFrame": cursor, "outFrame": start, "atFrame": at})
            at += start - cursor
        cursor = end
    if cursor < spec["sourceFrames"]:
        kept.append({"inFrame": cursor, "outFrame": spec["sourceFrames"], "atFrame": at})
    if kept != spec["clips"] or plan["source"] != spec["source"]:
        raise ValueError("Prepared source/clip geometry differs from public plan")
    expected_broll = []
    for b in sorted(plan["broll"], key=lambda b: b["start"]):
        start, end, source = frame(b["start"]), frame(b["end"]), frame(b.get("source_start", 0))
        expected_broll.append({"source": b["source"], "inFrame": source,
                               "outFrame": source + end - start, "atFrame": start,
                               "reason": b["reason"], "audio": "muted",
                               "burnedInSubtitles": b.get("burned_in_subtitles")})
    if expected_broll != spec["broll"]:
        raise ValueError("Prepared B-roll differs from public plan")
    paths = {s["path"] for s in spec["sources"]}
    if paths != {spec["source"]} | {b["source"] for b in spec["broll"]}:
        raise ValueError("Prepared source inventory differs from plan")
    return spec


def connect():
    lib = ROOT / "tools/davinci-resolve/fusionscript.dll"
    if lib.is_file():
        os.environ.setdefault("RESOLVE_SCRIPT_LIB", str(lib))
    paths = [ROOT / "tools/davinci-resolve/Support/Developer/Scripting/Modules"]
    if os.environ.get("RESOLVE_SCRIPT_API"):
        paths.append(Path(os.environ["RESOLVE_SCRIPT_API"]) / "Modules")
    # Official installer can place SDK support files in ProgramData separately.
    paths.append(Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting/Modules")
    for p in paths:
        if (p / "DaVinciResolveScript.py").exists():
            sys.path.insert(0, str(p))
            break
    try:
        module = importlib.import_module("DaVinciResolveScript")
    except ImportError as e:
        raise RuntimeError("Official Resolve scripting module not installed; no fake connection") from e
    resolve = module.scriptapp("Resolve")
    if not resolve:
        raise RuntimeError("Resolve is not running or external scripting unavailable; use official Console/menu scripting where supported")
    return resolve


def checked(value, action):
    if not value:
        raise RuntimeError(f"Resolve failed: {action}")
    return value


def fps_setting(rate):
    known = {(24000, 1001): "23.976", (30000, 1001): "29.97", (60000, 1001): "59.94"}
    return known.get((rate["num"], rate["den"]), str(rate["num"] / rate["den"]).removesuffix(".0"))


def execute(resolve, spec_file, project_name, root=ROOT):
    spec = load_spec(spec_file, root)
    if not project_name or any(c in project_name for c in '\\/:*?"<>|'):
        raise ValueError("Invalid project name")
    output = repo_path(spec_file, root).parent
    drp = output / "resolve-project.drp"
    receipt = output / "resolve-result.json"
    if drp.exists() or receipt.exists():
        raise ValueError("Existing Resolve evidence; refusing overwrite")
    manager = checked(resolve.GetProjectManager(), "GetProjectManager")
    if project_name in manager.GetProjectListInCurrentFolder():
        raise ValueError("Existing project name; no overwrite")
    if manager.GetCurrentProject():
        checked(manager.SaveProject(), "save current project before switching")
    project = checked(manager.CreateProject(project_name, str(root / "tools/davinci-resolve-data")), "CreateProject")
    # Stop on any failure; leave the newly created partial project for inspection.
    checked(project.SetSetting("timelineFrameRate", fps_setting(spec["fps"])), "Set timeline fps")
    media_pool = checked(project.GetMediaPool(), "GetMediaPool")
    media = {}
    for source in spec["sources"]:
        items = checked(media_pool.ImportMedia([str(repo_path(source["path"], root))]), "ImportMedia")
        if len(items) != 1:
            raise RuntimeError("Unexpected imported media count")
        media[source["path"]] = items[0]

    def timeline(name):
        t = checked(media_pool.CreateEmptyTimeline(name), "CreateEmptyTimeline")
        checked(project.SetCurrentTimeline(t), "SetCurrentTimeline")
        checked(t.SetStartTimecode("00:00:00:00"), "SetStartTimecode")
        if t.GetStartFrame() != 0:
            raise RuntimeError("Timeline origin is not zero")
        for kind in ("video", "audio"):
            if t.GetTrackCount(kind) < 1:
                checked(t.AddTrack(kind), "AddTrack")
        return t

    def append(t, src, cut, track=1, speech=True):
        item = media[src]
        start = int(item.GetClipProperty("Start"))
        expected_length = cut["outFrame"] - cut["inFrame"]
        result = []
        for kind, media_type in (("video", 1), ("audio", 2)) if speech else (("video", 1),):
            clips = checked(media_pool.AppendToTimeline([{
                "mediaPoolItem": item, "startFrame": start + cut["inFrame"],
                # Resolve 21.1.1.10 live read-back verified an exclusive end.
                # Other versions must pass the same geometry checks below.
                "endFrame": start + cut["outFrame"], "recordFrame": cut["atFrame"],
                "trackIndex": track, "mediaType": media_type,
            }]), f"AppendToTimeline {kind}")
            if len(clips) != 1:
                raise RuntimeError("Unexpected appended clip count")
            clip = clips[0]
            if clip.GetStart() != cut["atFrame"] or clip.GetDuration() != expected_length or clip.GetLeftOffset() != cut["inFrame"]:
                raise RuntimeError("Resolve read-back differs from the plan; end-frame/source-offset API needs verification")
            result.append(clip)
        if speech:
            checked(t.SetClipsLinked(result, True), "link speech video/audio")
        return result

    raw = timeline("01-original")
    append(raw, spec["source"], {"inFrame": 0, "outFrame": spec["sourceFrames"], "atFrame": 0})
    edited = timeline("02-ai-edit")
    actual_fps = edited.GetSetting("timelineFrameRate")
    if str(actual_fps) != fps_setting(spec["fps"]):
        raise RuntimeError("Actual Resolve timeline fps differs from prepared input")
    for cut in spec["clips"]:
        append(edited, spec["source"], cut)
    if spec["broll"]:
        if edited.GetTrackCount("video") < 2:
            checked(edited.AddTrack("video"), "Add B-roll track")
        for b in spec["broll"]:
            append(edited, b["source"], b, track=2, speech=False)
    # Whole-track read-back, not just return values from append operations.
    for kind in ("video", "audio"):
        actual = edited.GetItemListInTrack(kind, 1) or []
        if len(actual) != len(spec["clips"]) or sum(c.GetDuration() for c in actual) != spec["totalFrames"]:
            raise RuntimeError("Primary track verification failed")
    if len(edited.GetItemListInTrack("video", 2) or []) != len(spec["broll"]):
        raise RuntimeError("B-roll track verification failed")
    if edited.GetTrackCount("audio") != 1:
        raise RuntimeError("Unexpected additional audio track; verify muted B-roll")
    checked(manager.SaveProject(), "SaveProject")
    checked(manager.ExportProject(project_name, str(drp)), "ExportProject")
    if not drp.is_file() or drp.stat().st_size == 0:
        raise RuntimeError("DRP export did not produce a file")
    result = {"projectName": project_name, "planSha256": spec["planSha256"],
              "timelines": ["01-original", "02-ai-edit"], "totalFrames": spec["totalFrames"],
              "timelineGeometryVerified": True, "audioVisualReviewed": False,
              "subtitleTrackImported": False, "subtitleSidecar": spec["subtitles"],
              "editableProject": drp.relative_to(root).as_posix(),
              "readyForPackaging": False,
              "nextAction": "Human review/adjustment, then export locked video plus matching final-timeline SRT. Never reuse the AI SRT after manual timing changes."}
    with receipt.open("x", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["probe", "execute"])
    p.add_argument("--prepared")
    p.add_argument("--project")
    a = p.parse_args()
    r = connect()
    if a.action == "probe":
        print(json.dumps({"connected": True, "version": r.GetVersionString()}, ensure_ascii=False))
    else:
        if not a.prepared or not a.project:
            p.error("execute requires --prepared and --project")
        print(json.dumps(execute(r, a.prepared, a.project), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
