// المرحلتان أ وأ2 من تصور تبويبات الإدارة 2026-11-24: شريط «يحتاج انتباهك» من الأحكام القائمة، وأعمدة المشاركين
import { describe, expect, it } from 'vitest';
import { exceptionRows, HEALTH_HREF } from './today.js';
import { colsClass, colsKey, DEFAULT_COLS, readCols, writeCols } from './pt-columns.js';
import { GROUP_OF, TAB_KEYWORDS } from './leaders-tabs.js';
import { reqConfirmAr, reqDoneAr } from './screens/Inbox.jsx';

const okH = { success: true, readiness: [{ key: 'a', ok: true, label: 'أ' }], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 1, cap: 80 } };
const green = { verdict: { level: 'green', title: 'سليم' } };
const okPh = { success: true, level: 'ok', checks: [{ key: 'cron', label: 'المهمة', level: 'ok', line: 'تعمل' }] };

describe('شريط «يحتاج انتباهك»', () => {
  it('فارغ حين يسلم كل شيء', () => {
    expect(exceptionRows({ ops: green, h: okH, orgs: [], ph: okPh })).toEqual([]);
  });
  it('سطر لكل مشكلة برابط إلى مكان إصلاحها، والأشد أولًا', () => {
    const h = { ...okH, readiness: [{ key: 'a', ok: true }, { key: 'b', ok: false }], pending_migrations: [{ name: 'm', gate: 'blocking' }] };
    const ph = { success: true, level: 'warn', checks: [{ key: 'codes', label: 'رموز الرعاية', level: 'warn', line: 'جهة بلا رمز' }, { key: 'cron', label: 'م', level: 'ok', line: '' }] };
    const rows = exceptionRows({ ops: { verdict: { level: 'amber', title: 'اقترب السقف' } }, h, orgs: [], ph });
    expect(rows.map((r) => r.key)).toEqual(['system', 'ops-amber', 'launch', 'ph-codes']);
    expect(rows.find((r) => r.key === 'ops-amber').href).toBe('#/leaders/mailcenter');
    expect(rows.find((r) => r.key === 'launch')).toMatchObject({ text: 'جاهزية الإطلاق 1 من 2', href: `${HEALTH_HREF}#ph-launch` });
    expect(rows.find((r) => r.key === 'ph-codes').href).toBe(`${HEALTH_HREF}#ph-check-codes`);
    expect(rows.find((r) => r.key === 'ph-codes').text).toBe('رموز الرعاية: جهة بلا رمز');
  });
  it('ما لم يُقرأ لا يُعد سليمًا، ومن يقرأ وحده لا يرى ما لا يُعرض له', () => {
    expect(exceptionRows({ ops: null, h: null, ph: { success: false }, canWrite: false }).map((r) => r.key)).toEqual(['system-unread', 'ph-unread']);
    const h = { ...okH, readiness: [{ key: 'b', ok: false }] };
    expect(exceptionRows({ ops: null, h, ph: okPh, canWrite: false })).toEqual([]);
  });
});

describe('أعمدة المشاركين', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  it('الافتراضي بلا اختيار، والاختيار يُحفظ ويُقرأ لكل مدير وحده', () => {
    const s = mem();
    expect(readCols(colsKey('a@x.com'), s)).toEqual(DEFAULT_COLS);
    expect(writeCols({ levels: true, joined: false }, colsKey('a@x.com'), s)).toBe(true);
    expect(readCols(colsKey('A@x.com'), s)).toEqual({ levels: true, joined: false });
    expect(readCols(colsKey('b@x.com'), s)).toEqual(DEFAULT_COLS);
    expect(colsClass({ levels: true, joined: true })).toBe('show-levels show-joined');
  });
  it('التخزين المحجوب لا يعطل: الافتراضي، والحفظ يعيد false', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readCols('k', bad)).toEqual(DEFAULT_COLS);
    expect(writeCols({ levels: true }, 'k', bad)).toBe(false);
    expect(readCols('k', { getItem: () => '{bad json' })).toEqual(DEFAULT_COLS);
  });
});

describe('تبويب صحة المنصة', () => {
  it('في مجموعة الإعداد، ويُوجد في البحث بجاهزية الإطلاق', () => {
    expect(GROUP_OF.health).toBe('الإعداد');
    expect(TAB_KEYWORDS.health).toContain('جاهزية الإطلاق');
  });
});

describe('اعتماد المتطلبات من الصندوق', () => {
  const it3 = (n) => Array.from({ length: n }, (_, i) => ({ title: `م${i + 1}`, sub: 'خطة' }));
  it('التأكيد يسمّي أول ثلاثة والعدد', () => {
    expect(reqConfirmAr(it3(2))).toBe('اعتماد 2 من المتطلبات: م1 (خطة)، م2 (خطة)؟ يصل كل مشارك بريد باعتماد متطلبه.');
    expect(reqConfirmAr(it3(5))).toContain('م3 (خطة) و2 غيرها؟');
  });
  it('النتيجة تسمّي ما لم يُحفظ', () => {
    expect(reqDoneAr(3, [])).toBe('اعتُمد 3');
    expect(reqDoneAr(3, [{ title: 'عمر', sub: 'خطة' }])).toBe('اعتُمد 2 من 3، ولم يُحفظ: عمر (خطة)');
  });
});
