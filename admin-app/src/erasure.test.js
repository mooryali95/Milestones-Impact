// قرار طلب الحذف (erasure.js): المهلة بأيام الرياض، ومراحل التذكير، ونص الشريط، وتطبيع الاسم للتأكيد، وربط الشاشات
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bannerAr, daysLeft, ERASE_DELETED, ERASE_GROUNDS, ERASE_KEPT, leftAr, nameMatches, normName, reminderDue, reminderStage, urgency,
} from '../../supabase/functions/leaders-api/erasure.js';
import { inboxOf } from '../../supabase/functions/leaders-api/inbox.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const T = (iso) => Date.parse(iso);

describe('المهلة بالأيام', () => {
  it('بتقويم الرياض: المهلة 30 يومًا من الاستلام، و0 يوم المهلة، وسالب بعدها', () => {
    const c = '2026-11-10T22:30:00Z';   // 11 نوفمبر 01:30 بالرياض، والمهلة 11 ديسمبر بالرياض
    expect(daysLeft(c, T('2026-11-11T08:00:00Z'))).toBe(30);
    expect(daysLeft(c, T('2026-12-10T20:59:00Z'))).toBe(1);
    expect(daysLeft(c, T('2026-12-10T21:00:00Z'))).toBe(0);
    expect(daysLeft(c, T('2026-12-12T21:00:00Z'))).toBe(-2);
  });
  it('النص والإلحاح', () => {
    expect([leftAr(24), leftAr(2), leftAr(1), leftAr(0), leftAr(-2), leftAr(-5)]).toEqual(['بقي 24 يومًا', 'بقي يومان', 'بقي يوم واحد', 'اليوم آخر المهلة', 'تجاوز المهلة بيومين', 'تجاوز المهلة بـ5 أيام']);
    expect([urgency(8), urgency(7), urgency(0), urgency(-1)]).toEqual(['ok', 'soon', 'soon', 'late']);
  });
});

describe('مراحل التذكير (قرار المالك 5)', () => {
  it('قبل 10 أيام وقبل 3 ويوم المهلة ثم يوميًا بعد التأخر', () => {
    expect([11, 10, 4, 3, 1, 0, -1, -2].map(reminderStage)).toEqual([0, 1, 1, 2, 2, 3, 4, 5]);
  });
  it('واجب إن تجاوز آخر ما أُرسل، وللقائم وحده', () => {
    const row = { status: 'pending', created_at: '2026-11-01T09:00:00Z', reminder_stage: 1 };
    expect(reminderDue(row, T('2026-11-22T09:00:00Z'))).toBe(null);   // بقي 9: المرحلة 1 أُرسلت
    expect(reminderDue(row, T('2026-11-28T09:00:00Z'))).toBe(2);
    expect(reminderDue({ ...row, status: 'rejected' }, T('2026-12-05T09:00:00Z'))).toBe(null);
  });
});

describe('الشريط يقول ماذا تفعل', () => {
  it('لطلب واحد: الاسم والأيام والفعل، وللمتأخر «قرر الآن»', () => {
    expect(bannerAr([{ name: 'سارة الأحمد', days_left: 24 }])).toEqual({ tone: 'ok', text: 'طلب حذف بيانات ينتظر قرارك: سارة الأحمد، بقي 24 يومًا. افتح الطلب لتنفّذه أو ترفضه بسبب.' });
    expect(bannerAr([{ name: 'سارة الأحمد', days_left: -2 }])).toEqual({ tone: 'late', text: 'تجاوز طلب حذف بيانات سارة الأحمد المهلة النظامية بيومين. قرر الآن.' });
  });
  it('لعدة طلبات: العدد وأقربها', () => {
    expect(bannerAr([{ name: 'أ', days_left: 20 }, { name: 'ب', days_left: 4 }, { name: 'ج', days_left: 12 }]).text).toBe('3 طلبات حذف بيانات تنتظر قرارك، أقربها ينتهي بعد 4 أيام.');
    expect(bannerAr([{ name: 'أ', days_left: 20 }, { name: 'ب', days_left: -1 }])).toEqual({ tone: 'late', text: 'طلبا حذف بيانات ينتظران قرارك، منها 1 تجاوز المهلة.' });
    expect(bannerAr([])).toBe(null);
    // من لا يقرر لا يُقال له «قرر الآن» ثم تُعطَّل أزراره
    const off = { decide: false };
    expect(bannerAr([{ name: 'سارة الأحمد', days_left: 24 }], off).text).toBe('طلب حذف بيانات ينتظر قرار المدير الأعلى: سارة الأحمد، بقي 24 يومًا. لك أن تقرأه وتراسل صاحبه.');
    expect(bannerAr([{ name: 'سارة الأحمد', days_left: -2 }], off).text).toBe('تجاوز طلب حذف بيانات سارة الأحمد المهلة النظامية بيومين. القرار للمدير الأعلى، فذكّره به.');
    expect(bannerAr([{ name: 'أ', days_left: 20 }, { name: 'ب', days_left: 4 }], off).text).toBe('طلبا حذف بيانات ينتظران قرار المدير الأعلى، أقربها ينتهي بعد 4 أيام.');
    for (const b of [[{ days_left: 24 }], [{ days_left: -2 }], [{ days_left: 1 }, { days_left: 2 }]]) expect(bannerAr(b, off).text).not.toMatch(/قرارك|قرر الآن|لتنفّذه/);
  });
});

