"""أيقونات المنصة من رمز الهوية الرسمي: المعيّن الذهبي (shared/brand/svg/icon-transparent.svg)
على مربع بلون الهوية الداكن. يكتب SVG وPNG وICO لكل تطبيق: python3 scripts/brand/build-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
GROUND, GOLD = '#0B272F', '#C79A4B'  # graphite، وcopper: ذهبي الهوية على الأرضية الداكنة


def svg(side: float, radius: int = 112) -> str:
    # side: ضلع المعيّن قبل التدوير من 512 (الرمز الرسمي 160؛ أكبر هنا ليُقرأ في 16 بكسل)
    o = 256 - side / 2
    corner = f' rx="{radius}"' if radius else ''
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Milestone Impact">\n'
            f'  <title>Milestone Impact</title>\n  <rect width="512" height="512"{corner} fill="{GROUND}"/>\n'
            f'  <rect x="{o:g}" y="{o:g}" width="{side:g}" height="{side:g}" transform="rotate(45 256 256)" fill="{GOLD}"/>\n</svg>\n')


def png(size: int, side: float, radius: int = 112) -> Image.Image:
    s = 4  # رسم بدقة أعلى ثم تصغير لحواف ناعمة
    im = Image.new('RGBA', (512 * s, 512 * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 512 * s - 1, 512 * s - 1), radius=radius * s, fill=GROUND)
    h = side * 2 ** 0.5 / 2  # نصف قطر المعيّن بعد التدوير
    c = 256 * s
    d.polygon([(c, c - h * s), (c + h * s, c), (c, c + h * s), (c - h * s, c)], fill=GOLD)
    return im.resize((size, size), Image.LANCZOS)


TAB = 200        # أيقونة التبويب والتطبيق
MASK = 150       # القابلة للقص (منطقة الأمان 80٪)
TARGETS = {
    'favicon.svg': lambda: svg(TAB),
    'apple-touch-icon.png': lambda: png(180, TAB, 0),
    'apple-touch-icon-180.png': lambda: png(180, TAB, 0),
    'icon-192.png': lambda: png(192, TAB), 'android-chrome-192x192.png': lambda: png(192, TAB),
    'icon-512.png': lambda: png(512, TAB), 'android-chrome-512x512.png': lambda: png(512, TAB),
    'icon-maskable-512.png': lambda: png(512, MASK, 0), 'maskable-icon-512.png': lambda: png(512, MASK, 0),
}
DIRS = ['shared/brand/favicon', 'public', 'home', 'leaders-app/public', 'admin-app/public', 'SSPDF', 'SSPDF/public']

for rel in DIRS:
    folder = ROOT / rel
    for name, make in TARGETS.items():
        f = folder / name
        if not f.exists():
            continue
        out = make()
        if isinstance(out, str):
            f.write_text(out)
        else:
            out.save(f, optimize=True)
        print('✓', f.relative_to(ROOT))
    ico = folder / 'favicon.ico'
    if ico.exists():
        png(256, TAB).save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
        print('✓', ico.relative_to(ROOT))
