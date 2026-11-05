#!/usr/bin/env python3
# يقطّع تسجيلًا صوتيًا واحدًا متصلًا للجولة إلى مقطع لكل خطوة على حدود الكلام نفسه، لا على فترات الصمت وحدها:
# 1) تعرّف على الكلام بأزمنة الكلمات (faster-whisper)؛ 2) محاذاة الكلمات مع نصوص الخطوات (برمجة ديناميكية)؛
# 3) أول كلمة في كل خطوة تحدد بدايتها، وتُسحب البداية إلى نهاية فترة الصمت التي قبلها؛ 4) قطع بـffmpeg وكتابة segments.json.
# ما لا يطابق أي خطوة (كسطر تعليمات قُرئ بالخطأ في أول التسجيل) يُهمَل.
# الاستخدام: python3 cut-audio.py <voice.mp3> <steps.json> <outdir> [--model=large-v3-turbo]
# steps.json: قائمة {"i":1,"text":"..."} بترتيب الخطوات (يكتبها cut-audio.mjs من tour-steps.js).
import json, re, sys, difflib, subprocess, os
src, steps_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
model_name = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--model=')), 'large-v3-turbo')
STEPS = json.load(open(steps_path, encoding='utf-8'))
os.makedirs(out, exist_ok=True)

def ffprobe_dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True, check=True).stdout.strip())

# ── 1. التعرّف ──
import numpy as np
from faster_whisper import WhisperModel
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, dtype=np.float32)
model = WhisperModel(model_name, device='cpu', compute_type='int8')
segments, info = model.transcribe(audio, language='ar', beam_size=5, word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
words = []
for sg in segments:
    for w in (sg.words or []):
        words.append({'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3)})
    print(f'{sg.start:7.2f} {sg.text}', flush=True)
json.dump(words, open(os.path.join(out, 'words.json'), 'w'), ensure_ascii=False, indent=0)
total = ffprobe_dur(src)

# ── 2. المحاذاة ──
TASHKEEL = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
def norm(w):
    w = TASHKEEL.sub('', w)
    w = re.sub(r'[^\w؀-ۿ]+', '', w)
    w = re.sub('[إأآا]', 'ا', w).replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي')
    return re.sub(r'^(و|ف)(?=.{3,})', '', w)
def sim(a, b):
    return 1.0 if a == b else (difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0.0)
ref = [(k, norm(t)) for k, st in enumerate(STEPS) for t in st['text'].split() if norm(t)]
hyp = [(norm(w['w']), w) for w in words if norm(w['w'])]
n, m, GAP = len(hyp), len(ref), -0.45
score = [[0.0] * (m + 1) for _ in range(n + 1)]
back = [[0] * (m + 1) for _ in range(n + 1)]
for i in range(1, n + 1): score[i][0] = i * GAP; back[i][0] = 1
for j in range(1, m + 1): score[0][j] = j * GAP; back[0][j] = 2
for i in range(1, n + 1):
    hi = hyp[i - 1][0]
    for j in range(1, m + 1):
        d = score[i - 1][j - 1] + (sim(hi, ref[j - 1][1]) - 0.55) * 2
        u, l = score[i - 1][j] + GAP, score[i][j - 1] + GAP
        best = max(d, u, l); score[i][j] = best; back[i][j] = 0 if best == d else (1 if best == u else 2)
i, j, pairs = n, m, []
while i > 0 or j > 0:
    b = back[i][j]
    if i > 0 and j > 0 and b == 0:
        if sim(hyp[i - 1][0], ref[j - 1][1]) >= 0.55: pairs.append((i - 1, j - 1))
        i -= 1; j -= 1
    elif i > 0 and (j == 0 or b == 1): i -= 1
    else: j -= 1
first = [None] * len(STEPS); last = [None] * len(STEPS); matched = [0] * len(STEPS)
for hi, rj in pairs:
    k = ref[rj][0]; w = hyp[hi][1]; matched[k] += 1
    first[k] = w['s'] if first[k] is None else min(first[k], w['s'])
    last[k] = w['e'] if last[k] is None else max(last[k], w['e'])
for k, st in enumerate(STEPS):
    tot = sum(1 for r in ref if r[0] == k)
    if first[k] is None or matched[k] < tot * 0.6:
        sys.exit(f'✗ الخطوة {k + 1}: تطابق {matched[k]}/{tot} فقط؛ هل سُجّل نصها؟')
    print(f'الخطوة {k + 1:2d}: الكلام من {first[k]:7.2f}  تطابق {matched[k]}/{tot}')

# ── 3. الحدود: بداية كل خطوة عند نهاية الصمت الذي يسبق أول كلمة فيها، ونهايتها بعد بداية صمت الخطوة التالية بقليل ──
det = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', 'silencedetect=noise=-38dB:d=0.22', '-f', 'null', '-'], capture_output=True, text=True).stderr
sil = list(zip([float(x) for x in re.findall(r'silence_start: ([\d.]+)', det)], [float(x) for x in re.findall(r'silence_end: ([\d.]+)', det)]))
def gap_before(t):
    c = [s for s in sil if s[0] <= t + 0.05 and s[1] >= t - 1.5] or [s for s in sil if abs(s[1] - t) < 1.0]
    return max(c, key=lambda s: s[1]) if c else None
gaps = [gap_before(f) for f in first]
segs = []
for k in range(len(STEPS)):
    start = round((gaps[k][1] - 0.12) if gaps[k] else first[k] - 0.12, 3)
    if k + 1 < len(STEPS):
        nxt = gaps[k + 1]
        speech_end = round(nxt[0] if nxt else first[k + 1] - 0.2, 3); end = round(speech_end + 0.25, 3)
    else:
        speech_end = round(min(last[k] + 0.3, total), 3); end = round(total, 3)
    segs.append({'i': k + 1, 'start': start, 'end': end, 'dur': round(end - start, 3), 'speech': round(speech_end - start, 3)})

# ── 4. القطع ──
for s in segs:
    name = os.path.join(out, f"{s['i']:02d}.mp3")
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(s['start']), '-to', str(s['end']), '-i', src, '-c:a', 'libmp3lame', '-q:a', '2', name], check=True)
json.dump(segs, open(os.path.join(out, 'segments.json'), 'w'), indent=1)
print(f"✓ {len(segs)} مقطعًا في {out}؛ كلام {sum(s['speech'] for s in segs):.0f} ثانية من {total:.0f}؛ مهمل قبل أول خطوة: {segs[0]['start']:.1f} ثانية")
