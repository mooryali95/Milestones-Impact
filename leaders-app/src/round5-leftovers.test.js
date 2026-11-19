// بقايا محرر رحلة الدفعة والتوازي (الجولة الخامسة، المراجعة 2026-11-18 البند 3 أ 6 و7):
// تحذير الورشة خارج نافذتها من مصدر واحد، و«اجعل نهاية الدفعة …» في المسودة، وخريطة الجهة بالموقوفة والتوازي والمسار،
// و«أين هو» عند الخبير والمنسق من currentStages نفسها.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { journeyTimeline, outsideSessions } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { chainEndOffer, impactLines, impactSummary, planEndsIssue, planImpact, planNotice } from '../../supabase/functions/leaders-api/cohort-plan.js';
import { journeyBlocks, journeyMap, mapLanes, stageNow } from '../../supabase/functions/leaders-api/journey-map.js';
import { coordParticipant, coordPermissions } from '../../supabase/functions/leaders-api/logic.js';
import { endsOffer, historyRows, mergeEdit, planBody, planDraft, cohortTimeline } from '../../admin-app/src/cohort-journey.js';
import { workshopDays } from '../../admin-app/src/workshop-days.js';
import { outsideAr } from '../../admin-app/src/screens/Activities.jsx';
import JourneyMap, { laneAr } from '../../shared/ui/JourneyMap.jsx';
import { filterRows, stageOptions, stagesOf } from './coord.js';
import { MILESTONES, REQS, STAGES, STAGES_WITH } from './journey-legacy.cases.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const DASH = /[\u2013\u2014]/;

// ── 1. ورشة خارج نافذة مرحلتها ──
describe('outsideSessions: من علامة الخط نفسه، تنبيه لا منع', () => {
  const stages = [
    { key: 'approval', title_ar: 'الاعتماد', phase: 'admission', sort: 1, duration_days: 3, active: true },
    { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 14, active: true },
    { key: 'final', title_ar: 'التقرير', phase: 'impact', sort: 3, duration_days: 7, active: true },
  ];
  const requirements = [{ id: 'r1', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'الأيام التدريبية', active: true, config: { sessions_required: 2 }, sort: 1 }];
  const cohort = { id: 'c1', name: 'دفعة', starts_on: '2026-11-02', ends_on: '2027-01-31', schedule: {} };
  const day = (id, at, extra = {}) => ({ id, requirement_id: 'r1', cohort_id: 'c1', title_ar: id, mode: 'in_person', starts_at: at ? `${at}T06:00:00Z` : null, ends_at: at ? `${at}T10:00:00Z` : null, active: true, ...extra });
  const sessions = [day('in', '2026-11-10'), day('out', '2026-12-20'), day('tbd', null)];
  const def = { stages, requirements, sessions };
  const model = cohortTimeline(def, cohort, '2026-11-16T09:00:00Z');
  it('الأيام خارج النافذة بأسمائها ونافذة مرحلتها، وغير المؤرخ والداخل لا', () => {
    const out = outsideSessions(model);
    expect(out.map((x) => [x.session, x.stage, x.stage_title])).toEqual([['out', 'training', 'التدريب']]);
    expect(out[0].window_ar).toMatch(/إلى/);
    expect(out[0].text).toBe(`«الأيام التدريبية» يوم ${out[0].date_ar} خارج نافذة «التدريب» (${out[0].window_ar})`);
    expect(DASH.test(out[0].text)).toBe(false);
  });
  it('قسم الأيام في البطاقة والتنبيه في الرأس يقرآن الدالة نفسها', () => {
    const d = workshopDays({ def, stage: { key: 'training', title: 'التدريب' }, sessions, model, cohortId: 'c1', now: Date.parse('2026-11-16T09:00:00Z') });
    expect(d.rows.filter((r) => r.outside).map((r) => r.id)).toEqual(['out']);
    expect(read('admin-app/src/workshop-days.js')).toContain('outsideSessions(model)');
    expect(read('admin-app/src/screens/CohortJourney.jsx')).toContain('const outside = useMemo(() => outsideSessions(model), [model]);');
    // والخادم لـ«الحضور والجلسات» بالدالتين نفسيهما، لا حساب تاريخ ثانٍ
    const act = read('supabase/functions/leaders-api/activities.ts');
    expect(act).toContain('const model = journeyTimeline({ stages: view.stages, requirements: view.requirements }, { cohort: c, sessions: own });');
    expect(act).toContain('for (const x of outsideSessions(model))');
  });
  it('برنامج بلا تواريخ أو دفعة مفتوحة: لا شيء خارج نافذة', () => {
    expect(outsideSessions(journeyTimeline({ stages, requirements }, {}))).toEqual([]);
    expect(outsideSessions(cohortTimeline(def, { ...cohort, is_default: true }))).toEqual([]);
    expect(outsideSessions(null)).toEqual([]);
  });
  it('«الحضور والجلسات»: السطر بنافذة المرحلة، واسم الدفعة للجلسة العامة', () => {
    const x = { cohort_id: 'c1', cohort: 'دفعة نوفمبر', stage: 'التدريب', window_ar: '5 نوفمبر إلى 18 نوفمبر' };
    expect(outsideAr(x)).toBe('خارج نافذة «التدريب» (5 نوفمبر إلى 18 نوفمبر). الحضور يُحسب، وراجع الموعد أو مدة المرحلة');
    expect(outsideAr(x, true)).toContain(' في دفعة نوفمبر.');
  });
});

