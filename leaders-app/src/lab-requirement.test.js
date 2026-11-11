// المرحلة الثالثة من تصور خريطة العمليات (قرار المالك 2026-11-11): متطلب «أداة من المختبر» في الرحلة،
// والإتاحة بالمتطلب، وملخص المستشار، وتحليل البطاقات للإدارة، ومحرر الرحلة
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  activityFor, buildJourney, cleanConfig, completionSource, LAB_ACCEPT_AR, LAB_SPACED_DAYS, labStatus, VERIFIED_KINDS,
} from '../../supabase/functions/leaders-api/logic.js';
import { boardCardStats, gradeStep, labSummary, labVisible, MASTERY, validateLab } from '../../supabase/functions/leaders-api/lab.js';
import { ITEMS as MAP_ITEMS } from '../../scripts/lab/pm-map.mjs';
import { formToReq, KIND, reqFields, reqToForm } from '../../admin-app/src/methodology.js';

const read = (f) => readFileSync(f, 'utf8');
const SPEC = validateLab(MAP_ITEMS[0].spec);
const MAP_I = SPEC.steps.findIndex((s) => s.id === 'map');
const MAP = SPEC.steps[MAP_I];
const DAY = 864e5;

describe('حالة متطلب «أداة من المختبر»', () => {
  const labs = (x = {}) => ({ 'pm-process-map': { item_id: 'L1', title: 'خريطة', active: true, attempts: 0, best: null, first_at: null, last_at: null, ...x } });
  const c = { lab_key: 'pm-process-map', accept: 'mastery' };
  it('النوع موثق: يكتمل من دليله لا بنقرة', () => {
    expect(VERIFIED_KINDS).toContain('lab');
    expect(completionSource({ kind: 'lab' })).toBe('evidence');
    expect(read('supabase/functions/leaders-api/participant.ts')).toMatch(/if \(VERIFIED_KINDS\.includes\(r\.kind\)\) throw new Fail\('هذا النشاط يُوثَّق بإنجازه الفعلي لا بالتأشير'\)/);
  });
  it('الإتقان بعتبة 70% في أفضل محاولة (قرار المالك)', () => {
    expect(MASTERY).toBe(70);
    expect(labStatus(c, labs({ attempts: 2, best: 69 }))).toMatchObject({ type: 'lab', done: false, best: 69, mastery: 70, item_id: 'L1', accept: 'mastery' });
    expect(labStatus(c, labs({ attempts: 3, best: 70 })).done).toBe(true);
    expect(labStatus(c, labs()).done).toBe(false);
    // القبول غير المعروف يعود إلى الإتقان لا إلى ما هو أسهل
    expect(labStatus({ ...c, accept: 'anything' }, labs({ attempts: 1, best: 40 }))).toMatchObject({ done: false, accept: 'mastery' });
  });
  it('الإنهاء، ومحاولة الاسترجاع بعد أسبوعين على الأقل من الأولى', () => {
    expect(labStatus({ ...c, accept: 'finished' }, labs({ attempts: 1, best: 20 })).done).toBe(true);
    const t0 = Date.parse('2026-11-01T08:00:00Z');
    const at = (d) => new Date(t0 + d * DAY).toISOString();
    const spaced = { ...c, accept: 'spaced' };
    expect(LAB_SPACED_DAYS).toBe(14);
    expect(labStatus(spaced, labs({ attempts: 1, best: 90, first_at: at(0), last_at: at(0) })).done).toBe(false);
    expect(labStatus(spaced, labs({ attempts: 2, best: 90, first_at: at(0), last_at: at(10) })).done).toBe(false);
    expect(labStatus(spaced, labs({ attempts: 2, best: 50, first_at: at(0), last_at: at(14) })).done).toBe(true);
  });
  it('الأداة الغائبة أو الموقوفة لا تحبس المرحلة', () => {
    expect(labStatus(c, {})).toMatchObject({ done: true, na: true });
    expect(labStatus(c, labs({ active: false }))).toMatchObject({ done: true, na: true });
  });
  it('activityFor يوجّه النوع، والرحلة لا تكتمل مرحلتها قبل الإتقان', () => {
    const req = { id: 'r1', stage_key: 'training', kind: 'lab', required: true, sort: 1, config: c, dimension: 'milestone', level: null };
    expect(activityFor(req, { labs: labs({ attempts: 1, best: 80 }) }).done).toBe(true);
    const stages = [{ key: 'training', sort: 1 }, { key: 'ojt_coaching', sort: 2 }];
    const j = (best) => buildJourney({ stages, requirements: [req], progress: {}, levels: { milestone: 'beginner' }, state: {}, activity: { r1: activityFor(req, { labs: labs({ attempts: 1, best }) }) } });
    expect(j(62)[0]).toMatchObject({ status: 'active', done: 0, total: 1 });
    expect(j(62)[0].items[0].activity).toMatchObject({ best: 62, mastery: 70 });
    expect(j(75)[0].status).toBe('done');
  });
  it('cleanConfig: مفتاح أداة صالح، والقبول من محرر الرحلة أو المحفوظ', () => {
    expect(cleanConfig('lab', { lab_key: 'pm-process-map', lab_accept: 'spaced', accept: 'reviewed' })).toEqual({ lab_key: 'pm-process-map', accept: 'spaced' });
    expect(cleanConfig('lab', { lab_key: 'pm-process-map', accept: 'finished' })).toEqual({ lab_key: 'pm-process-map', accept: 'finished' });
    expect(cleanConfig('lab', { lab_key: 'pm-process-map', accept: 'reviewed' })).toEqual({ lab_key: 'pm-process-map', accept: 'mastery' });
    expect(() => cleanConfig('lab', { lab_key: '' })).toThrow(/اختر أداة المختبر/);
    expect(() => cleanConfig('lab', { lab_key: 'DROP TABLE' })).toThrow(/اختر أداة المختبر/);
  });
});

