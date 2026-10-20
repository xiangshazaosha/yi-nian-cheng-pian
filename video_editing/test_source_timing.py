import copy
import json
from pathlib import Path
import tempfile
import unittest

from source_timing import whisper_units, adapt_desktop, package, cut_candidate, adapt_run


def token(text,a,b):return {'text':text,'offsets':{'from':a,'to':b}}
def raw(tokens,text=None):return {'transcription':[{'text':text if text is not None else ''.join(t['text'] for t in tokens),'tokens':tokens}]}


class SourceTimingTests(unittest.TestCase):
    def test_multi_character_token_not_split_by_invented_times(self):
        r=raw([token('朋友',100,300),token('们',300,500)])
        words,_=whisper_units(r,1000000)
        self.assertEqual(words[0]['text'],'朋友')
        self.assertEqual(words[0]['startUs'],100000)
        self.assertEqual(len(words),2)

    def test_zero_duration_speech_groups_with_both_neighbours(self):
        r=raw([token('很',0,200),token('高',200,200),token('兴',200,600)])
        before=copy.deepcopy(r);words,_=whisper_units(r,1000000)
        self.assertEqual(words[0]['text'],'很高兴')
        self.assertEqual((words[0]['startUs'],words[0]['endUs']),(0,600000))
        self.assertEqual(r,before)

    def test_special_tokens_excluded_without_losing_speech(self):
        words,_=whisper_units(raw([token('[_BEG_]',0,0),token('好',0,500)],'好'),1000000)
        self.assertEqual([w['text'] for w in words],['好'])
        self.assertEqual(words[0]['tokenIndices'],[[0,1]])

    def test_only_zero_duration_speech_rejected(self):
        with self.assertRaises(ValueError):whisper_units(raw([token('好',0,0)]),1000000)

    def test_text_mismatch_not_repaired_from_script(self):
        with self.assertRaisesRegex(ValueError,'does not match'):
            whisper_units(raw([token('好',0,500)],'你好'),1000000)

    def test_outside_and_negative_bounds_rejected(self):
        for a,b in [(-10,100),(0,1100),(100,90)]:
            with self.assertRaises(ValueError):whisper_units(raw([token('好',a,b)]),1000000)

    def test_desktop_has_same_source_us_contract(self):
        rows=[{'startUs':0,'endUs':1000000,'text':'甲'},
              {'startUs':1000000,'endUs':1300000,'text':'[0.30 seconds silent]'},
              {'startUs':1300000,'endUs':2000000,'text':'乙'}]
        t=adapt_desktop(rows,source_name='test.mp4',duration_us=2000000,source_sha256='a'*64,pagination_complete=True)
        c=cut_candidate(t,[{'start':0,'end':2000000}],{'num':30,'den':1})
        self.assertEqual(c['gapCuts'][0]['retainedPauseUs'],200000)
        self.assertTrue(c['internalCandidateOnly'])

    def test_candidate_does_not_cut_pauses_at_or_below_200ms(self):
        for gap in (150000,200000):
            with self.subTest(gap=gap):
                rows=[{'startUs':0,'endUs':1000000,'text':'甲'},
                      {'startUs':1000000+gap,'endUs':2000000+gap,'text':'乙'}]
                timing=adapt_desktop(rows,source_name='test.mp4',duration_us=2000000+gap,
                                     source_sha256='a'*64,pagination_complete=True)
                candidate=cut_candidate(timing,[{'start':0,'end':2000000+gap}],{'num':30,'den':1})
                self.assertEqual(candidate['gapCuts'],[])
                self.assertEqual(candidate['thresholdUs'],200000)
                self.assertEqual(candidate['retainUs'],200000)

    def test_incomplete_desktop_pages_rejected(self):
        with self.assertRaises(ValueError):
            adapt_desktop([],source_name='x',duration_us=1,source_sha256='x',pagination_complete=False)

    def test_millisecond_or_caption_tokens_not_accepted_as_desktop_us(self):
        with self.assertRaises((ValueError,KeyError)):
            adapt_desktop([{'startMs':0,'endMs':10,'text':'甲'}],source_name='x',
                          duration_us=1000000,source_sha256='x',pagination_complete=True)

    def test_silence_row_is_also_checked_before_filtering(self):
        with self.assertRaises(ValueError):
            adapt_desktop([{'startUs':-1,'endUs':10,'text':'[0.1 seconds silent]'}],source_name='x',
                          duration_us=1000000,source_sha256='x',pagination_complete=True)

    def test_selection_cannot_cut_a_grouped_text_span(self):
        t=adapt_desktop([{'startUs':0,'endUs':1000000,'text':'朋友'}],source_name='x',
                        duration_us=1000000,source_sha256='x',pagination_complete=True)
        with self.assertRaisesRegex(ValueError,'protected text span'):
            cut_candidate(t,[{'start':100000,'end':1000000}],{'num':30,'den':1})

    def test_ntsc_roundtrip_protects_spoken_frames(self):
        words,_=whisper_units(raw([token('甲',100,1000),token('乙',1400,2000)]),2100000)
        t=package(words,source_name='x',duration_us=2100000,source_sha256='a'*64,provider='test',evidence={})
        c=cut_candidate(t,[{'start':0,'end':2100000}],{'num':30000,'den':1001})
        self.assertLessEqual(abs(c['gapCuts'][0]['retainedPauseUs']-200000),1001000/30)

    def test_old_vad_primary_cannot_be_mislabelled_source_time(self):
        from source_timing import sha
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'source.wav').write_bytes(b'synthetic')
            (p/'receipt.json').write_text(json.dumps({'inputWavSha256':sha(p/'source.wav'),'arguments':['--vad'],'sourceTimelineRecoveryUsed':False}),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'VAD-concatenated'):
                adapt_run(p,source_name='x',duration_us=1000000,source_sha256='x')


if __name__=='__main__':unittest.main()
