# مقتطفات من تسجيل الجولة الكاملة لفيديو المشارك: لكل سطر مقاطع حرفية من نصوص الخطوات، تُقصّ من مقاطع الصوت
# المسجّلة وتُضم في مقطع واحد للسطر، فيعمل record.mjs --audio كما مع التسجيل المتصل.
# 1) كلمات كل خطوة بأزمنتها (faster-whisper، تُحفظ في words.json وتُعاد عند وجودها)؛ 2) حدود المقتطف من محاذاة نص الخطوة
#    مع الكلمات؛ 3) القص عند أهدأ نقطة قرب الحد (نافذة ±0.25 ث، إطارات 20 مللي ث)، ثم يُفرَّغ المقتطف ويُقارن بنصه:
#    إن نقصت كلمته الأولى أو الأخيرة أو زادت كلمة جُرّبت النقطة الأهدأ التالية، وإلا فشل الأمر بتقرير؛
#    4) تلاشٍ 12 مللي ث على كل حد، وصمت 0.28 ث بين مقتطفات السطر، ثم NN.mp3 وsegments.json (speech لكل سطر) وreport.json.
# الاستخدام: python3 excerpt-audio.py <segdir> <spec.json> <outdir> [--model=large-v3-turbo]
# segdir: مقاطع الجولة 01.mp3 إلى 18.mp3 (ناتج cut-audio.mjs)؛ spec.json يكتبه excerpt-audio.mjs من tour-steps.js.
import json, os, re, subprocess, sys, difflib
import numpy as np

seg_dir, spec_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
model_name = next((a.split('=', 1)[1] for a in sys.argv[4:] if a.startswith('--model=')), 'large-v3-turbo')
SR, HOP, WIN, FADE, JOIN = 48000, 0.02, 0.25, 0.012, 0.28
os.makedirs(out, exist_ok=True)
spec = json.load(open(spec_path, encoding='utf-8'))
steps = {s['i']: s['text'] for s in spec['steps']}

from faster_whisper import WhisperModel
model = WhisperModel(model_name, device='cpu', compute_type='int8')

def pcm(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()

def transcribe(a, words=True):
    a16 = a[::3]  # 48 كيلوهرتز إلى 16
    segs, _ = model.transcribe(a16, language='ar', beam_size=5, word_timestamps=words, vad_filter=False, condition_on_previous_text=False)
    segs = list(segs)
    if not words: return ' '.join(s.text for s in segs)
    return [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3)} for s in segs for w in (s.words or [])]

def norm(t):
    t = re.sub(r'[ً-ْٰـ]', '', t)
    t = re.sub(r'[^\w]', '', t)
    return t.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ة', 'ه').replace('ى', 'ي').lower()

def toks(t): return [x for x in (norm(w) for w in t.split()) if x]
# الكلمة كما سُمعت تقارب المكتوبة (التفريغ يخطئ حرفًا أحيانًا: «الأعلى» تُسمع «الأعنى»)
def like(a, b): return a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.6

audio, words = {}, {}
cache = os.path.join(out, 'words.json')
if os.path.exists(cache): words = {int(k): v for k, v in json.load(open(cache, encoding='utf-8')).items()}
for i in sorted({c['i'] for ln in spec['lines'] for c in ln['clips']}):
    audio[i] = pcm(os.path.join(seg_dir, f'{i:02d}.mp3'))
    if i not in words: words[i] = transcribe(audio[i]); print(f'كلمات الخطوة {i}: {len(words[i])}', flush=True)
json.dump(words, open(cache, 'w', encoding='utf-8'), ensure_ascii=False)

def env(a, lo, hi):
    lo, hi = max(0.0, lo), min(len(a) / SR, hi)
    out_, t = [], lo
    while t + HOP <= hi:
        x = a[int(t * SR):int((t + HOP) * SR)]
        out_.append((t + HOP / 2, 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)))
        t += HOP / 2
    return out_

