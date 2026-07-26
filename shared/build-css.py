#!/usr/bin/env python3
"""
Build Script — Milestone Impact
1) يدمج ملفات CSS المشتركة + الخاصة في main.css لكل صفحة
2) يزامن ملفات JS المشتركة (shared/js) إلى مجلد كل صفحة
الاستخدام: python3 shared/build-css.py
"""
import os, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARED = os.path.join(ROOT, 'shared', 'css')
SHARED_JS = os.path.join(ROOT, 'shared', 'js')

SHARED_FILES = ['tokens.css', 'base.css', 'layout.css', 'components.css']

# ملف JS مُولَّد يبدأ بهذا السطر — عدّل المصدر في shared/js لا النسخة المولّدة
JS_HEADER = "// ══ Auto-generated from shared/js — edit the source there, not this copy. ══\n"

PAGES = {
    'home': {
        'css_dir': os.path.join(ROOT, 'home', 'assets', 'css'),
        'page_file': '05-home-sections.css',
        'extra': ['typeform.css'],     # من shared
        'html': os.path.join(ROOT, 'home', 'index.html'),
        'js_dir': os.path.join(ROOT, 'home', 'assets', 'js'),
        'js': ['canvas.js', 'counters.js', 'mobile-menu.js'],            # الملفات المشتركة التي تستعملها الصفحة
    },
    'leaders': {
        'css_dir': os.path.join(ROOT, 'leaders', 'assets', 'css'),
        'page_file': '05-sections.css',
        'extra': ['typeform.css'],
        'html': os.path.join(ROOT, 'leaders', 'index.html'),
        'js_dir': os.path.join(ROOT, 'leaders', 'assets', 'js'),
        'js': ['canvas.js', 'counters.js', 'tabs.js', 'mobile-menu.js'],
    },
}


def sync_js(page_name, config):
    """ينسخ ملفات JS المشتركة إلى مجلد الصفحة مع ترويسة تشير للمصدر."""
    for filename in config.get('js', []):
        src = os.path.join(SHARED_JS, filename)
        with open(src) as f:
            content = f.read()
        out_path = os.path.join(config['js_dir'], filename)
        with open(out_path, 'w') as f:
            f.write(JS_HEADER + content)
        print(f'   ↳ js: {page_name}/assets/js/{filename}')

def build(page_name, config):
    parts = [f'/* ══ Milestone Impact — {page_name.upper()} — Auto-generated. Edit source files, not this file. ══ */\n']

    # 1. Shared files
    for filename in SHARED_FILES:
        path = os.path.join(SHARED, filename)
        with open(path) as f:
            content = f.read()
        parts.append(f'\n/* ─── shared/{filename} ─── */\n{content}')

    # 2. Page-specific layout additions (03-layout في leaders له إضافات)
    layout_page = os.path.join(config['css_dir'], '03-layout.css')
    if os.path.exists(layout_page):
        shared_layout = open(os.path.join(SHARED, 'layout.css')).read()
        page_layout   = open(layout_page).read()
        # إضافة فقط الجزء الإضافي غير الموجود في shared
        extra = page_layout.replace(shared_layout, '').strip()
        if extra:
            parts.append(f'\n/* ─── {page_name}/layout-additions.css ─── */\n{extra}\n')

    # 3. Extra shared (typeform etc.)
    for filename in config.get('extra', []):
        path = os.path.join(SHARED, filename)
        with open(path) as f:
            content = f.read()
        parts.append(f'\n/* ─── shared/{filename} ─── */\n{content}')

    # 4. Page-specific sections
    page_path = os.path.join(config['css_dir'], config['page_file'])
    with open(page_path) as f:
        content = f.read()
    parts.append(f'\n/* ─── {page_name}/{config["page_file"]} ─── */\n{content}')

    combined = '\n'.join(parts)

    # حساب hash للـ version
    version = hashlib.md5(combined.encode()).hexdigest()[:8]

    # كتابة main.css
    out_path = os.path.join(config['css_dir'], 'main.css')
    with open(out_path, 'w') as f:
        f.write(combined)

    # تحديث version في HTML
    html_path = config['html']
    with open(html_path) as f:
        html = f.read()

    import re
    html_new = re.sub(
        r'href="assets/css/main\.css\?v=[^"]*"',
        f'href="assets/css/main.css?v={version}"',
        html
    )
    with open(html_path, 'w') as f:
        f.write(html_new)

    lines = len(combined.splitlines())
    print(f'✅ {page_name}: main.css — {lines} lines, v={version}')

if __name__ == '__main__':
    for name, config in PAGES.items():
        build(name, config)
        sync_js(name, config)
    print('\n🚀 Done! Commit and push to deploy.')
