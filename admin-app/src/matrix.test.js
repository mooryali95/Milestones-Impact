// شاشة مصفوفة التأثير: التوقف بثابت مسمى واحد، والقسم مرتب ومشتق من القائمة نفسها، والمسارات بربط trackId
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyFilters } from './filters.js';
import { apptsAr, attention, attentionSummary, IDLE_DAYS, idleDays, idleSince, idleTone, isIdle, MATRIX_PRESETS, orgsAr, regHref, regsHref, regTracks, trackCounts } from './matrix.js';

const NOW = new Date('2026-11-26T09:00:00Z');
const ago = (d) => new Date(NOW.getTime() - d * 864e5).toISOString();
const procs = [
  { key: 'p1', trackId: 'creation' }, { key: 'p2', trackId: 'creation' },
  { key: 'x9', trackId: 'innovation' }, { key: 'creationX', trackId: 'innovation' },
];
const tracks = [{ id: 'creation' }, { id: 'innovation' }];
const src = readFileSync(join(__dirname, 'screens', 'Matrix.jsx'), 'utf8');

describe('idleDays وIDLE_DAYS', () => {
  it('ثابت مسمى بقيمة 14 يومًا، ومنه يقرأ المرشح', () => {
    expect(IDLE_DAYS).toBe(14);
    expect(MATRIX_PRESETS.find((p) => p.key === 'idle').label).toContain(String(IDLE_DAYS));
    expect(src).not.toMatch(/14 \* DAY|> 14/);
  });
  it('يحسب من updatedAt ثم registeredAt', () => {
    expect(idleDays({ updatedAt: ago(20), registeredAt: ago(100) }, NOW)).toBe(20);
    expect(idleDays({ registeredAt: ago(5) }, NOW)).toBe(5);
  });
  it('المقدَّمة وطالبة إعادة الفتح ليستا متوقفتين، والعتبة شاملة', () => {
    expect(isIdle({ updatedAt: ago(IDLE_DAYS) }, NOW)).toBe(true);
    expect(isIdle({ updatedAt: ago(IDLE_DAYS - 1) }, NOW)).toBe(false);
    expect(isIdle({ submitted: true, updatedAt: ago(50) }, NOW)).toBe(false);
    expect(isIdle({ submitted: true, reopenRequested: true, updatedAt: ago(50) }, NOW)).toBe(false);
  });
  it('المرشح idle يطابق isIdle نفسه', () => {
    const regs = [{ id: 1, updatedAt: ago(40) }, { id: 2, updatedAt: ago(2) }];
    expect(applyFilters(regs, { presets: MATRIX_PRESETS }, { view: 'idle' }, NOW.getTime()).map((r) => r.id)).toEqual([1]);
  });
  it('التحذير فوق 30 والخطر فوق 90، والصياغة «منذ آخر تعديل»', () => {
    expect([idleTone(20), idleTone(31), idleTone(91)]).toEqual(['', 'warn', 'bad']);
    expect(idleSince(212)).toBe('منذ آخر تعديل 212 يومًا');
  });
});