QUIET = -38  # ديسبل دون ذروة المقطع: القص في صمت بين كلمتين لا في صوت
def candidates(a, t):
    # أهدأ النقاط حول الحد مرتبةً، ولا تقترب نقطتان أقل من 60 مللي ث، ولا قص فوق QUIET
    peak = 20 * np.log10(np.max(np.abs(a)) + 1e-9)
    pts, picked = sorted((p for p in env(a, t - WIN, t + WIN) if p[1] - peak < QUIET), key=lambda x: x[1]), []
    for p in pts:
        if all(abs(p[0] - q[0]) > 0.06 for q in picked): picked.append(p)
        if len(picked) == 4: break
    return picked

def locate(i, text):
    st, cl = steps[i].split(), text.split()
    k0 = next((p for p in range(len(st)) if [norm(x) for x in st[p:p + len(cl)]] == [norm(x) for x in cl]), None)
    if k0 is None: raise SystemExit(f'المقتطف ليس في نص الخطوة {i}: {text}')
    k1 = k0 + len(cl) - 1
    ws = words[i]
    sm = difflib.SequenceMatcher(None, [norm(x) for x in st], [norm(w['w']) for w in ws], autojunk=False)
    # التطابق التام، والاستبدال بطول متساوٍ كلمةً بكلمة (كلمة أخطأ التفريغ حرفًا فيها تبقى في موضعها)
    m = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and i2 - i1 == j2 - j1):
            for q in range(i2 - i1): m[i1 + q] = j1 + q
    def near(t, d):
        while t not in m and 0 <= t < len(st): t += d
        return m.get(t)
    return k0, k1, near(k0, 1), near(k1, -1), len(st)

report, segs = [], []
for li, ln in enumerate(spec['lines'], 1):
    parts = []
    for c in ln['clips']:
        i, text = c['i'], c['text']
        a, ws = audio[i], words[i]
        k0, k1, w0, w1, n = locate(i, text)
        starts = [(0.0, -120.0)] if k0 == 0 else candidates(a, ws[w0]['s'])
        ends = [(len(a) / SR, -120.0)] if k1 == n - 1 else candidates(a, ws[w1]['e'])
        want, ok = toks(text), None
        for s in starts:
            for e in ends:
                if e[0] - s[0] < 0.5: continue
                got = toks(transcribe(a[int(s[0] * SR):int(e[0] * SR)], words=False))
                # الأولى والأخيرة كما في النص، ولا كلمة زائدة من الجملة المجاورة
                if got and like(got[0], want[0]) and like(got[-1], want[-1]) and len(got) <= len(want) + 1:
                    ok = (s, e, got); break
            if ok: break
        if not ok: raise SystemExit(f'تعذر قص نظيف للسطر {li} من الخطوة {i}: {text}')
        (s, sdb), (e, edb), got = ok
        x = a[int(s * SR):int(e * SR)].copy()
        f = int(FADE * SR); ramp = np.linspace(0, 1, f, dtype=np.float32)
        if k0 > 0: x[:f] *= ramp
        if k1 < n - 1: x[-f:] *= ramp[::-1]
        parts.append(x)
        peak = 20 * np.log10(np.max(np.abs(a)) + 1e-9)
        report.append({'line': li, 'step': i, 'text': text, 'from': round(float(s), 3), 'to': round(float(e), 3), 'cut_db': [round(float(sdb - peak), 1), round(float(edb - peak), 1)], 'heard': ' '.join(got)})
        print(f'{li:02d} خ{i:02d} {s:6.2f}–{e:6.2f} قص {sdb - peak:6.1f}/{edb - peak:6.1f} dB · {text[:60]}', flush=True)
    gap = np.zeros(int(JOIN * SR), dtype=np.float32)
    y = np.concatenate([p for q in parts for p in (q, gap)][:-1])
    path = os.path.join(out, f'{li:02d}.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '160k', path], input=y.tobytes(), check=True)
    segs.append({'i': li, 'speech': round(len(y) / SR, 3)})
json.dump(segs, open(os.path.join(out, 'segments.json'), 'w'), indent=1)
json.dump(report, open(os.path.join(out, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'✓ {len(segs)} سطرًا، {sum(s["speech"] for s in segs):.1f} ث كلامًا، {out}')
