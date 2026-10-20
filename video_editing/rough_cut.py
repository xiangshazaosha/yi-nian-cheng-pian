"""Local timing pass: shorten long source gaps to about 200ms, without speedup.

Semantic selection is a separate AI decision supplied as source ranges. ASR gaps
are timing evidence, not independently verified speech/silence classification.
"""
import re

DEFAULT_PAUSE_US = 200000


def select_and_cut(words, selected, fps, threshold_us=DEFAULT_PAUSE_US, preserve_gaps=(), retain_us=DEFAULT_PAUSE_US):
    n, d = fps['num'], fps['den']
    unit = d * 1000000
    floor = lambda us: us * n // unit
    ceil = lambda us: (us * n + unit - 1) // unit
    if type(threshold_us) is not int or threshold_us < 0:
        raise ValueError('Invalid threshold')
    if type(retain_us) is not int or retain_us < 0:
        raise ValueError('Invalid retained pause')
    previous = -1
    speech = []
    for word in words:
        start, end = word['startUs'], word['endUs']
        if type(start) is not int or type(end) is not int or start < 0 or end <= start or start < previous:
            raise ValueError('Invalid/overlapping ASR timestamps')
        previous = end
        if not word['text'].strip(): raise ValueError('Empty ASR token')
        if re.fullmatch(r'\[\d+(?:\.\d+)? seconds silent\]', word['text'].strip()):
            continue
        # A 1us rounding sliver is not evidence that a spoken token was kept.
        overlaps = [max(0, min(end, r['end']) - max(start, r['start'])) for r in selected]
        kept = max(overlaps, default=0) >= max(1, min(20000, (end-start)//2))
        speech.append({**word, 'kept': kept})
    ranges, gaps = [], []
    start_frame = end_frame = previous_word_end = None
    for i, word in enumerate(speech):
        if not word['kept']:
            if start_frame is not None: ranges.append((start_frame, end_frame))
            start_frame = end_frame = previous_word_end = None
            continue
        gap = word['startUs'] - previous_word_end if previous_word_end is not None else 0
        if start_frame is not None and gap > threshold_us and (previous_word_end, word['startUs']) not in preserve_gaps:
            # Only remove whole source frames fully between spoken words.
            core_start, core_end = ceil(previous_word_end), floor(word['startUs'])
            available = max(0,core_end-core_start)
            remove = available if retain_us == 0 else min(available,max(0,round((gap-retain_us)*n/unit)))
            if remove:
                # Keep available room on both sides, not an empty timeline gap.
                cut_start = core_start + (available-remove)//2
                cut_end = cut_start+remove
                ranges.append((start_frame,cut_start))
                gaps.append({'startUs':previous_word_end,'endUs':word['startUs'],
                             'inFrame':cut_start,'outFrame':cut_end,
                             'removedFrames':remove,'retainedPauseUs':gap-remove*unit/n,
                             'previous':speech[i-1]['text'],'following':word['text']})
                start_frame = cut_end
        elif start_frame is None: start_frame = floor(word['startUs'])
        end_frame = ceil(word['endUs'])
        previous_word_end = word['endUs']
    if start_frame is not None: ranges.append((start_frame, end_frame))
    # Adjacent retained word groups may touch after frame protection.
    merged = []
    for first,last in ranges:
        if merged and first <= merged[-1][1]: merged[-1] = (merged[-1][0],max(last,merged[-1][1]))
        else: merged.append((first,last))
    return {'ranges':merged,'gapCuts':gaps,'keptWords':sum(w['kept'] for w in speech),
            'totalWords':len(speech),'thresholdUs':threshold_us,'retainUs':retain_us,
            'rule':'shorten-gaps-retain-pause-no-speed-change' if retain_us else 'remove-whole-gaps-strictly-longer-than-threshold',
            'wordEdgePolicy':'floor-start-ceil-end-source-frame-protection'}
