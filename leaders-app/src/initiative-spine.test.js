// «الوثيقة الحية» وعدسة المسار (اعتمدهما المالك 2026-11-25، وتصحيحه: العدسة بالمسار لا بالمستوى الملخص).
// الحالات الأربع، و«جديد» عند الخبير، ووحدات العرض بمستوى إطار كل فصل في المسارات الـ27 كلها، وكثافة الصفحة بملف التعريف،
// ولا شاشة مشارك تقرأ المستوى الملخص.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { afterOf, changedSinceRead, chapterHours, chapterState, LENS, newInLevel, readByExpert, readinessQuestions, spineSummary, unitsFor, unitState } from '../../supabase/content/initiative-guide/v1/spine.js';
import { trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { chapterLens, trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import { chapterNoteOnly } from '../../supabase/functions/leaders-api/model-review.js';

// إطار كل فصل كما في الإنتاج (learning_models.dimension)
const DIM = {
  'initiative-charter': 'milestone', 'options-analysis': 'impact', 'theory-of-change': 'impact', 'portfolio-review': 'milestone',
  'benefits-register': 'impact', 'evidence-plan': 'impact', wbs: 'milestone', 'milestone-register': 'milestone', schedule: 'milestone',
  'cost-plan': 'milestone', procurement: 'milestone', 'stakeholder-map': 'leadership', governance: 'leadership', raid: 'milestone',
  'stage-gate': 'milestone', 'change-sustain': 'leadership', 'impact-report': 'impact', 'transformation-story': 'leadership', 'development-plan': 'leadership',
};
const KEYS = Object.keys(DIM);
const sectionsFor = (levels) => KEYS.map((k, i) => ({ id: `m${i}`, key: k, title: k, dimension: DIM[k], level: levels[DIM[k]] }));
const TRACKS = [1, 2, 3].flatMap((m) => [1, 2, 3].flatMap((i) => [1, 2, 3].map((l) => `M${m}I${i}L${l}`)));
const DENSITY_KEYS = { examples: ['adjacent', 'sector', 'all'], case: ['readiness', 'case3', 'case5'], summary: ['auto', 'write'], rubric: ['lines4', 'anchors', 'weighted'], checks: ['blocking', 'all'], panels: ['after_card', 'always'] };

describe('الحالات الأربع', () => {
  it('لم يبدأ، قيد الكتابة، منتهٍ، فيه ملاحظة؛ والملاحظة تُغلق بتعديل الفصل بعدها', () => {
    expect(chapterState({})).toBe('empty');
    expect(chapterState({ status: 'draft', updated_at: '2026-11-20' })).toBe('writing');
    expect(chapterState({ status: 'submitted', complete: true, updated_at: '2026-11-20' })).toBe('done');
    expect(chapterState({ status: 'submitted', complete: false, updated_at: '2026-11-20' })).toBe('writing');
    const noted = { status: 'reviewed', complete: true, note: 'أضف خط الأساس', updated_at: '2026-11-20T08:00:00Z', reviewed_at: '2026-11-21T08:00:00Z' };
    expect(chapterState(noted)).toBe('note');
    expect(chapterState({ ...noted, updated_at: '2026-11-22T08:00:00Z' })).toBe('done');
    expect(readByExpert({ ...noted, note: null })).toBe(true);
    expect(changedSinceRead({ ...noted, updated_at: '2026-11-22T08:00:00Z' })).toBe(true);
    expect(changedSinceRead(noted)).toBe(false);
    expect(changedSinceRead({ status: 'draft' })).toBe(false);
  });
  it('فصل الوثيقة ملاحظة لا إعادة، والبطاقة بوابة', () => {
    expect(chapterNoteOnly({ key: 'raid', capstone_sort: 3 })).toBe(true);
    expect(chapterNoteOnly({ key: 'initiative-charter', capstone_sort: 1 })).toBe(false);
  });
  it('«أنهيت ← التالي» يقفز إلى أول فصل غير منتهٍ بعده', () => {
    const s = [{ id: 'a' }, { id: 'b', status: 'submitted', complete: true }, { id: 'c' }];
    expect(afterOf(s, 'a').id).toBe('c');
  });
  it('«جديد في مستواك»: لا وسم في أول زيارة، ثم الفصول التي لم تُر', () => {
    const s = [{ key: 'a' }, { key: 'b' }];
    expect(newInLevel(s, null)).toEqual([]);
    expect(newInLevel(s, ['a'])).toEqual(['b']);
  });
});

describe('عدسة المسار في المسارات الـ27', () => {
  it.each(TRACKS)('%s: كل فصل في وحدة واحدة بمستوى إطاره، والكثافة والزمن سليمان', (key) => {
    const levels = trackLevels(key);
    const secs = sectionsFor(levels);
    const units = unitsFor(secs);
    const ids = units.flatMap((u) => u.items.map((x) => x.id));
    expect(ids.sort()).toEqual(secs.map((x) => x.id).sort());
    for (const u of units) {
      expect(u.items.every((x) => x.level === u.level), `${key} ${u.key}`).toBe(true);
      if (u.level === 'advanced') expect(u.items).toHaveLength(1);
      expect(['empty', 'writing', 'done', 'note']).toContain(unitState(u));
    }
    // الإطار الاحترافي فصلًا فصلًا، والتأسيسي مجمّع
    for (const d of ['milestone', 'impact', 'leadership']) {
      const mine = units.filter((u) => u.items[0].dimension === d || u.items.some((x) => x.dimension === d));
      const chapters = secs.filter((x) => x.dimension === d).length;
      if (levels[d] === 'advanced') expect(mine.length).toBe(chapters);
    }
    const man = trackManifest(key);
    const profile = man.profile;
    expect(man.levels).toEqual(levels);
    for (const x of secs) expect(chapterLens(man, { dimension: x.dimension })).toBe(levels[x.dimension]);
    expect(man.estimate_hours[0]).toBeLessThan(man.estimate_hours[1]);
    expect(man.estimate_hours[0]).toBeGreaterThanOrEqual(4);
    expect(man.estimate_hours[1]).toBeLessThanOrEqual(30);
    expect(profile.key).toMatch(/^(milestone|impact|leadership)-(beginner|intermediate|advanced)$/);
    const den = man.density;
    expect(den).toEqual(trackManifest(key).density);
    for (const [k, vals] of Object.entries(DENSITY_KEYS)) expect(vals, `${key} ${k}`).toContain(den[k]);
    const sum = spineSummary(secs);
    expect(sum.total).toBe(secs.length);
    expect(sum.hours).toBeGreaterThan(0);
    expect(sum.line).toMatch(/^أنجزت 0 من \d+ · بقي .+ · التالي: /);
    expect(readinessQuestions(secs)).toHaveLength(3);
  });
  it('M1I1L3: فصول المعالم والأثر مجمّعة بالشكل التأسيسي، وفصول القيادة فصلًا فصلًا', () => {
    const units = unitsFor(sectionsFor(trackLevels('M1I1L3')));
    expect(units.find((u) => u.items.some((x) => x.key === 'schedule')).items.length).toBeGreaterThan(1);
    expect(units.filter((u) => u.level === 'advanced').every((u) => u.items.length === 1 && DIM[u.items[0].key] === 'leadership')).toBe(true);
  });
  it('الزمن بمستوى الإطار: التأسيسي أقصر من الاحترافي، والكل من البيانات', () => {
    expect(chapterHours('beginner')).toBeLessThan(chapterHours('advanced'));
    expect(LENS.estimate_hours.beginner.range).toEqual([4, 6]);
  });
});

describe('لا مستوى ملخص في شاشات المشارك', () => {
  const dir = join(__dirname, 'screens');
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsx')).concat(['../App.jsx']);
  it.each(files)('%s لا يقرأ overallLevel ولا profile.level ولا d.level', (f) => {
    const src = readFileSync(join(dir, f), 'utf8');
    expect(src).not.toMatch(/overallLevel|profile\.level\b|\bd\.level\b|المستوى العام|مستواك العام/);
  });
});

describe('لا مستوى ملخص في مسارات المشارك على الخادم', () => {
  it.each(['participant.ts', 'hall.ts', 'file.ts'])('%s لا يستورد overallLevel', (f) => {
    expect(readFileSync(join(__dirname, '../../supabase/functions/leaders-api', f), 'utf8')).not.toMatch(/overallLevel/);
  });
  it('capstone.get يرسل ملف التعريف لا المستوى الملخص', () => {
    const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/capstone.ts'), 'utf8');
    const get = src.slice(src.indexOf('export async function get('), src.indexOf('export async function saveSummary'));
    expect(get).not.toMatch(/overallLevel/);
    expect(get).toMatch(/trackManifest\(/);
  });
});

describe('بيان المسار مصدر واحد', () => {
  it('مفتاح غير صالح يعيد null، والأولوية المحسومة تغيّر ملف التعريف وحده', () => {
    expect(trackManifest('X')).toBeNull();
    expect(trackManifest('M1I1L3').profile.key).toBe('milestone-beginner');
    expect(trackManifest('M1I1L3', 'impact').profile.key).toBe('impact-beginner');
  });
  it('الواجهة لا تحسب الكثافة من المستويات: Capstone.jsx يقرؤها من trackManifest', () => {
    const src = readFileSync(join(__dirname, 'screens/Capstone.jsx'), 'utf8');
    expect(src).toMatch(/trackManifest\(/);
    expect(src).not.toMatch(/density\.by_level|by_level\[/);
  });
});
