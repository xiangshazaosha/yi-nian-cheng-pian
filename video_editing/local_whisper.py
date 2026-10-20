"""Current-host local ASR launcher. No upload or automatic full-source import."""
from pathlib import Path
import argparse, datetime, hashlib, json, os, shutil, subprocess, sys, time, uuid, wave

def file_hash(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def main(argv=None, tool_root=None):
    parser=argparse.ArgumentParser(description='Run the installed large-v3 on a PCM 16-bit mono 16 kHz WAV; no media upload.')
    parser.add_argument('--wav',required=True,type=Path)
    parser.add_argument('--language',default='zh')
    parser.add_argument('--threads',type=int,default=4)
    parser.add_argument('--sentence-only',action='store_true',help='Explicitly skip fine token-time adaptation')
    a=parser.parse_args(argv)
    if not 1<=a.threads<=32:parser.error('threads must be 1..32')
    if not a.language.isalpha() or len(a.language)>8:parser.error('invalid language code')
    project=Path(__file__).resolve().parents[1]
    root=Path(tool_root).resolve() if tool_root is not None else project/'tools/whisper-cpp'
    project=root.parent.parent
    from local_asr_quality import inspect_outputs
    cfg=json.loads((root/'runtime-config.json').read_text(encoding='utf-8'))
    binary=(project/cfg['binary']).resolve();model=(project/cfg['model']).resolve()
    components=[(binary,'binarySha256'),(model,'modelSha256')]
    if cfg.get('vadModel'):
        components.append(((project/cfg['vadModel']).resolve(),'vadModelSha256'))
    for p,k in components:
        if not p.is_relative_to(root) or file_hash(p)!=cfg[k]:raise RuntimeError('Installed component identity changed; revalidate deployment')
    source=a.wav.resolve(strict=True)
    with wave.open(str(source),'rb') as w:
        if (w.getnchannels(),w.getsampwidth(),w.getframerate(),w.getcomptype())!=(1,2,16000,'NONE'):raise RuntimeError('Input must be uncompressed PCM 16-bit mono 16000 Hz WAV')
        duration=w.getnframes()/16000
    run=root/'cache/jobs'/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8])
    run.mkdir(parents=True,exist_ok=False);shutil.copyfile(source,run/'source.wav')
    source_hash=file_hash(source)
    if file_hash(run/'source.wav')!=source_hash:raise RuntimeError('Audio changed while copying')
    rel=run.relative_to(root).as_posix();prefix=rel+'/transcript'
    args=[str(binary),'-m',model.relative_to(root).as_posix(),'-f',rel+'/source.wav','-l',a.language,'-t',str(a.threads),'-osrt','-ojf','-of',prefix]+cfg['extraCliArguments']
    env=os.environ.copy();env.update(cfg['environment'])
    env['TEMP']=str(root/'cache/temp');env['TMP']=env['TEMP'];Path(env['TEMP']).mkdir(parents=True,exist_ok=True)
    started=time.monotonic()
    with (run/'stdout.log').open('wb') as stdout,(run/'stderr.log').open('wb') as stderr:
        p=subprocess.run(args,cwd=root,env=env,stdout=stdout,stderr=stderr,creationflags=subprocess.CREATE_NO_WINDOW)
    log=(run/'stderr.log').read_text(encoding='utf-8',errors='replace')
    gpu_ok=cfg['expectedGpuName'] in log and 'using Vulkan0 backend' in log
    srt=run/'transcript.srt';json_output=run/'transcript.json'
    primary_quality=inspect_outputs(srt,json_output,duration)
    execution_ok=p.returncode==0 and gpu_ok
    recovery=None;recovery_error=None
    if execution_ok and (cfg.get('longPauseRecovery') or (not a.sentence_only and '--vad' in cfg['extraCliArguments'])):
        from local_asr_chunks import speech_chunks, write_pcm_chunk, merge_chunks, without_vad
        try:
            chunks=speech_chunks(log,round(duration*1000))
            if chunks != [[0,round(duration*1000)]] or (not a.sentence_only and '--vad' in cfg['extraCliArguments']):
                recovery={'method':'contiguous-pcm-chunks-with-source-offsets-not-VAD-concatenated-timestamps',
                          'sourceCoverageMs':chunks,'speechDetectionIsNotCompletenessProof':True,'chunks':[]}
                assembled=[]
                for i,(first,last) in enumerate(chunks,1):
                    chunk_wav=run/f'chunk-{i:03}.wav'
                    mapping=write_pcm_chunk(run/'source.wav',chunk_wav,first,last)
                    prefix=rel+f'/chunk-{i:03}'
                    chunk_args=[str(binary),'-m',model.relative_to(root).as_posix(),'-f',chunk_wav.relative_to(root).as_posix(),'-l',a.language,'-t',str(a.threads),'-osrt','-ojf','-of',prefix]+without_vad(cfg['extraCliArguments'])
                    with (run/f'chunk-{i:03}.stdout.log').open('wb') as stdout,(run/f'chunk-{i:03}.stderr.log').open('wb') as stderr:
                        child=subprocess.run(chunk_args,cwd=root,env=env,stdout=stdout,stderr=stderr,creationflags=subprocess.CREATE_NO_WINDOW)
                    child_log=(run/f'chunk-{i:03}.stderr.log').read_text(encoding='utf-8',errors='replace')
                    child_gpu=cfg['expectedGpuName'] in child_log and 'using Vulkan0 backend' in child_log
                    gpu_ok=gpu_ok and child_gpu
                    chunk_json=root/(prefix+'.json');chunk_srt=root/(prefix+'.srt')
                    check=inspect_outputs(chunk_srt,chunk_json,(mapping['endSample']-mapping['startSample'])/mapping['sampleRate'])
                    recovery['chunks'].append({**mapping,'arguments':chunk_args[1:],'quality':check,'exitCode':child.returncode,'gpuVerified':child_gpu})
                    if child.returncode!=0 or not child_gpu or not check['passed']:
                        raise RuntimeError('Recovery chunk failed execution/GPU/output checks; no fallback')
                    assembled.append((chunk_json,first,last))
                srt,json_output=merge_chunks(assembled,run/'source-timeline')
        except (OSError,ValueError,RuntimeError,KeyError,TypeError) as error:
            recovery_error=str(error)
    quality=inspect_outputs(srt,json_output,duration)
    if recovery_error:
        quality['passed']=False;quality['errors'].append({'code':'long-pause-recovery-failed','detail':recovery_error})
    if recovery is not None:
        (run/'source-timeline-map.json').write_text(json.dumps(recovery,ensure_ascii=False,indent=2),encoding='utf-8')
    (run/'primary-quality-report.json').write_text(json.dumps(primary_quality,ensure_ascii=False,indent=2),encoding='utf-8')
    (run/'quality-report.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2),encoding='utf-8')
    fine=None;fine_error=None
    if not a.sentence_only and execution_ok and quality['passed']:
        from source_timing import whisper_units, package
        try:
            if '--vad' in cfg['extraCliArguments'] and recovery is None:
                raise ValueError('Unmapped VAD token times are not original-source times')
            raw=json.loads(json_output.read_text(encoding='utf-8'))
            units,details=whisper_units(raw,round(duration*1000000))
            fine=package(units,source_name=source.name,duration_us=round(duration*1000000),
                         source_sha256=source_hash,provider='local-whisper.cpp',
                         evidence={'rawJson':json_output.name,'rawSha256':file_hash(json_output),
                                   'inputWavSha256':source_hash,'sourceOffsetsMapped':recovery is not None},details=details)
            with (run/'source-timing.json').open('x',encoding='utf-8') as stream:
                json.dump(fine,stream,ensure_ascii=False,indent=2)
        except (ValueError,KeyError,TypeError) as error:
            fine_error=str(error)
    success=execution_ok and quality['passed'] and fine_error is None
    status='raw-transcript-generated-pending-content-review' if success else ('failed-quality-validation' if execution_ok else 'failed-no-fallback')
    receipt={'status':status,'exitCode':p.returncode,'gpuVerified':gpu_ok,'qualityValidationPassed':quality['passed'],'qualityReport':(run/'quality-report.json').relative_to(project).as_posix(),'elapsedSeconds':time.monotonic()-started,'inputWavSha256':source_hash,'inputDurationSeconds':duration,'modelSha256':cfg['modelSha256'],'binarySha256':cfg['binarySha256'],'vadModelSha256':cfg.get('vadModelSha256'),'language':a.language,'arguments':args[1:],'environment':cfg['environment'],'fullSourceDeclared':False,'contentVerified':False,'wordTimingVerified':False,'readyForPackaging':False,'srt':(srt.relative_to(project).as_posix() if srt.exists() else None),'evidence':run.relative_to(project).as_posix()}
    receipt['sourceTimelineRecoveryUsed']=recovery is not None
    receipt['fineTimingRequested']=not a.sentence_only
    receipt['fineTimingStructuralPassed']=fine is not None
    receipt['fineTimingError']=fine_error
    receipt['words']=(run/'source-timing.json').relative_to(project).as_posix() if fine is not None else None
    if fine_error:receipt['status']='failed-fine-timing-validation'
    receipt['runnerSha256']=file_hash(Path(__file__))
    (run/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))
    return 0 if success else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