describe('تأكيد التنفيذ بكتابة الاسم', () => {
  it('يطبّع الهمزات والتاء المربوطة والألف المقصورة والتشكيل والمسافات', () => {
    expect(normName('  أُسامة   إبراهيم  ')).toBe(normName('اسامه ابراهيم'));
    expect(nameMatches('ليلى  آل سعود', 'ليلي ال سعود')).toBe(true);
    expect(nameMatches('سارة', 'سارة الأحمد')).toBe(false);
    expect(nameMatches('', '')).toBe(false);
  });
});

describe('النصوص من مصدر واحد', () => {
  it('الشهادة تُحذف، والدفع 10 سنوات، والنسخ الاحتياطية بمدتها، والأسباب بأساسها', () => {
    expect(ERASE_DELETED.join(' ')).toContain('الشهادة');
    const kept = ERASE_KEPT.map((k) => k.text).join(' ');
    for (const s of ['10 سنوات', '30 يومًا', 'الشهرية سنة']) expect(kept).toContain(s);
    expect(Object.keys(ERASE_GROUNDS)).toEqual(['repeat', 'litigation', 'legal_retention', 'other']);
    // قائمة الترحيل هي القائمة نفسها
    expect(read('supabase/migrations/20261116160000_leaders_erasure_decisions.sql')).toContain("ground in ('repeat', 'litigation', 'legal_retention', 'other')");
  });
  it('لا شرطة طويلة ولا متوسطة في النصوص العربية', () => {
    const all = [...ERASE_DELETED, ...ERASE_KEPT.map((k) => k.text), ...Object.values(ERASE_GROUNDS).map((g) => g.ar)].join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(read('admin-app/src/screens/Erasure.jsx')).not.toMatch(/[–—]/);
  });
});

describe('الصندوق', () => {
  it('طلب الحذف «قريب» قبل المهلة بأسبوع و«متأخر» بعدها', () => {
    const now = T('2026-12-01T09:00:00Z');
    const at = (d) => new Date(now - d * 864e5).toISOString();
    const r = inboxOf({ erasure: [{ id: 'a', participant_id: 'p', at: at(10) }, { id: 'b', participant_id: 'p', at: at(24) }, { id: 'c', participant_id: 'p', at: at(31) }] }, now);
    expect(r.items.map((i) => [i.id, !!i.soon, i.late])).toEqual([['c', false, true], ['b', true, false], ['a', false, false]]);
    expect([r.soon, r.late]).toEqual([1, 1]);
  });
  it('«قريب» بأيام الرياض كسطر البند نفسه، لا بأيام UTC منذ الطلب (قرب منتصف ليل الرياض)', () => {
    // استُلم 23:00 بالرياض فمهلته 10 ديسمبر. الساعة 01:00 من 3 ديسمبر بالرياض: بقي 7 أيام، ومضت 22 يومًا UTC
    const created = '2026-11-10T20:00:00Z';
    const now = T('2026-12-02T22:00:00Z');
    expect(daysLeft(created, now)).toBe(7);
    const r = inboxOf({ erasure: [{ id: 'a', participant_id: 'p', at: created }] }, now);
    expect([r.items[0].soon, r.items[0].late]).toEqual([true, false]);
  });
});

describe('الربط في الشاشات', () => {
  const ppl = read('admin-app/src/screens/Participants.jsx');
  it('البطاقة أعلى الملف والورقة منها، والشريط من admin.erasures، ومنطقة الخطر تحيل إلى البطاقة', () => {
    expect(ppl).toContain("L('admin.erasure-get', { participant_id: id })");
    expect(ppl).toMatch(/<ErasureCard e=\{erasure\}/);
    expect(ppl).toMatch(/<ErasureBanner data=\{erasures\}/);
    expect(ppl).toContain('erasurePending={!!erasure?.request}');
    const sheet = read('admin-app/src/screens/Erasure.jsx');
    for (const a of ['admin.erasure-execute', 'admin.erasure-decline', 'admin.erasure-withdrawn']) expect(sheet).toContain(`'${a}'`);
    expect(sheet).toContain('nameMatches(typed, p.full_name)');
  });
  it('المشارك يسحب طلبه بتأكيد، لا بنقرة واحدة', () => {
    const md = read('leaders-app/src/screens/MyData.jsx');
    expect(md).toMatch(/onClick=\{\(\) => \{ setWithdrawing\(true\)/);
    expect(md).toContain('نعم، اسحب الطلب');
  });
});
