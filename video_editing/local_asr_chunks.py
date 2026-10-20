"""Recover long-pause ASR with contiguous PCM chunks and explicit source offsets.

The primary VAD output remains intact. Do not reuse its concatenated token times.
Speech detection does not certify completeness or authorize video cuts.
"""
import copy
import json
from pathlib import Path
import re
import wave


def without_vad(arguments):
    flags = {"-vm", "--vad-model", "-vt", "--vad-threshold", "-vspd", "--vad-min-speech-duration-ms",
             "-vsd", "--vad-min-silence-duration-ms", "-vmsd", "--vad-max-speech-duration-s",
             "-vp", "--vad-speech-pad-ms", "-vo", "--vad-samples-overlap"}
    result, i = [], 0
    while i < len(arguments):
        if arguments[i] == "--vad":
            i += 1
        elif arguments[i] in flags:
            if i + 1 >= len(arguments):
                raise ValueError("Missing VAD argument")
            i += 2
        else:
            result.append(arguments[i])
            i += 1
    return result


def speech_chunks(log, duration_ms, gap_ms=4000, padding_ms=500):
    intervals = []
    for a, b in re.findall(r"vad_segment_info: orig_start: ([\d.]+), orig_end: ([\d.]+)", log):
        a, b = max(0, round(float(a) * 1000)), min(duration_ms, round(float(b) * 1000))
        if b <= a or (intervals and a < intervals[-1][0]):
            raise ValueError("Invalid VAD source interval")
        intervals.append((a, b))
    if not intervals:
        raise ValueError("VAD source intervals missing; cannot recover source timeline")
    groups = []
    for a, b in intervals:
        if groups and a - groups[-1][1] < gap_ms:
            groups[-1][1] = max(groups[-1][1], b)
        else:
            groups.append([a, b])
    chunks = [[max(0, a - padding_ms), min(duration_ms, b + padding_ms)] for a, b in groups]
    # Keep short leading/trailing pauses, but avoid feeding long silent tails.
    if chunks[0][0] < gap_ms:
        chunks[0][0] = 0
    if duration_ms - chunks[-1][1] < gap_ms:
        chunks[-1][1] = duration_ms
    return chunks


def write_pcm_chunk(source, destination, start_ms, end_ms):
    with wave.open(str(source), "rb") as original:
        rate = original.getframerate()
        start = start_ms * rate // 1000
        end = min(original.getnframes(), end_ms * rate // 1000)
        if end <= start:
            raise ValueError("Empty PCM chunk")
        original.setpos(start)
        frames = original.readframes(end - start)
        with wave.open(str(destination), "wb") as target:
            target.setparams(original.getparams())
            target.writeframes(frames)
    return {"startSample": start, "endSample": end, "sampleRate": rate,
            "sourceStartMs": start_ms, "sourceEndMs": end_ms}


def _stamp(ms):
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def merge_data(chunk_files):
    """No text deduplication: chunks do not overlap and source gaps stay gaps."""
    merged = None
    segments = []
    previous_end = 0
    for file, start_ms, end_ms in chunk_files:
        raw = json.loads(Path(file).read_text(encoding="utf-8"))
        if merged is None:
            merged = copy.deepcopy(raw)
        for segment in raw["transcription"]:
            a, b = segment["offsets"]["from"], segment["offsets"]["to"]
            if not 0 <= a < b <= end_ms - start_ms + 50:
                raise ValueError("Chunk subtitle outside its PCM interval")
            a += start_ms
            b += start_ms
            if a < previous_end:
                raise ValueError("Chunk subtitle overlap")
            item = {"offsets": {"from": a, "to": b},
                             "timestamps": {"from": _stamp(a), "to": _stamp(b)},
                             "text": segment["text"]}
            if 'tokens' in segment:
                item['tokens'] = copy.deepcopy(segment['tokens'])
                for token in item['tokens']:
                    for key in ('from', 'to'):
                        value = token['offsets'][key]
                        if type(value) is not int or value < 0:
                            raise ValueError('Invalid chunk token offset')
                        token['offsets'][key] = value + start_ms
                        token.setdefault('timestamps', {})[key] = _stamp(value + start_ms)
                    # DTW is a separate optional timing mode, not used by this adapter.
                    token.pop('t_dtw', None)
            segments.append(item)
            previous_end = b
    if not segments:
        raise ValueError("No speech output from recovery chunks")
    merged["transcription"] = segments
    # Primary CLI metadata belongs to a chunk, not to the assembled full source.
    merged["params"] = {"timeline": "original-source-milliseconds", "method": "contiguous-pcm-chunks-plus-explicit-offsets"}
    merged['tokenTimingsMappedToSource'] = True
    return merged


def merge_chunks(chunk_files, output_prefix):
    merged = merge_data(chunk_files)
    segments = merged['transcription']
    srt = "\n\n".join(f"{i}\n{s['timestamps']['from']} --> {s['timestamps']['to']}\n{s['text'].strip()}"
                       for i, s in enumerate(segments, 1)) + "\n"
    prefix = Path(output_prefix)
    for p, text in [(prefix.with_suffix(".srt"), srt),
                    (prefix.with_suffix(".json"), json.dumps(merged, ensure_ascii=False, indent=2))]:
        with p.open("x", encoding="utf-8") as out:
            out.write(text)
    return prefix.with_suffix(".srt"), prefix.with_suffix(".json")