// ── 2. «اجعل نهاية الدفعة …» ──
const SEED = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end' };
const TRACK = STAGES.map((s) => (s.key === 'ojt_coaching' ? { ...s, rules: SEED } : s));
const def = { stages: TRACK, requirements: REQS };
describe('chainEndOffer وplanEndsIssue', () => {
  const C = { id: 'c1', name: 'دفعة', starts_on: '2026-11-04', ends_on: '2027-06-30', schedule: {} };
  it('تُقترح نهاية السلسلة حين تخالف نهاية الدفعة (chain_end_mismatch أو over_end)، وإلا لا', () => {
    const early = chainEndOffer(TRACK, C);
    expect(early.code).toBe('chain_end_mismatch');
    expect(early.end < '2027-06-30').toBe(true);
    const over = chainEndOffer(STAGES, { ...C, ends_on: '2027-01-01' });
    expect(over.code).toBe('over_end');
    expect(over.end > '2027-01-01').toBe(true);
    // بلا مسار وتنتهي السلسلة قبل نهاية الدفعة: لا تنبيه أصلًا فلا زر
    expect(chainEndOffer(STAGES, C)).toBe(null);
    expect(chainEndOffer(TRACK, { ...C, ends_on: early.end })).toBe(null);
    expect(chainEndOffer(TRACK, { ...C, is_default: true })).toBe(null);
    expect(chainEndOffer(TRACK, { ...C, starts_on: null })).toBe(null);
  });
  it('الحراس: يوم صالح لا قبل البداية، في دفعة مؤرخة غير مفتوحة', () => {
    expect(planEndsIssue(C, '2027-02-01')).toBe(null);
    expect(planEndsIssue(C, '2026-10-01').code).toBe('ends_before');
    expect(planEndsIssue(C, 'غدًا').code).toBe('ends_value');
    expect(planEndsIssue({ ...C, is_default: true }, '2027-02-01').code).toBe('ends_open');
    expect(planEndsIssue({ ...C, starts_on: null }, '2027-02-01').code).toBe('ends_undated');
  });
  it('الأثر: سطر النهاية، ومعالم «نهاية الدفعة» والمسار الممتد إليها تتحرك فتدخل moved_ids، والسجل والإشعار', () => {
    const offer = chainEndOffer(TRACK, C);
    const impact = planImpact({ stages: TRACK, before: {}, after: {}, cohort: C, milestones: MILESTONES, endsOn: offer.end });
    expect(impact.ends).toEqual({ before: '2027-06-30', after: offer.end });
    expect(impact.milestones.map((m) => m.id)).toContain('m-end');
    // المسار المستمر يمتد إلى نهاية الدفعة، فيتغير امتداده
    expect(impact.changes.filter((x) => x.track).map((x) => x.key)).toEqual(['ojt_coaching']);
    const lines = impactLines(impact);
    expect(lines.find((l) => l.key === 'ends').text).toBe(`نهاية الدفعة المسجلة تصير ${offer.end} بدل 2027-06-30، فتتبعها معالم «نهاية الدفعة» وما يمتد إلى نهايتها`);
    expect(impactSummary(impact).ends).toEqual(['2027-06-30', offer.end]);
    expect(planNotice(impact).body).toContain('وتنتهي دفعتك الآن');
    // بلا endsOn لا مفتاح جديد في الأثر (journey-legacy)
    expect('ends' in planImpact({ stages: TRACK, before: {}, after: {}, cohort: C, milestones: MILESTONES })).toBe(false);
  });
  it('المسودة: الزر لمن يكتب والخطة غير مقفلة، يضع النهاية في المسودة ولا يطبق شيئًا، وplanBody يرسلها', () => {
    const cohort = { ...C, updated_at: '2026-11-01T00:00:00Z' };
    expect(endsOffer({ def, cohort, canWrite: false })).toBe(null);
    expect(endsOffer({ def, cohort, canWrite: true, lock: { code: 'closed', msg: 'مغلقة' } })).toBe(null);
    const o = endsOffer({ def, cohort, canWrite: true });
    expect(o.label).toMatch(/^اجعل نهاية الدفعة /);
    const edit = mergeEdit(null, { ends_on: o.end });
    const d = planDraft({ def, cohort, edit });
    expect([d.ends, d.edits, d.errors]).toEqual([{ before: '2027-06-30', after: o.end }, 1, []]);
    expect(d.cohort.ends_on).toBe(o.end);
    expect(d.issues.some((x) => x.code === 'chain_end_mismatch')).toBe(false);
    // بعد وضعها في المسودة لا يُقترح الزر مرة ثانية
    expect(endsOffer({ def, cohort: d.cohort, canWrite: true })).toBe(null);
    expect(planBody(cohort, edit, 'preview').ends_on).toBe(o.end);
    // الرجوع إلى المحفوظة يلغي التعديل
    const back = mergeEdit(edit, { ends_on: '2027-06-30' });
    expect(planDraft({ def, cohort, edit: back }).edits).toBe(0);
    expect('ends_on' in planBody(cohort, back, 'preview')).toBe(false);
    // يوم قبل البداية خطأ في المسودة فلا يُراجع
    expect(planDraft({ def, cohort, edit: { ends_on: '2026-01-01' } }).errors[0].code).toBe('ends_before');
  });
  it('السجل يسمي ضبط النهاية', () => {
    expect(historyRows([{ id: 1, action: 'cohort.plan', at: '2026-11-19T10:00:00Z', summary: { changes: [], ends: ['2027-06-30', '2027-05-01'] } }])[0].text).toMatch(/^ضُبطت نهاية الدفعة /);
  });
  it('الواجهة: الزر في الرأس بالمسودة وحدها، وحفظه بـ«راجع واحفظ»', () => {
    const j = read('admin-app/src/screens/CohortJourney.jsx');
    expect(j).toContain('onClick={() => put({ ends_on: ends.end })}');
    expect(j).toContain("const ends = d?.def ? endsOffer({ def: d.def, cohort: shown, canWrite, lock }) : null;");
  });
});

