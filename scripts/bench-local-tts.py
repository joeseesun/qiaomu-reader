"""Benchmark already downloaded Sherpa TTS models; does not install or download.

Run with the private benchmark Python environment. CPU generation is sequential
so candidates do not compete for compute. Output contains fixed public fixtures.
"""
import argparse
import importlib.metadata
import json
import pathlib
import platform
import resource
import statistics
import time

PROCESS_START = time.perf_counter()
import numpy as np
import sherpa_onnx
import soundfile as sf
IMPORT_SECONDS = time.perf_counter() - PROCESS_START

FIXTURES = {
    'short': '阅读让我们看见更大的世界，也理解不同的人生。',
    'paragraph': '清晨，阳光透过窗帘洒在书桌上。我打开昨天读到的那一页，继续听作者讲述他的经历。阅读不只是获得知识，也让我们学会耐心，理解不同的人生。当声音停下来时，我们可以做一条笔记，再从刚才的位置继续。',
    'numbers': '今天是2026年10月12日，下午3点半。全书共有113段，现在读到第3段，进度约为百分之二点六。',
    'mixed': '我正在学习 machine learning。阅读速度是正常速度，This is a good book. 请从当前段落继续朗读。',
}


def config_for(root, name, threads, precision):
    if name == 'melo':
        d = root / 'vits-melo-tts-zh_en'
        model = sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=str(d/'model.onnx'), tokens=str(d/'tokens.txt'),
            lexicon=str(d/'lexicon.txt')), num_threads=threads, provider='cpu')
        rules = ','.join(str(d/f) for f in ['date.fst', 'number.fst'])
        sid = 0
    elif name == 'piper':
        d = root / 'vits-piper-zh_CN-huayan-medium'
        model = sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=str(d/'zh_CN-huayan-medium.onnx'), tokens=str(d/'tokens.txt'),
            data_dir=str(d/'espeak-ng-data')), num_threads=threads, provider='cpu')
        rules = ''
        sid = 0
    else:
        d = root / ('kokoro-int8-multi-lang-v1_1' if precision == 'int8' else 'kokoro-multi-lang-v1_1')
        model = sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=str(d/('model.int8.onnx' if precision == 'int8' else 'model.onnx')), voices=str(d/'voices.bin'),
            tokens=str(d/'tokens.txt'), data_dir=str(d/'espeak-ng-data'),
            lexicon=','.join(str(d/f) for f in ['lexicon-us-en.txt', 'lexicon-zh.txt'])),
            num_threads=threads, provider='cpu')
        rules = ','.join(str(d/f) for f in ['date-zh.fst', 'number-zh.fst'])
        sid = 3  # official v1.1 Chinese zf_001
    return sherpa_onnx.OfflineTtsConfig(model=model, rule_fsts=rules, max_num_sentences=1), sid


def run(root, output, name, threads, precision, speaker, quick):
    cfg, sid = config_for(root, name, threads, precision)
    if speaker is not None:
        sid = speaker
    if not cfg.validate():
        raise ValueError(f'Invalid configuration for {name}')
    start = time.perf_counter()
    tts = sherpa_onnx.OfflineTts(cfg)
    load = time.perf_counter() - start
    result = dict(engine=name, precision=precision if name=='kokoro' else 'fp32', threads=threads, provider='cpu', sid=sid,
                  loadSeconds=load, importSeconds=IMPORT_SECONDS, rows=[])
    jobs = [('cold-short', FIXTURES['short'])]
    jobs += [(f'warm-short-{i+1}', FIXTURES['short']) for i in range(3)]
    jobs += [('paragraph', FIXTURES['paragraph'])]
    if not quick:
        jobs += [(k, v) for k, v in FIXTURES.items() if k not in ['short','paragraph']]
        jobs += [(f'consecutive-{i+1}', text) for i, text in enumerate(FIXTURES['paragraph'].split('。')) if text]
    for label, text in jobs:
        start = time.perf_counter()
        chunks = []
        def callback(samples, progress):
            chunks.append(dict(seconds=time.perf_counter()-start, samples=len(samples), progress=progress))
            return 1  # official playback example: 1 continues, 0 cancels
        audio = tts.generate(text=text, sid=sid, speed=1.0, callback=callback)
        elapsed = time.perf_counter()-start
        samples = np.asarray(audio.samples)
        if not len(samples) or not np.isfinite(samples).all() or np.max(np.abs(samples)) <= .001:
            result['rows'].append(dict(label=label, text=text, error='invalid-waveform',
                generateSeconds=elapsed, samples=len(samples), finite=bool(np.isfinite(samples).all())))
            print(json.dumps(dict(engine=name,label=label,error='invalid-waveform')),flush=True)
            continue
        duration = len(samples)/audio.sample_rate
        variant = f'{name}-{precision}-s{sid}' if name=='kokoro' else name
        path = output / f'{variant}-{threads}t-{label}.wav'
        sf.write(path, samples, audio.sample_rate, subtype='PCM_16')
        row = dict(label=label, text=text, generateSeconds=elapsed, audioSeconds=duration,
                   rtf=elapsed/duration, firstChunkSeconds=chunks[0]['seconds'] if chunks else None,
                   callbackChunks=len(chunks), chunks=chunks, sampleRate=audio.sample_rate, file=str(path))
        result['rows'].append(row)
        print(json.dumps(dict(engine=name, threads=threads, **{k:v for k,v in row.items() if k not in ['chunks', 'text', 'file']})), flush=True)
    warm = result['rows'][1:4]
    result['warmMedianSeconds'] = statistics.median(x['generateSeconds'] for x in warm)
    result['warmMedianRTF'] = statistics.median(x['rtf'] for x in warm)
    result['firstReadySeconds'] = IMPORT_SECONDS + load + result['rows'][0]['generateSeconds']
    result['processPeakRssBytes'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if platform.system() == 'Darwin' else 1024)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--engine', choices=['melo', 'piper', 'kokoro'], required=True)
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--kokoro-precision', choices=['int8','fp32'], default='fp32')
    parser.add_argument('--sid', type=int)
    parser.add_argument('--quick', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    result = run(args.root, args.output, args.engine, args.threads, args.kokoro_precision, args.sid, args.quick)
    result['environment'] = dict(platform=platform.platform(), machine=platform.machine(),
        python=platform.python_version(), packages={n:importlib.metadata.version(n) for n in ['sherpa-onnx', 'sherpa-onnx-core', 'numpy', 'soundfile']})
    variant = f'{args.engine}-{args.kokoro_precision}-s{result["sid"]}' if args.engine=='kokoro' else args.engine
    (args.output/f'{variant}-{args.threads}t.json').write_text(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
