#!/usr/bin/env python3
"""استيراد صور أبواب الكتيب المولَّدة خارج المنصة (بديل التوليد عبر Cloudflare).

  python3 scripts/book-images/import.py <ملف أو مجلد> [--as 01]

- الملف يُعرف برقمه في prompts.md (01.png … 18.png)، أو بـ --as عند ملف واحد.
- يُفحص: صورة سليمة، أفقية بنسبة قريبة من 3:2، ودقة لا تقل عن 1200 بكسل عرضًا، وليست شبه فارغة.
- يُقص إلى 3:2 من الوسط ويُصغَّر إلى 1400×933 ويُحفظ WebP بجودة 82، مثل الصور التسع الأولى.
- يُسجَّل في manifest.json وتُعلَّم حالته done في plan.json؛ وحين تكتمل الأبواب كلها: complete = true.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / 'scripts/book-images/plan.json'
OUT = ROOT / 'src/assets/book/chapters'
MANIFEST = OUT / 'manifest.json'
W, H = 1400, 933


def pending(plan):
    return [c for c in plan['chapters'] if c.get('status') != 'done']


def check(img):
    w, h = img.size
    if w < 1200: return f'الدقة منخفضة ({w}×{h})؛ المطلوب عرض 1200 بكسل على الأقل'
    r = w / h
    if not 1.3 <= r <= 1.7: return f'النسبة {r:.2f} بعيدة عن 3:2 (1.5)؛ ولّدها أفقية 3:2'
    stat = ImageStat.Stat(img.convert('L').resize((96, 64)))
    if stat.stddev[0] < 12: return 'الصورة شبه مسطحة بلا تفاصيل'
    return None


def to_book(img):
    img = img.convert('RGB')
    w, h = img.size
    tw = min(w, round(h * 1.5)); th = round(tw / 1.5)
    left, top = (w - tw) // 2, (h - th) // 2
    return img.crop((left, top, left + tw, top + th)).resize((W, H), Image.LANCZOS)


def main(args):
    if not args: sys.exit(__doc__)
    as_n = args[args.index('--as') + 1] if '--as' in args else None
    src = Path(args[0])
    files = sorted(p for p in (src.iterdir() if src.is_dir() else [src]) if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'))
    plan = json.loads(PLAN.read_text())
    manifest = json.loads(MANIFEST.read_text())
    todo = pending(plan)  # الترقيم ثابت كما في prompts.md وقت توليدها
    order = json.loads((ROOT / 'scripts/book-images/prompts-order.json').read_text())
    by_id = {c['id']: c for c in plan['chapters']}
    ok = 0
    for f in files:
        n = (as_n or f.stem).strip().lstrip('0') or '0'
        if not n.isdigit() or not 1 <= int(n) <= len(order):
            print(f'✗ {f.name}: الاسم يجب أن يكون رقم الباب من 01 إلى {len(order):02d}'); continue
        ch = by_id[order[int(n) - 1]]
        try:
            img = Image.open(f); img.load()
        except Exception as e:
            print(f'✗ {f.name}: ليست صورة صالحة ({e})'); continue
        why = check(img)
        if why: print(f'✗ {f.name} ({ch["title"]}): {why}'); continue
        to_book(img).save(OUT / ch['file'], 'WEBP', quality=82, method=6)
        manifest['images'][ch['id']] = ch['file']
        ch['status'] = 'done'
        ok += 1
        print(f'✓ {int(n):02d} {ch["title"]} ← {ch["file"]}')
    done = sum(1 for c in plan['chapters'] if c.get('status') == 'done')
    manifest['complete'] = done == len(plan['chapters'])
    PLAN.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'حُفظ {ok}. المكتمل {done}/{len(plan["chapters"])}' + (' — اكتملت الأبواب، والكتاب يستعمل صورها الآن' if manifest['complete'] else ''))


if __name__ == '__main__':
    main(sys.argv[1:])