describe('attention والخلاصة', () => {
  const regs = [
    { id: 'a', name: 'أ', updatedAt: ago(20) },
    { id: 'b', name: 'ب', updatedAt: ago(200), dates: { p1: '2026-01-01' } },
    { id: 'c', name: 'ج', updatedAt: ago(60) },
    { id: 'd', name: 'د', submitted: true, reopenRequested: true, updatedAt: ago(30) },
    { id: 'e', name: 'هـ', updatedAt: ago(1) },
  ];
  it('إعادة الفتح وحدها، والمتوقفون تنازليًا ومقسومون', () => {
    const a = attention(regs, NOW);
    expect(a.reopen.map((x) => x.r.id)).toEqual(['d']);
    expect(a.idle.map((x) => x.r.id)).toEqual(['b', 'c', 'a']);
    expect(a.notStarted.map((x) => x.r.id)).toEqual(['c', 'a']);
    expect(a.midway.map((x) => x.r.id)).toEqual(['b']);
  });
  it('سطر الخلاصة من القائمة نفسها بجمع صحيح', () => {
    expect(attentionSummary(attention(regs, NOW), regs.length)).toBe('طلب واحد إعادة فتح بانتظار قرارك · 3 جهات متوقفة من 5، أقدمها منذ 200 يومًا');
    const all = [{ updatedAt: ago(212) }, { updatedAt: ago(15) }];
    expect(attentionSummary(attention(all, NOW), 2)).toBe('كل الجهات (جهتان) متوقفة، أقدمها منذ 212 يومًا');
    expect(attentionSummary(attention([], NOW), 0)).toBe('لا جهات متوقفة ولا طلبات معلقة');
  });
  it('جمع «جهة»', () => {
    expect([1, 2, 3, 11].map(orgsAr)).toEqual(['جهة واحدة', 'جهتان', '3 جهات', '11 جهة']);
    expect([1, 2, 3, 11].map(apptsAr)).toEqual(['موعد واحد', 'موعدان', '3 مواعيد', '11 موعدًا']);
  });
});

describe('توزيع المسارات', () => {
  it('العد بربط trackId لا ببادئة المفتاح، والنسبة على السعة', () => {
    const regs = [{ dates: { p1: 1, creationX: 1 } }, { dates: { p2: 1, x9: 1 } }];
    const [c, i] = trackCounts(regs, procs, tracks);
    expect(c).toMatchObject({ count: 2, cap: 4, pct: 50 });
    expect(i).toMatchObject({ count: 2, cap: 4, pct: 50 });
    expect(regTracks(regs[0], procs).sort()).toEqual(['creation', 'innovation']);
  });
  it('بلا جهات: صفر بلا قسمة على صفر', () => {
    expect(trackCounts([], procs, tracks)[0]).toMatchObject({ count: 0, pct: 0 });
  });
});

describe('روابط بلا أفعال، والشاشة', () => {
  it('الروابط إلى التسجيلات مرشحة', () => {
    expect(regsHref({ view: 'idle' })).toBe('#/matrix/regs?view=idle');
    expect(regsHref({ track: 'creation' })).toBe('#/matrix/regs?track=creation');
    expect(regsHref()).toBe('#/matrix/regs');
    expect(regHref(7)).toBe('#/matrix/regs/7');
  });
  it('القسم مسمى، والزران محذوفان، والبريد خارج القائمة وحساس في التصدير', () => {
    expect(src).toContain('متوقفون وطلبات إعادة فتح');
    expect(src).not.toMatch(/onTab\('reports'\)|onTab\('regs'\)/);
    expect(src).not.toMatch(/<small className="la-muted" dir="ltr">\{r\.email\}/);
    expect(src).toMatch(/key: 'email'[^}]*sensitive: true/);
    expect(src).toMatch(/key: 'phone'[^}]*sensitive: true/);
    expect(src).not.toMatch(/startsWith\(tr\.id\)/);
    expect(src).not.toMatch(/slice\(0, 8\)/);
  });
  it('صف التسجيل يبلغه التبويب برابط، والأخطاء تُعلن، والنطاق معزول الاتجاه', () => {
    expect(src).toMatch(/<a className="mx-row-link" href=\{regHref\(r\.id\)\}/);
    expect(src).toMatch(/<LoadError message=\{error\}/);
    expect(src).toMatch(/<LoadError message=\{detailsError\}/);
    expect(src).not.toMatch(/\.catch\(\(\) => \{\}\)/);
    // النطاق في عنوان المستند عبر PageHeader، لا في الترويسة (المرحلة 4، 2026-11-26)
    expect(src).toContain('<bdi dir="ltr">matrix.sunkvalue.com</bdi>');
  });
});