describe('المتطلب يفتح أداته لمن يخصه', () => {
  const items = [{ id: 'i1', key: 'pm-process-map', dimension: 'milestone', min_level: 'beginner', audience: 'granted', sort: 6 }, { id: 'i2', key: 'other', dimension: 'milestone', audience: 'granted', sort: 1 }];
  it('بلا منح ولا اعتماد مستوى: المطلوبة تظهر وحدها، والموقوفة لا', () => {
    expect(labVisible(items, { participantId: 'p' })).toEqual([]);
    expect(labVisible(items, { participantId: 'p', required: ['pm-process-map'] }).map((x) => x.id)).toEqual(['i1']);
    expect(labVisible([{ ...items[0], active: false }], { participantId: 'p', required: ['pm-process-map'] })).toEqual([]);
  });
  it('الخادم يقرأ متطلبات الرحلة التي تخص المشارك ويمررها، والدليل من محاولاته في الأداة', () => {
    const ts = read('supabase/functions/leaders-api/lab.ts');
    expect(ts).toMatch(/r\.kind === 'lab' && requirementApplies\(r, levels \|\| \{\}\)/);
    expect(ts).toMatch(/grants: must\(grants\) \?\? \[\], required \}/);
    const act = read('supabase/functions/leaders-api/activities.ts');
    expect(act).toMatch(/db\.from\('lab_items'\)\.select\('id, key, title_ar, active'\)\.in\('key', labKeys\)/);
    expect(act).toMatch(/db\.from\('lab_attempts'\)\.select\('item_id, pct, finished_at'\)\.eq\('participant_id', p\.id\)\.not\('finished_at', 'is', null\)/);
  });
});

describe('الترحيل: النوع والمتطلبان', () => {
  const sql = read('supabase/migrations/20261111120300_leaders_lab_requirement.sql');
  it('القيد يقبل lab مع الأنواع القائمة كلها', () => {
    expect(sql).toMatch(/'check','upload','form','meeting','reading','auto','video','workshop','coaching','curriculum','model','capstone','survey','lab'/);
  });
  it('إلزامي في التدريب لإطار المعلم بالإتقان، واختياري للاسترجاع في التوجيه', () => {
    expect(sql).toMatch(/'training', 'milestone', null, 'T-PMMAP'[\s\S]*?'lab', true, false, '\{"lab_key": "pm-process-map", "accept": "mastery"\}'/);
    expect(sql).toMatch(/'ojt_coaching', 'milestone', null, 'O-PMMAP'[\s\S]*?'lab', false, false, '\{"lab_key": "pm-process-map", "accept": "spaced"\}'/);
    expect((sql.match(/on conflict \(program_id, code\) do nothing;/g) || [])).toHaveLength(2);
    expect(sql.split('\n').slice(0, 15).join('\n')).toMatch(/^-- deploy-gate: tolerant /m);
    expect(sql).toContain("insert into leaders.schema_migrations (name) values ('20261111120300_leaders_lab_requirement') on conflict do nothing;");
  });
});

