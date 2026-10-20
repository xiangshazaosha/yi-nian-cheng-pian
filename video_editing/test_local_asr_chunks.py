import json
from pathlib import Path
import tempfile
import unittest
import wave

from local_asr_chunks import speech_chunks, merge_chunks, write_pcm_chunk, without_vad


class ChunkRecoveryTests(unittest.TestCase):
    def test_long_pause_is_not_concatenated(self):
        log = "vad_segment_info: orig_start: 0.20, orig_end: 134.44\nvad_segment_info: orig_start: 196.02, orig_end: 302.44"
        self.assertEqual(speech_chunks(log, 313643), [[0, 134940], [195520, 302940]])

    def test_short_pauses_stay_inside_contiguous_source(self):
        log = "vad_segment_info: orig_start: 0.20, orig_end: 3.00\nvad_segment_info: orig_start: 3.80, orig_end: 8.00"
        self.assertEqual(speech_chunks(log, 9000), [[0, 9000]])

    def test_missing_vad_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            speech_chunks("", 10000)

    def test_remove_vad_preserves_gpu_and_context_settings(self):
        args = ["-nfa", "--device", "0", "-mc", "0", "--vad", "-vm", "vad.bin", "-vp", "200"]
        self.assertEqual(without_vad(args), ["-nfa", "--device", "0", "-mc", "0"])

    def test_pcm_chunk_is_exact_samples_without_speed_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp) / "source.wav", Path(tmp) / "chunk.wav"
            data = b"\x01\x00" * 16000
            with wave.open(str(source), "wb") as w:
                w.setparams((1, 2, 16000, 16000, "NONE", "none"))
                w.writeframes(data)
            result = write_pcm_chunk(source, target, 100, 700)
            with wave.open(str(target), "rb") as w:
                self.assertEqual(w.readframes(w.getnframes()), data[3200:22400])
            self.assertEqual((result["startSample"], result["endSample"]), (1600, 11200))

    def test_merge_uses_original_offset_and_keeps_real_retakes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            entries = []
            for i, offset in enumerate([0, 195520]):
                file = root / f"{i}.json"
                file.write_text(json.dumps({"params": {"file": "chunk"}, "transcription": [
                    {"offsets": {"from": 0, "to": 2000}, "text": "重复表达保留原文", "tokens": []}]}), encoding="utf-8")
                entries.append((file, offset, offset + 3000))
            srt, raw = merge_chunks(entries, root / "merged")
            output = json.loads(raw.read_text(encoding="utf-8"))
            self.assertEqual(output["transcription"][1]["offsets"]["from"], 195520)
            self.assertEqual(len(output["transcription"]), 2)
            self.assertEqual(output["transcription"][1]['tokens'], [])
            self.assertIn("00:03:15,520", srt.read_text(encoding="utf-8"))

    def test_token_source_offset_is_preserved_not_dropped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); file=root/'chunk.json'
            file.write_text(json.dumps({'transcription':[{'offsets':{'from':100,'to':900},'text':'测试',
                'tokens':[{'text':'测试','offsets':{'from':100,'to':900},'t_dtw':-1}]}]}),encoding='utf-8')
            _,out=merge_chunks([(file,195520,196520)],root/'out')
            token=json.loads(out.read_text(encoding='utf-8'))['transcription'][0]['tokens'][0]
            self.assertEqual(token['offsets'],{'from':195620,'to':196420})
            self.assertEqual(token['timestamps']['from'],'00:03:15,620')
            self.assertEqual(json.loads(file.read_text(encoding='utf-8'))['transcription'][0]['tokens'][0]['offsets']['from'],100)


if __name__ == "__main__":
    unittest.main()