// ── 3. خريطة الجهة: الموقوفة والتوازي والمسار ──
describe('mapLanes وخريطة الجهة', () => {
  const lanesOf = (stages) => mapLanes(stages.filter((s) => s.active !== false).sort((a, b) => a.sort - b.sort));
  it('«تسير معًا» بمفتاح أول المجموعة، والمسار علامته، وبلا توازٍ لا شيء', () => {
    expect(lanesOf(STAGES_WITH).together).toEqual({ training: 'training', ojt_coaching: 'training' });
    expect(lanesOf(STAGES)).toEqual({ together: {}, tracks: [] });
    expect(lanesOf(TRACK)).toEqual({ together: {}, tracks: ['ojt_coaching'] });
  });
  it('لوحة الجهة تمرر الموقوفة والتوازي كملف الدفعة، من دالة واحدة', () => {
    const c = read('supabase/functions/leaders-api/coordinator.ts');
    expect(c.match(/off: def\.stages_off \|\| \[\],/g)).toHaveLength(2);
    expect(c.match(/journey_map\.lanes = mapLanes\(mapStages\);/g)).toHaveLength(2);
  });
  it('JourneyMap يعرض السطر تحت المرحلة والموقوفة باهتة، وخريطة بلا lanes كما كانت', () => {
    const stages = STAGES_WITH.filter((s) => ['training', 'ojt_coaching', 'support'].includes(s.key));
    const map = journeyMap({ stages, people: [], cohort: { name: 'د', starts_on: '2026-11-04', schedule: {} }, off: [{ key: 'consulting', title_ar: 'الاستشارة', sort: 6, phase: 'qualification' }] });
    const rows = map.stages;
    expect(laneAr(rows.find((s) => s.key === 'ojt_coaching'), rows, mapLanes(stages))).toBe('تسير مع «مرحلة training»');
    expect(laneAr(rows.find((s) => s.key === 'training'), rows, mapLanes(stages))).toBe('«مرحلة ojt_coaching» تسير معها');
    expect(laneAr(rows.find((s) => s.key === 'support'), rows, mapLanes(stages))).toBe('');
    expect(laneAr(rows.find((s) => s.key === 'support'), rows, null)).toBe('');
    const html = renderToStaticMarkup(React.createElement(JourneyMap, { map: { ...map, lanes: mapLanes(stages) } }));
    expect(html).toContain('<small class="jm-lane">تسير مع «مرحلة training»</small>');
    expect(html).toMatch(/class="jm-stage[^"]* jm-with"/);
    expect(html).toContain('موقوفة لهذه الدفعة');
    expect(html).not.toMatch(DASH);
  });
});

