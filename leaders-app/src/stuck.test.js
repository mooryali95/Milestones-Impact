// مرافق بناء المبادرة (4د): إشارات التعثر، و«عندي سؤال هنا»، والقطاع في الترشيح، وقراءة الخبير للوثيقة
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { askNote, CHECK_CHAPTERS, NEED_TYPES, roleForNeed, STUCK_DAYS, stuckSignals } from '../../supabase/functions/leaders-api/stuck.js';
import { matchScore, sameSector, sectorFamily } from '../../supabase/functions/leaders-api/logic.js';
import { CONSULT_ROLES } from '../../supabase/functions/leaders-api/labels.js';
import { sectorOf } from './guide.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const NOW = Date.parse('2026-11-15T12:00:00Z');
const ago = (days) => new Date(NOW - days * 864e5).toISOString();
const sec = (key, over = {}) => ({ id: `m-${key}`, key, title: key, dimension: 'milestone', complete: false, missing: 2, status: 'draft', updated_at: ago(1), ...over });

describe('إشارات التعثر: تُشتق مما يرسله الخادم، بلا تتبع إضافي', () => {
  it('كل فحص يكتبه محرك الاتساق له فصل يُصلح فيه', () => {
    const src = read('supabase/functions/leaders-api/capstone.js');
    const keys = [...src.matchAll(/add\('([a-z-]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(CHECK_CHAPTERS[k], k).toBeTruthy();
  });
  it('البطاقة المعادة إشارة فورية، وأولها', () => {
    const s = stuckSignals({ sections: [sec('initiative-charter'), sec('wbs', { updated_at: ago(30) })], card: { state: 'returned' }, now: NOW });
    expect(s[0]).toMatchObject({ key: 'card', kind: 'card' });
  });
  it('الفحص الفاشل إشارة حين لا تُلمس فصوله أسبوعًا، واللازم قبل غيره', () => {
    const sections = [sec('cost-plan', { updated_at: ago(8) }), sec('raid', { updated_at: ago(9) }), sec('schedule', { updated_at: ago(2) })];
    const checks = [
      { key: 'risk-owner', title: 'لكل خطر عالٍ مالك', ok: false },
      { key: 'cost-envelope', title: 'التكلفة ضمن الموازنة', ok: false, blocking: true, detail: 'تتجاوز' },
      { key: 'dates', title: 'التواريخ', ok: false },
    ];
    const s = stuckSignals({ sections, checks, now: NOW });
    expect(s.map((x) => x.key)).toEqual(['check:cost-envelope', 'check:risk-owner']);
    expect(s[0]).toMatchObject({ chapter: { key: 'cost-plan' }, days: 8, detail: 'تتجاوز' });
  });
  it(`الفصل المتوقف ${STUCK_DAYS.draft} يومًا إشارة، وما لم يُبدأ أو اكتمل أو سُلّم ليس تعثرًا`, () => {
    const sections = [
      sec('wbs', { updated_at: ago(15) }), sec('raid', { updated_at: null, status: null }),
      sec('governance', { updated_at: ago(20), complete: true }), sec('benefits-register', { updated_at: ago(20), status: 'submitted' }),
      sec('schedule', { updated_at: ago(13) }),
    ];
    const s = stuckSignals({ sections, now: NOW });
    expect(s.map((x) => x.key)).toEqual(['draft:wbs']);
    expect(s[0].title).toBe('«wbs» متوقف منذ 15 يومًا');
  });
  it('فصل له إشارة فحص لا تتكرر له إشارة توقف', () => {
    const s = stuckSignals({ sections: [sec('raid', { updated_at: ago(20) })], checks: [{ key: 'risk-owner', title: 'مالك', ok: false }], now: NOW });
    expect(s.map((x) => x.key)).toEqual(['check:risk-owner']);
  });
});

describe('عندي سؤال هنا: نوع الحاجة يختار الدور، والوصف معبأ بالسياق', () => {
  it('المنهج للخبير الموضوعي، والتعثر للموجّه، والجودة للمستشار، وكلها أدوار استشارة قائمة', () => {
    expect(NEED_TYPES.map((n) => [n.key, n.role])).toEqual([['method', 'specialist'], ['stuck', 'coach'], ['quality', 'advisor']]);
    for (const n of NEED_TYPES) expect(CONSULT_ROLES).toContain(n.role);
    expect(roleForNeed('x')).toBe('coach');
  });
  it('الوصف يحمل الفصل والفحص، ويترك السؤال للمشارك', () => {
    expect(askNote('الموارد والتكلفة', 'التكلفة ضمن الموازنة')).toBe('فصل «الموارد والتكلفة» في وثيقة مبادرتي (التكلفة ضمن الموازنة). سؤالي: ');
    expect(askNote('سجل المخاطر')).toBe('فصل «سجل المخاطر» في وثيقة مبادرتي. سؤالي: ');
  });
});

describe('القطاع في ترشيح الخبراء: عائلة واحدة لا نص حرفي', () => {
  it('«القطاع الصحي» و«الصحة» و«مستشفى» عائلة واحدة، والحكومي غير الصحي', () => {
    expect(sectorFamily('القطاع الصحي')).toBe('health');
    expect(sameSector('القطاع الصحي', 'الصحة')).toBe(true);
    expect(sameSector('مستشفى الملك فهد', 'الرعاية الصحية')).toBe(true);
    expect(sameSector('حكومي', 'الصحة')).toBe(false);
    expect(sameSector('أمانة المنطقة', 'البلديات والإسكان')).toBe(true);
    expect(sameSector('', 'الصحة')).toBe(false);
    expect(sameSector('قطاع نادر', 'قطاع نادر')).toBe(true);
  });
  it('الخبير من عائلة قطاع المشارك يأخذ نقاط السياق كاملة', () => {
    const e = { dimensions: ['milestone'], levels: ['beginner'], weekly_hours: 5, load: {}, sectors: ['الصحة'] };
    const need = { role: 'specialist', dimension: 'milestone', level: 'beginner', sector: 'القطاع الصحي' };
    expect(matchScore(e, need).parts.context).toBe(10);
    expect(matchScore({ ...e, sectors: ['التعليم'] }, need).parts.context).toBe(0);
  });
  it('المثال المحلول يقرأ العائلة نفسها', () => {
    expect(sectorOf('الرعاية الصحية')).toEqual({ key: 'health', matched: true });
    expect(sectorOf('أمانة المنطقة')).toEqual({ key: 'gov', matched: true });
    expect(sectorOf('شركة خاصة')).toEqual({ key: 'gov', matched: false });
  });
});

describe('الخبير يقرأ الوثيقة من بوابته، في نطاقه وبمفتاح الرؤية نفسه', () => {
  const file = read('supabase/functions/leaders-api/file.ts');
  const fn = file.slice(file.indexOf('export async function capstoneDoc'), file.indexOf('// ── إجابات القياس من البوابة'));
  it('في نطاقه وحده، والمسند بمفتاح asg_models، وكل اطلاع يُسجَّل', () => {
    expect(fn).toContain("if (!scope.advisor.has(pid) && !scope.assigned.has(pid)) throw new Fail('هذا المشارك ليس من مشاركيك', 403);");
    expect(fn).toContain("if (!scope.advisor.has(pid)) requireVisible(await visibilityOfParticipant(pid), 'asg_models');");
    expect(fn).toContain("await audit('system', e.email, 'expert.capstone-view', 'participants', pid, null, {});");
    expect(read('supabase/functions/leaders-api/index.ts')).toContain("'xp.capstone-doc': (e, b) => FL.capstoneDoc(e, b),");
  });
  it('بلا معيار المستشار ودرجته: الوثيقة كما يقرؤها الراعي', () => {
    expect(read('supabase/functions/leaders-api/capstone.ts')).toContain("return withTracking(await recordFor(p, 'sponsor'), p.id);");
  });
  it('آخر حفظ لكل فصل يُرسل للمشارك، منه تُشتق الإشارات', () => {
    expect(read('supabase/functions/leaders-api/capstone.ts')).toContain('updated_at: s.sub?.updated_at || null,');
  });
});
