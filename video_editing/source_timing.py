"""Source-time adaptation, not forced alignment or invented per-character times.

Whisper units can contain several tokens. Zero-duration speech is protected by
grouping with neighbouring positive spans; no arbitrary milliseconds are added.
VAD-concatenated times are rejected. Desktop already returns source-us words.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re


def compact(text):
    return re.sub(r"\s+", "", text)


def special(text):
    return bool(re.fullmatch(r"\[_.*?\]", text))


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def validate_words(words, duration_us):
    if type(duration_us) is not int or duration_us <= 0 or not words:
        raise ValueError('Empty/invalid source timing')
    previous = 0
    for w in words:
        a, b = w['startUs'], w['endUs']
        if (type(a) is not int or type(b) is not int or not 0 <= a < b <= duration_us
                or a < previous or not compact(w['text'])):
            raise ValueError('Invalid/overlapping/out-of-source timing unit')
        previous = b


def join_units(a, b):
    return {'startUs': min(a['startUs'], b['startUs']),
            'endUs': max(a['endUs'], b['endUs']), 'text': a['text'] + b['text'],
            'tokenIndices': a['tokenIndices'] + b['tokenIndices'],
            'groupedForBoundaryProtection': True}


def whisper_units(raw, duration_us):
    """Raw must already be continuous original time or source-offset merged time."""
    words, token_count, grouped = [], 0, 0
    segments = raw['transcription']
    if not segments:
        raise ValueError('Empty transcript')
    for si, segment in enumerate(segments):
        if not segment.get('tokens'):
            raise ValueError('Missing original token rows; do not infer them from SRT')
        speech = [(ti, t) for ti, t in enumerate(segment['tokens']) if not special(t['text'])]
        if compact(''.join(t['text'] for _, t in speech)) != compact(segment['text']):
            raise ValueError('Token text does not match original transcript; no guessed repair')
        if any('\ufffd' in t['text'] for _, t in speech):
            raise ValueError('Undecoded token fragments; keep raw data, do not guess characters')
        units, pending = [], None
        for ti, t in speech:
            if not compact(t['text']):
                continue
            a, b = t['offsets']['from'], t['offsets']['to']
            if type(a) is not int or type(b) is not int or not 0 <= a <= b or b * 1000 > duration_us:
                raise ValueError('Invalid token time')
            u = {'startUs': a * 1000, 'endUs': b * 1000, 'text': t['text'],
                 'tokenIndices': [[si, ti]], 'groupedForBoundaryProtection': False}
            token_count += 1
            if a == b:
                # Protect both neighbours, not a fictitious duration for this token.
                if pending is None and units:
                    pending = units.pop()
                pending = join_units(pending, u) if pending else u
                grouped += 1
                continue
            if pending:
                u = join_units(pending, u)
                pending = None
            if units and u['startUs'] < units[-1]['endUs']:
                u = join_units(units.pop(), u)
                grouped += 1
            units.append(u)
        if pending:
            if units:
                units.append(join_units(units.pop(), pending))
            elif pending['endUs'] > pending['startUs']:
                units.append(pending)
            else:
                raise ValueError('Speech has no positive timing span')
        for u in units:
            if words and u['startUs'] < words[-1]['endUs']:
                u = join_units(words.pop(), u)
                grouped += 1
            words.append(u)
    validate_words(words, duration_us)
    if compact(''.join(w['text'] for w in words)) != compact(''.join(s['text'] for s in segments)):
        raise ValueError('Adaptation lost or duplicated text')
    return words, {'rawSpeechTokens': token_count, 'protectedGroupingEvents': grouped}


def package(words, *, source_name, duration_us, source_sha256, provider, evidence, details=None):
    validate_words(words, duration_us)
    return {'schemaVersion': 1, 'sourceFilename': source_name,
            'sourceSha256': source_sha256, 'durationUs': duration_us,
            'timeUnit': 'source microseconds', 'provider': provider,
            'timingGranularity': 'source-aligned-text-span-not-invented-character-times',
            'words': words, 'evidence': evidence, 'details': details or {},
            'structuralValidationPassed': True, 'candidateCutsAvailable': True,
            'independentListeningVerified': False, 'contentVerified': False,
            'readyForFinalSubtitles': False}


def adapt_run(run, *, source_name, duration_us, source_sha256):
    """Rebuild from preserved originals; never rewrite an old ASR run/SRT."""
    run = Path(run)
    receipt = json.loads((run / 'receipt.json').read_text(encoding='utf-8-sig'))
    if receipt.get('inputWavSha256') != sha(run / 'source.wav'):
        raise ValueError('Run audio identity changed')
    mapping = run / 'source-timeline-map.json'
    evidence = []
    if receipt.get('sourceTimelineRecoveryUsed'):
        from local_asr_chunks import merge_data
        m = json.loads(mapping.read_text(encoding='utf-8'))
        entries = []
        for i, info in enumerate(m['chunks'], 1):
            if '--vad' in info['arguments']:
                raise ValueError('VAD-concatenated chunk token times rejected')
            first = info['startSample'] * 1000000 // info['sampleRate']
            if first != info['sourceStartMs'] * 1000:
                raise ValueError('PCM sample/source offset mismatch')
            file = run / f'chunk-{i:03}.json'
            entries.append((file, info['sourceStartMs'], info['sourceEndMs']))
            evidence.append({'file': file.name, 'sha256': sha(file), 'sourceStartUs': first})
        raw = merge_data(entries)
    else:
        if '--vad' in receipt['arguments']:
            raise ValueError('VAD-concatenated primary tokens rejected; run continuous PCM without VAD')
        file = run / 'transcript.json'
        raw = json.loads(file.read_text(encoding='utf-8'))
        evidence.append({'file': file.name, 'sha256': sha(file), 'sourceStartUs': 0})
    words, details = whisper_units(raw, duration_us)
    return package(words, source_name=source_name, duration_us=duration_us,
                   source_sha256=source_sha256, provider='local-whisper.cpp',
                   evidence=evidence, details=details)


def adapt_desktop(rows, *, source_name, duration_us, source_sha256, pagination_complete):
    if pagination_complete is not True:
        raise ValueError('Desktop source rows must be fetched completely')
    validate_words(rows, duration_us)
    words = []
    for row in rows:
        if re.fullmatch(r'\[\d+(?:\.\d+)? seconds silent\]', row['text'].strip()):
            continue
        words.append({k: row[k] for k in ('startUs', 'endUs', 'text')})
    return package(words, source_name=source_name, duration_us=duration_us,
                   source_sha256=source_sha256, provider='chatcut-desktop',
                   evidence={'paginationComplete': True})


def cut_candidate(timing, selected, fps):
    from rough_cut import select_and_cut
    if timing.get('timeUnit') != 'source microseconds' or timing.get('structuralValidationPassed') is not True:
        raise ValueError('Use validated original-source timing, not SRT or timeline captions')
    validate_words(timing['words'], timing['durationUs'])
    for k in ('num', 'den'):
        if type(fps[k]) is not int or fps[k] <= 0:
            raise ValueError('Invalid fps')
    previous = 0
    for r in selected:
        if (type(r['start']) is not int or type(r['end']) is not int
                or not previous <= r['start'] < r['end'] <= timing['durationUs']):
            raise ValueError('Invalid/overlapping source selection')
        previous = r['end']
        for word in timing['words']:
            if (r['start'] < word['endUs'] and r['end'] > word['startUs']
                    and not (r['start'] <= word['startUs'] and r['end'] >= word['endUs'])):
                raise ValueError('Selection cuts through a protected text span')
    result = select_and_cut(timing['words'], selected, fps)
    return {**result, 'sourceFilename': timing['sourceFilename'], 'sourceSha256': timing['sourceSha256'],
            'fps': fps, 'internalCandidateOnly': True, 'independentListeningVerified': False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='action', required=True)
    a = sub.add_parser('adapt-run')
    a.add_argument('--run', type=Path, required=True)
    a.add_argument('--source-json', type=Path, required=True)
    a.add_argument('--output', type=Path, required=True)
    c = sub.add_parser('cut')
    c.add_argument('--timing', type=Path, required=True)
    c.add_argument('--selection', type=Path, required=True)
    c.add_argument('--fps-num', type=int, required=True)
    c.add_argument('--fps-den', type=int, required=True)
    c.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    if args.action == 'adapt-run':
        source = json.loads(args.source_json.read_text(encoding='utf-8-sig'))
        result = adapt_run(args.run, source_name=source['sourceName'],
                           duration_us=round(source['duration'] * 1000000), source_sha256=source['sourceSha256'])
    else:
        result = cut_candidate(json.loads(args.timing.read_text(encoding='utf-8')),
                               json.loads(args.selection.read_text(encoding='utf-8')),
                               {'num': args.fps_num, 'den': args.fps_den})
    with args.output.open('x', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps({'saved': str(args.output), 'sourceFilename': result['sourceFilename'],
                      'candidateOnly': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
