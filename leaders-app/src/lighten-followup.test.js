// متابعة تخفيف وثيقة المبادرة للتأسيسي (اعتمدها المالك 2026-11-26): قفل الخادم للفصلين الختاميين، ونطاق العمل عند البطاقة،
// وتنبيه الإدارة بالبطاقة المنتظرة، وسطر جولة التحسين، وزمن واحد في بطاقة المسار وخط الوثيقة
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closingLock, closingState, docMinutes, MAX_REVISIONS, STALE_CARD_DAYS, staleCards } from '../../supabase/functions/leaders-api/capstone.js';
import { CLOSING_LOCKED_AR, revisionRoundAr } from '../../supabase/functions/leaders-api/labels.js';
import { workMinutes } from '../../supabase/functions/leaders-api/logic.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const day = (s) => Date.parse(`${s}T00:00:00Z`);

describe('1. قفل الخادم للفصلين الختاميين بالقاعدة نفسها التي تقرؤها الواجهة', () => {
  const end = day('2027-03-27');
  it('closingLock يعيد سبب الرفض بالعربية حين يكون الفصل مؤجلًا، ولا شيء حين يُفتح أو لغير التأسيسي', () => {
    expect(closingLock('impact-report', 'beginner', end, day('2027-03-01'))).toBe(CLOSING_LOCKED_AR);
    expect(closingLock('transformation-story', 'beginner', end, day('2027-03-01'))).toBe(CLOSING_LOCKED_AR);
    expect(closingLock('impact-report', 'beginner', end, day('2027-03-20'))).toBeNull();
    expect(closingLock('impact-report', 'intermediate', end, day('2027-03-01'))).toBeNull();
    expect(closingLock('raid', 'beginner', end, day('2027-03-01'))).toBeNull();
    // القاعدة واحدة: القفل هو التأجيل نفسه
    for (const now of [day('2027-03-01'), day('2027-03-14'), day('2027-03-20')]) {
      expect(!!closingLock('impact-report', 'beginner', end, now)).toBe(closingState('impact-report', 'beginner', end, now).deferred);
    }
    expect(CLOSING_LOCKED_AR).toMatch(/آخر أسبوعين/);
  });
  it('حفظ النموذج في الخادم يرفض بها، ونهاية البرنامج من دالة واحدة يقرؤها الحفظ والوثيقة', () => {
    const part = read('supabase/functions/leaders-api/participant.ts');
    const save = part.slice(part.indexOf('export async function modelSave'), part.indexOf('export async function achievements'));
    expect(save).toContain('closingLock(');
    expect(save).toContain('programEndOf(');
    expect(save).toMatch(/new Fail\(locked, 409, 'chapter_locked'\)/);
    expect(read('supabase/functions/leaders-api/capstone.ts')).toContain('programEndOf(');
  });
});

describe('2. نطاق العمل عند بدء البطاقة', () => {
  it('الخادم يرسل نطاق العمل مع النموذج، والبطاقة تعرض الاختيار إن كان فارغًا وتحفظه بإجراء الملف القائم', () => {
    const part = read('supabase/functions/leaders-api/participant.ts');
    const get = part.slice(part.indexOf('export async function modelGet'), part.indexOf('export async function examplesFor'));
    expect(get).toContain('work_scope: p.work_scope || null');
    const ui = read('leaders-app/src/screens/Models.jsx');
    expect(ui).toContain("call('profile.save', { fields: { work_scope:");
    expect(ui).toMatch(/m\.key === 'initiative-charter' && !d\.work_scope/);
    // والحارس في canSubmit باقٍ
    expect(read('supabase/functions/leaders-api/capstone.js')).toContain("if (!state.scope) return { ok: false");
  });
});

describe('3. البطاقة المنتظرة عند المستشار أكثر من 7 أيام', () => {
  const now = day('2026-11-26');
  const card = (submitted_at, status = 'submitted', key = 'initiative-charter') => ({ status, submitted_at, learning_models: { key } });
  it('تُعد البطاقة المسلّمة التي مضى عليها أكثر من سبعة أيام بلا قرار، لا غيرها', () => {
    expect(STALE_CARD_DAYS).toBe(7);
    const rows = [card('2026-11-10T00:00:00Z'), card('2026-11-19T01:00:00Z'), card('2026-11-01T00:00:00Z', 'reviewed'),
      card('2026-11-01T00:00:00Z', 'submitted', 'raid'), card('2026-11-18T00:00:00Z'), card(null)];
    expect(staleCards(rows, now)).toBe(2);
  });
  it('سطر في الملخص اليومي (تصنيف ops) وعدد في لوحة الإدارة، لا نوع بريد جديد', () => {
    const digest = read('supabase/functions/leaders-api/digest.ts');
    expect(digest).toContain('staleCards(');
    expect(read('supabase/functions/_shared/notify-routing.js')).toMatch(/ev\('stale_cards', 'ops'/);
    expect(read('supabase/functions/leaders-api/admin.ts')).toContain('stale_cards: staleCards(');
    expect(read('admin-app/src/screens/Analytics.jsx')).toContain('o.stale_cards');
  });
});

describe('4. سطر جولة التحسين قبل التقديم', () => {
  it('النص من labels.js بعدد MAX_REVISIONS، ويظهر بجانب زر التقديم', () => {
    expect(revisionRoundAr(1)).toBe('لك جولة تحسين واحدة بعد ملاحظات المستشار.');
    expect(revisionRoundAr(2)).toBe('لك جولتا تحسين بعد ملاحظات المستشار.');
    const ui = read('leaders-app/src/screens/Capstone.jsx');
    expect(ui).toContain('revisionRoundAr(MAX_REVISIONS)');
    expect(MAX_REVISIONS).toBe(1);
  });
});

describe('5. زمن واحد في بطاقة المسار وخط الوثيقة', () => {
  it('docMinutes مجموع workMinutes للفصول المحسوبة، والفصل المؤجل خارجه', () => {
    const models = [
      { key: 'a', dimension: 'milestone', capstone_sort: 1, min_level: 'beginner', fields: [{ key: 'x', type: 'textarea' }] },
      { key: 'impact-report', dimension: 'impact', capstone_sort: 2, min_level: 'beginner', fields: [{ key: 'y', type: 'textarea' }] },
    ];
    const lv = { milestone: 'beginner', impact: 'beginner', leadership: 'beginner' };
    const one = workMinutes([{ key: 'x', type: 'textarea' }]);
    expect(docMinutes(models, lv, 'project', null, null, null)).toBe(2 * one);
    expect(docMinutes(models, lv, 'project', null, null, day('2027-03-27'), day('2027-03-01'))).toBe(one);
  });
  it('بطاقة المسار تقرأ الدقائق من الخادم، والواجهة تعرض رقمًا واحدًا', () => {
    expect(read('supabase/functions/leaders-api/participant.ts')).toContain('docMinutes(');
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain('card.support?.minutes');
  });
});
