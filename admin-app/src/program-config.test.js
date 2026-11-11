// إعداد البرنامج في لوحة الإدارة (التدقيق 2026-11-11، المجموعة b5): حراس المصدر والتباين.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── التباين (WCAG 1.4.3): نص صغير على خلفيته لا يقل عن 4.5 إلى 1 ──
const lum = (hex) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const tokens = Object.fromEntries([...read('shared/css/status.css').matchAll(/(--st-[a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const css = read('admin-app/src/leaders-admin.css');
// قيمة خاصية في قاعدة محددها كما هو مكتوب، مع حل var(--st-*) من status.css
const prop = (selector, name) => {
  const rule = css.match(new RegExp(`^${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'm'));
  if (!rule) throw new Error(`لا قاعدة ${selector}`);
  const v = rule[1].match(new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+)`))?.[1].trim();
  const t = v?.match(/^var\((--st-[a-z-]+)\)$/)?.[1];
  return t ? tokens[t] : v;
};

describe('تباين قواعد المرحلة وأعلام المحتوى في اللوحة (admin-program-10)', () => {
  it('سطر قاعدة المرحلة بأنواعه الثلاثة يبلغ 4.5 على خلفيته', () => {
    for (const sel of ['.la-rule', '.la-rule.on_demand', '.la-rule.optional']) {
      const fg = prop(sel, 'color'), bg = prop(sel, 'background');
      expect(ratio(fg, bg), `${sel}: ${fg} على ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('أعلام كاتون والتقييم المستمر على البطاقة البيضاء تبلغ 4.5', () => {
    const fg = prop('.la-flags', 'color');
    expect(ratio(fg, '#FFFFFF'), `.la-flags: ${fg}`).toBeGreaterThanOrEqual(4.5);
  });
});