// ── 4. «أين هو» عند الخبير والمنسق ──
const st = (key, status, extra = {}) => ({ key, title_ar: `م ${key}`, status, items: [], ...extra });
describe('stageNow وjourneyBlocks: currentStages نفسها', () => {
  const together = [st('a', 'done'), st('b', 'active'), st('c', 'active', { rules: { unlock: 'with', with: 'b' } }), st('t', 'active', { lane: 'track', rules: { lane: 'track', unlock: 'with', with: 'b', until: 'journey_end' } }),
    st('s', 'available', { lane: 'service', rules: { lane: 'service' }, items: [{ status: 'done' }] }), st('d', 'locked')];
  it('مرحلتان تسيران معًا تُسميان معًا، والمسار بجانبهما لا مكانهما', () => {
    const n = stageNow(together);
    expect([n.stage, n.stages, n.together, n.tracks]).toEqual(['م b وم c معًا', ['م b', 'م c'], true, ['م t']]);
    expect(n.label).toBe('المرحلتان الحاليتان تسيران معًا: م b وم c');
    const one = stageNow([st('a', 'done'), st('b', 'active'), st('d', 'locked')]);
    expect([one.stage, one.together, one.label]).toEqual(['م b', false, 'المرحلة الحالية: م b']);
    expect(stageNow([st('a', 'done')]).stage).toBe(null);
  });
  it('الرحلة كتلًا: المجموعة كتلة، ثم المسارات والخدمات بحال استخدامها', () => {
    const b = journeyBlocks(together);
    expect(b.blocks.map((x) => [x.key, x.together, x.stages.map((s) => s.key)])).toEqual([['a', false, ['a']], ['b', true, ['b', 'c']], ['d', false, ['d']]]);
    expect(b.tracks.map((s) => s.key)).toEqual(['t']);
    expect(b.services.map((s) => [s.key, s.used])).toEqual([['s', true]]);
  });
  it('المنسق: المرحلتان للمرشّح، والمسار بجانبهما، وبلا توازٍ لا حقل جديد', () => {
    const perms = coordPermissions({});
    const p = coordParticipant({ id: 'p', full_name: 'س', status: 'enrolled', stage: 'م b وم c معًا', stages: ['م b', 'م c'], tracks: ['م t'] }, perms);
    expect([p.stage, p.stages, p.tracks]).toEqual(['م b وم c معًا', ['م b', 'م c'], ['م t']]);
    const q = coordParticipant({ id: 'q', full_name: 'ع', status: 'enrolled', stage: 'م b', stages: ['م b'], tracks: [] }, perms);
    expect(['stages' in q, 'tracks' in q]).toEqual([false, false]);
    expect(coordParticipant({ id: 'w', full_name: 'ص', status: 'withdrawn', stage: 'م b', stages: ['م b', 'م c'] }, perms).stages).toBeUndefined();
    const rows = [{ ...p, full_name: 'س' }, { ...q, full_name: 'ع' }];
    expect(stagesOf(p)).toEqual(['م b', 'م c']);
    expect(stageOptions(rows, ['م b', 'م c'])).toEqual(['م b', 'م c']);
    expect(filterRows(rows, { stage: 'م c' }).map((r) => r.id)).toEqual(['p']);
    expect(filterRows(rows, { stage: 'م b' }).map((r) => r.id)).toEqual(['p', 'q']);
  });
  it('الخبير: قائمة مشاركيه وملف المشارك من الدالتين نفسيهما', () => {
    expect(read('supabase/functions/leaders-api/file.ts')).toContain('const now = stageNow(st.journey);');
    const f = read('leaders-app/src/screens/ExpertFile.jsx');
    expect(f).toContain('const now = stageNow(d.journey);');
    expect(f).toContain('const shape = journeyBlocks(d.journey);');
  });
});
