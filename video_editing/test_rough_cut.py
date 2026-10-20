import unittest
from rough_cut import select_and_cut

class RoughCutTests(unittest.TestCase):
    def words(self, gap):
        return [{'startUs':0,'endUs':1000000,'text':'甲'},
                {'startUs':1000000+gap,'endUs':2000000+gap,'text':'乙'}]
    def run_gap(self,gap):
        return select_and_cut(self.words(gap),[{'start':0,'end':4000000}],{'num':30,'den':1},threshold_us=100000,retain_us=0)
    def test_default_retains_200ms_without_changing_spoken_duration(self):
        r=select_and_cut(self.words(300000),[{'start':0,'end':4000000}],{'num':30,'den':1})
        self.assertEqual(r['ranges'],[(0,33),(36,69)])
        self.assertEqual(sum(b-a for a,b in r['ranges']),66)
        self.assertEqual(r['gapCuts'][0]['retainedPauseUs'],200000)
        self.assertEqual(r['retainUs'],200000)
        self.assertEqual(r['thresholdUs'],200000)
    def test_ntsc_retained_pause_is_within_one_frame_of_target(self):
        r=select_and_cut(self.words(250000),[{'start':0,'end':4000000}],{'num':30000,'den':1001})
        self.assertLessEqual(abs(r['gapCuts'][0]['retainedPauseUs']-200000),1001*1000000/30000)
    def test_default_does_not_cut_or_lengthen_pauses_at_or_below_200ms(self):
        for fps in ({'num':30,'den':1},{'num':30000,'den':1001}):
            for gap in (90000,100000,150000,190000,200000):
                with self.subTest(fps=fps,gap=gap):
                    r=select_and_cut(self.words(gap),[{'start':0,'end':4000000}],fps)
                    self.assertEqual(r['gapCuts'],[])
                    self.assertEqual(len(r['ranges']),1)
    def test_over_threshold_is_removed_not_compressed(self):
        result=self.run_gap(300000)
        self.assertEqual(result['ranges'],[(0,30),(39,69)])
        self.assertEqual(result['gapCuts'][0]['removedFrames'],9)
    def test_exact_threshold_is_not_removed(self):
        self.assertEqual(len(self.run_gap(100000)['ranges']),1)
    def test_shorter_gap_is_not_removed(self):
        self.assertEqual(len(self.run_gap(90000)['ranges']),1)
    def test_ntsc_word_edges_are_protected(self):
        r=select_and_cut(self.words(250000),[{'start':0,'end':4000000}],{'num':30000,'den':1001})
        self.assertLessEqual(r['ranges'][0][0],0)
        self.assertGreaterEqual(r['ranges'][0][1]*1001/30000,1)
        self.assertLessEqual(r['ranges'][1][0]*1001/30000,1.25)
    def test_removed_spoken_words_are_not_restored(self):
        r=select_and_cut(self.words(200000),[{'start':0,'end':1000000}],{'num':30,'den':1})
        self.assertEqual(r['ranges'],[(0,30)])
        self.assertEqual(r['keptWords'],1)
    def test_bad_asr_stops(self):
        words=self.words(0);words[1]['startUs']=900000
        with self.assertRaises(ValueError):select_and_cut(words,[],{'num':30,'den':1})
    def test_asr_silence_pseudo_tokens_are_not_spoken_words(self):
        words=self.words(300000)
        words.insert(1,{'startUs':1000000,'endUs':1300000,'text':'[0.30 seconds silent]'})
        r=select_and_cut(words,[{'start':0,'end':4000000}],{'num':30,'den':1},retain_us=0)
        self.assertEqual(r['ranges'],[(0,30),(39,69)])
        self.assertEqual(r['totalWords'],2)
    def test_uncertain_gap_can_be_explicitly_preserved_for_review(self):
        r=select_and_cut(self.words(300000),[{'start':0,'end':4000000}],{'num':30,'den':1},
                         preserve_gaps={(1000000,1300000)})
        self.assertEqual(r['ranges'],[(0,69)])
        self.assertEqual(r['gapCuts'],[])

if __name__=='__main__': unittest.main()
