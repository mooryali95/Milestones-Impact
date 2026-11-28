// الجاهزية (أ7): وسما theme-color وcolor-scheme في index.html للتطبيقين يثبتان الوضع الفاتح، وtheme-color للمشارك يبقى لون الهوية (brand-graphite) كما كان.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const brand = read('../../shared/css/brand.css');
const token = (name) => brand.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1].toUpperCase();
const meta = (html, name) => html.match(new RegExp(`<meta name="${name}" content="([^"]+)"`))?.[1];

describe('وسوم اللون في index.html', () => {
  it('لوحة الإدارة: فاتح، بلا theme-color جديد', () => {
    const html = read('../index.html');
    expect(meta(html, 'color-scheme')).toBe('light');
    expect(meta(html, 'theme-color')).toBeUndefined();
  });
  it('تطبيق المشارك: فاتح، وtheme-color وملف التطبيق لون الهوية (brand-graphite)', () => {
    const html = read('../../leaders-app/index.html');
    const manifest = JSON.parse(read('../../leaders-app/public/manifest.webmanifest'));
    expect(meta(html, 'color-scheme')).toBe('light');
    expect(meta(html, 'theme-color').toUpperCase()).toBe(token('brand-graphite'));
    expect(manifest.theme_color.toUpperCase()).toBe(token('brand-graphite'));
  });
});
