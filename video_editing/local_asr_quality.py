"""Fail closed on malformed/local Whisper output; never edit or deduplicate speech.

Passing these checks is NOT independent listening or word-alignment approval.
Repeated text is a review signal, not proof that the speaker did not repeat it.
"""
import json
from pathlib import Path
import re
import unicodedata


def _milliseconds(value):
    match = re.fullmatch(r"(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})", value)
    if not match:
        raise ValueError("Invalid SRT timestamp")
    h, m, s, fraction = map(int, match.groups())
    return ((h * 60 + m) * 60 + s) * 1000 + fraction


def parse_srt(text):
    cues = []
    for block in re.split(r"\n\s*\n", text.lstrip("\ufeff").replace("\r\n", "\n").strip()):
        lines = block.splitlines()
        if len(lines) < 3 or not lines[0].isdigit():
            raise ValueError("Malformed or empty SRT")
        times = lines[1].split(" --> ")
        if len(times) != 2 or not "\n".join(lines[2:]).strip():
            raise ValueError("Malformed SRT cue")
        cues.append({"id": int(lines[0]), "startMs": _milliseconds(times[0]),
                     "endMs": _milliseconds(times[1]), "text": "\n".join(lines[2:]).strip()})
    return cues


def _normalized(text):
    return "".join(c.casefold() for c in text if not c.isspace() and
                   not unicodedata.category(c).startswith("P"))


def inspect_outputs(srt_path, json_path, duration_seconds):
    """Check both originals without rewriting them. Suspect outputs stay on disk."""
    errors, warnings = [], []
    report = {"passed": False, "errors": errors, "warnings": warnings,
              "contentVerified": False, "wordTimingVerified": False,
              "independentListeningCompleted": False, "cueCount": 0}
    if not isinstance(duration_seconds, (int, float)) or not 0 < duration_seconds < float("inf"):
        errors.append({"code": "invalid-source-duration"})
        return report
    try:
        cues = parse_srt(Path(srt_path).read_text(encoding="utf-8-sig"))
        raw = json.loads(Path(json_path).read_text(encoding="utf-8-sig"))
        segments = raw["transcription"]
        if not isinstance(segments, list):
            raise ValueError("transcription is not an array")
    except (OSError, UnicodeError, ValueError, KeyError, TypeError) as error:
        errors.append({"code": "missing-or-invalid-output", "detail": str(error)})
        return report
    report["cueCount"] = len(cues)
    previous_end = 0
    for index, cue in enumerate(cues, 1):
        if cue["id"] != index:
            errors.append({"code": "cue-numbering", "cueId": cue["id"]})
        if cue["endMs"] <= cue["startMs"]:
            errors.append({"code": "non-positive-duration", "cueId": cue["id"]})
        if cue["startMs"] < previous_end:
            errors.append({"code": "overlapping-or-backward-cue", "cueId": cue["id"]})
        if cue["endMs"] > duration_seconds * 1000 + 50:
            errors.append({"code": "outside-source", "cueId": cue["id"]})
        if cue["endMs"] - cue["startMs"] > 12000:
            warnings.append({"code": "long-cue-review-required", "cueId": cue["id"]})
        previous_end = cue["endMs"]
    if len(cues) != len(segments):
        errors.append({"code": "srt-json-count-mismatch"})
    else:
        for cue, segment in zip(cues, segments):
            try:
                offsets = segment["offsets"]
                if (type(offsets["from"]) is not int or type(offsets["to"]) is not int or
                    offsets["from"] != cue["startMs"] or offsets["to"] != cue["endMs"] or
                    segment["text"].strip() != cue["text"]):
                    raise ValueError("SRT/JSON text or bounds differ")
            except (KeyError, TypeError, ValueError, AttributeError) as error:
                errors.append({"code": "srt-json-cue-mismatch", "cueId": cue["id"], "detail": str(error)})
    start = 0
    for end in range(1, len(cues) + 1):
        if end < len(cues) and _normalized(cues[start]["text"]) == _normalized(cues[end]["text"]):
            continue
        if (end - start >= 4 and len(_normalized(cues[start]["text"])) >= 6 and
                cues[end - 1]["endMs"] - cues[start]["startMs"] >= 12000):
            errors.append({"code": "suspected-repetition-loop-review-required",
                           "cueIds": [c["id"] for c in cues[start:end]],
                           "startMs": cues[start]["startMs"], "endMs": cues[end - 1]["endMs"],
                           "note": "Do not delete repetitions automatically; verify the source audio."})
        start = end
    report["passed"] = not errors
    return report