describe('المستشار والإدارة', () => {
  const ans = (over) => ({ ...Object.fromEntries(MAP.cards.map((c) => [c.id, [c.row, c.col]])), ...over });
  it('ملخص المشارك: أفضل نتيجة، والمحاولات، والتلميحات، وأكثر خلط بأسماء الأعمدة', () => {
    const r1 = gradeStep(MAP, ans({ 'p8-2': ['quality', 'mc'], 'p10-2': ['comm', 'mc'] }), { level: 'advanced' });
    const s = labSummary([
      { pct: 55, finished_at: '2026-11-02', results: { [MAP_I]: r1 }, hints: { [MAP_I]: { 'p5-5': 2 } } },
      { pct: 82, finished_at: '2026-11-20', results: { [MAP_I]: gradeStep(MAP, ans({ 'p8-2': ['quality', 'mc'] }), { level: 'advanced' }) }, hints: {} },
      { pct: null, finished_at: null, results: {} },
    ], SPEC);
    expect(s).toMatchObject({ attempts: 2, first: 55, best: 82, hints: 2 });
    expect(s.mix).toEqual({ expected: 'exec', chosen: 'mc', n: 3, expected_ar: 'التنفيذ', chosen_ar: 'المتابعة والتحكم' });
    expect(labSummary([])).toEqual({ attempts: 0, first: null, best: null, hints: 0, mix: null });
  });
  it('تحليل البطاقات: نسبة الصواب، وأكثر خانة خاطئة، ومتوسط التلميح، والمكشوفة ليست صوابًا', () => {
    const rows = [
      { answers: { [MAP_I]: ans({ 'p8-2': ['quality', 'mc'] }) }, hints: { [MAP_I]: { 'p8-2': 1 } } },
      { answers: { [MAP_I]: ans({ 'p8-2': ['quality', 'mc'] }) }, hints: {} },
      { answers: { [MAP_I]: ans({}) }, hints: { [MAP_I]: { 'p8-2': 4 } } },
      { answers: {} },
    ];
    const st = boardCardStats(MAP, MAP_I, rows);
    const q = st.find((c) => c.id === 'p8-2');
    expect(q).toMatchObject({ n: 3, right_pct: 0, top_wrong: { row: 'quality', col: 'mc', n: 2 }, avg_hint: 1.7 });
    expect(st.find((c) => c.id === 'p4-1')).toMatchObject({ n: 3, right_pct: 100, top_wrong: null });
  });
  it('الخادم: ملف المشارك يحمل سطر المختبر، والمعاينة والتحليل مسجلان، والتحليل بلا العرض والاختبار', () => {
    const admin = read('supabase/functions/leaders-api/admin.ts');
    expect(admin).toMatch(/points: pts, book: book \|\| \[\], models: subs \|\| \[\], labs,/);
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toContain("'admin.lab-preview': (_a, b) => L.adminPreview(b),");
    expect(idx).toContain("'admin.lab-cards': (_a, b) => L.adminCards(b),");
    const ts = read('supabase/functions/leaders-api/lab.ts');
    expect(ts).toMatch(/\.eq\('participants\.is_demo', false\)\.eq\('participants\.is_test', false\)/);
    expect(ts).toMatch(/publicSpec\(it\.spec, \(list: any\[\]\) => list, level\)/);
  });
});

describe('محرر الرحلة: نوع «أداة من المختبر»', () => {
  const labs = [{ key: 'pm-process-map', title_ar: 'خريطة عمليات إدارة المشاريع', active: true }];
  it('النوع واختيار الأداة والقبول يظهران للنوع وحده', () => {
    expect(KIND.lab).toBe('أداة من المختبر');
    const f = reqFields([], [], labs);
    const key = f.find((x) => x.name === 'cfg_lab_key');
    const acc = f.find((x) => x.name === 'cfg_lab_accept');
    expect(key.options).toEqual({ 'pm-process-map': 'خريطة عمليات إدارة المشاريع' });
    expect(acc.options).toEqual(LAB_ACCEPT_AR);
    expect(key.show({ kind: 'lab' })).toBe(true);
    expect(key.show({ kind: 'model' })).toBe(false);
    expect(f.find((x) => x.name === 'needs_review').show({ kind: 'lab' })).toBe(false);
  });
  it('المحفوظ يعود إلى النموذج ويُحفظ كما هو، ولا يخلطه قبول النموذج التعليمي', () => {
    const r = { kind: 'lab', config: { lab_key: 'pm-process-map', accept: 'spaced' } };
    const v = reqToForm(r);
    expect(v.cfg_lab_accept).toBe('spaced');
    expect(v.cfg_accept).toBe('spaced');
    const back = formToReq({ ...v, cfg_accept: 'reviewed' });
    expect(cleanConfig('lab', back.config)).toEqual({ lab_key: 'pm-process-map', accept: 'spaced' });
    expect(reqToForm({ kind: 'lab', config: { lab_key: 'pm-process-map' } }).cfg_lab_accept).toBe('mastery');
  });
});
