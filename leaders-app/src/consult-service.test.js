// «الاستشارة خدمة» (تصور البرامج والرحلة 2026-11-24 v1، المرحلة 2): شرط الإتاحة unlock:'any' (بدأ القراءة أو أنهى التدريب)،
// والفتح لا رجعة فيه، والفتح اليدوي الاستثنائي، وبطاقة الخدمة عند المشارك، والنسخ القديمة بلا أي فرق.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = join(process.cwd());
import {
  anyAr, cleanStageRules, CONSULT_ANY_DEFAULT, READING_STARTED_SECONDS, READING_STARTED_WORDS, readingStarted, resolveStages, serviceAvailAr,
  stageRuleSummary, stageRules, stageRulesIssues,
} from '../../supabase/functions/leaders-api/journey.js';
import { journeyProgress, coachingStatus } from '../../supabase/functions/leaders-api/logic.js';
import { positionOf, currentStages, journeyBlocks } from '../../supabase/functions/leaders-api/journey-map.js';
import { formToStage, stageFields, stageToForm } from '../../admin-app/src/methodology.js';
import { anyService, serviceLineAr } from './screens/Journey.jsx';
import { REQS, STAGES } from './journey-legacy.cases.js';

const RULES = { lane: 'service', mode: 'on_demand', unlock: 'any', any: CONSULT_ANY_DEFAULT.map((c) => ({ ...c })) };
const SVC = STAGES.map((s) => (s.key === 'consulting' ? { ...s, title_ar: 'الاستشارة', rules: RULES } : s.key === 'training' ? { ...s, title_ar: 'التدريب' } : s));
const item = (id, status, extra = {}) => ({ id, code: id.toUpperCase(), title_ar: `بند ${id}`, required: true, status, ...extra });
const journeyOf = (stages, done, { overrides = { approval: 'complete' }, signals, activity = {} } = {}) => resolveStages([...stages].sort((a, b) => a.sort - b.sort).map((s) => {
  const items = REQS.filter((r) => r.stage_key === s.key).map((r) => ({ ...item(r.id, done.has(r.id) ? 'done' : 'pending', activity[r.id] ? { activity: activity[r.id] } : {}), required: r.required }));
  return { ...s, items, done: items.filter((i) => i.status === 'done').length, total: items.length };
}), { overrides, cohortStart: '2026-11-04', today: '2026-12-15', detail: true, ...(signals ? { signals } : {}) });
const PRE = new Set(['p-info', 'a-done']);
const TRAINED = new Set([...PRE, 't-att', 't-hb']);
const consult = (j) => j.find((s) => s.key === 'consulting');

describe('القاعدة: unlock:any للخدمة وحدها، بشروط مسماة', () => {
  it('تُحفظ للخدمة، وتُرفض لغيرها أو بلا شروط أو بمرجع غير موجود أو خدمة', () => {
    expect(cleanStageRules(RULES, SVC, 'consulting')).toEqual({ mode: 'on_demand', unlock: 'any', any: [{ type: 'reading_started' }, { type: 'stage_done', stage: 'training' }], lane: 'service' });
    const bad = (r, key = 'consulting') => { try { cleanStageRules(r, SVC, key); return null; } catch (e) { return e.message; } };
    expect(bad({ unlock: 'any', any: [{ type: 'reading_started' }] }, 'support')).toContain('للخدمة وحدها');
    expect(bad({ lane: 'service', unlock: 'any', any: [] })).toContain('شرطًا واحدًا');
    expect(bad({ lane: 'service', unlock: 'any', any: [{ type: 'magic' }] })).toContain('غير معروف');
    expect(bad({ lane: 'service', unlock: 'any', any: [{ type: 'stage_done', stage: 'nope' }] })).toContain('غير موجودة');
    expect(bad({ lane: 'service', unlock: 'any', any: [{ type: 'stage_done', stage: 'consulting' }] })).toContain('نفسها');
  });
  it('الفحص: الافتراضي نظيف، و«أي من» فارغ خطأ', () => {
    expect(stageRulesIssues(SVC).filter((x) => x.level === 'error')).toEqual([]);
    const empty = SVC.map((s) => (s.key === 'consulting' ? { ...s, rules: { ...RULES, any: [] } } : s));
    expect(stageRulesIssues(empty).find((x) => x.stage === 'consulting')).toMatchObject({ level: 'error', rule: 'unlock' });
    const gone = SVC.map((s) => (s.key === 'consulting' ? { ...s, rules: { ...RULES, any: [{ type: 'stage_done', stage: 'ghost' }] } } : s));
    expect(stageRulesIssues(gone).some((x) => x.stage === 'consulting' && x.level === 'error')).toBe(true);
  });
  it('الجمل للأدمن والمشارك من مصدر واحد', () => {
    const t = (k) => SVC.find((s) => s.key === k)?.title_ar || k;
    expect(anyAr(RULES.any, t)).toBe('حين تبدأ قراءة كتابك الأول أو تنهي «التدريب»');
    expect(serviceAvailAr(SVC.find((s) => s.key === 'consulting'), t)).toBe('تُتاح حين تبدأ قراءة كتابك الأول أو تنهي «التدريب» حتى نهاية الرحلة');
    expect(stageRuleSummary(SVC.find((s) => s.key === 'consulting'), SVC)).toContain('تُتاح حين تبدأ قراءة');
  });
  it('عتبة «بدأ القراءة»: 60 ثانية فعلية أو 200 كلمة', () => {
    expect([READING_STARTED_SECONDS, READING_STARTED_WORDS]).toEqual([60, 200]);
    expect(readingStarted({ active_seconds: 30, words: 50 })).toBe(false);
    expect(readingStarted({ active_seconds: 60, words: 0 })).toBe(true);
    expect(readingStarted({ active_seconds: 5, words: 200 })).toBe(true);
    expect(readingStarted(null)).toBe(false);
  });
});

describe('الفتح عند المشارك', () => {
  it('لا قراءة ولا تدريب: مقفلة بسطر الشرط', () => {
    const c = consult(journeyOf(SVC, PRE, { signals: { readingStarted: false, unlocked: new Set() } }));
    expect(c.status).toBe('locked');
    expect(c.lock_reason).toBe('تُتاح حين تبدأ قراءة كتابك الأول أو تنهي «التدريب»');
    expect(c.lock).toMatchObject({ unlock: 'any' });
  });
  it('قراءة 30 ثانية لا تفتح، و60 ثانية تفتح', () => {
    const sig = (r) => ({ readingStarted: readingStarted(r), unlocked: new Set() });
    expect(consult(journeyOf(SVC, PRE, { signals: sig({ active_seconds: 30 }) })).status).toBe('locked');
    expect(consult(journeyOf(SVC, PRE, { signals: sig({ active_seconds: 60 }) })).status).toBe('available');
  });
  it('تدريب مكتمل بلا قراءة: مفتوحة', () => {
    expect(consult(journeyOf(SVC, TRAINED, { signals: { readingStarted: false, unlocked: new Set() } })).status).toBe('available');
    // وبلا إشارات أصلًا (معاينة) يُحسب شرط التدريب وحده
    expect(consult(journeyOf(SVC, TRAINED)).status).toBe('available');
  });
  it('التدريب بعد الخدمة في الترتيب يُحسم بعد المرور', () => {
    const late = SVC.map((s) => (s.key === 'consulting' ? { ...s, sort: 3.5 } : s));
    expect(consult(journeyOf(late, TRAINED)).status).toBe('available');
    expect(consult(journeyOf(late, PRE)).status).toBe('locked');
  });
  it('لا رجعة: فُتحت ثم حُذف تقدم القراءة، تبقى مفتوحة', () => {
    expect(consult(journeyOf(SVC, PRE, { signals: { readingStarted: false, unlocked: new Set(['consulting']) } })).status).toBe('available');
  });
  it('الفتح اليدوي الاستثنائي (تدخل الأدمن open)', () => {
    expect(consult(journeyOf(SVC, PRE, { overrides: { approval: 'complete', consulting: 'open' }, signals: { readingStarted: false, unlocked: new Set() } })).status).toBe('available');
  });
  it('خارج الموضع والنسبة والمرحلة الحالية', () => {
    const sig = { readingStarted: true, unlocked: new Set() };
    const j = journeyOf(SVC, PRE, { signals: sig });
    const base = journeyOf(STAGES.filter((s) => s.key !== 'consulting'), PRE);
    expect(journeyProgress(j)).toBe(journeyProgress(base));
    expect(j[positionOf(j)].key).toBe(base[positionOf(base)].key);
    expect(currentStages(j).stages.map((s) => s.key)).not.toContain('consulting');
    expect(journeyBlocks(j).services.map((s) => s.key)).toEqual(['consulting']);
  });
});

describe('بطاقة الخدمة عند المشارك', () => {
  const st = (status, act, extra = {}) => ({ key: 'consulting', status, rules: RULES, lock_reason: 'تُتاح حين تبدأ قراءة كتابك الأول أو تنهي «التدريب»', items: act ? [{ id: 'c', activity: act }] : [], ...extra });
  const s = (status) => ({ id: status + Math.random(), status, starts_at: '2026-12-01T09:00:00Z', ends_at: '2026-12-01T10:00:00Z' });
  it('قبل الفتح: سطر الشرط', () => {
    expect(anyService(st('locked'))).toBe(true);
    expect(serviceLineAr(st('locked'))).toBe('تُتاح حين تبدأ قراءة كتابك الأول أو تنهي «التدريب»');
  });
  it('بعد الفتح: متاحة لك · بقي لك N', () => {
    expect(serviceLineAr(st('available', coachingStatus({ sessions_required: 1, max_sessions: 2 }, [])))).toBe('متاحة لك · بقي لك جلستان');
    expect(serviceLineAr(st('available', coachingStatus({ sessions_required: 1, max_sessions: 3 }, [s('attended')])))).toBe('متاحة لك · بقي لك جلستان');
    expect(serviceLineAr(st('available', coachingStatus({ sessions_required: 1, max_sessions: 2 }, [s('attended'), s('booked')])))).toBe('حجزت كل جلساتك المتاحة (جلستان)');
    expect(serviceLineAr(st('available', null))).toBe('متاحة لك');
  });
  it('الخدمة بشرط قديم: السطر كما كان حرفًا', () => {
    expect(serviceLineAr({ status: 'available', rules: { lane: 'service', unlock: 'stages', after: ['approval'] }, items: [] })).toBe('متاحة لك حتى نهاية رحلتك');
  });
  it('الأزرار: «ابدأ القراءة» قبل الفتح، و«اطلب استشارة» بعده', () => {
    const src = readFileSync(join(root, 'leaders-app/src/screens/Journey.jsx'), 'utf8');
    expect(src).toContain('data-testid="svc-read"');
    expect(src).toContain('>ابدأ القراءة<');
    expect(src).toContain('>اطلب استشارة<');
  });
});

describe('المحرر: «متى تُتاح» بشروط مسماة', () => {
  it('ذهاب وإياب بلا فقد، والافتراضي حين لا يختار شيئًا', () => {
    const st = SVC.find((s) => s.key === 'consulting');
    const f = stageToForm(st);
    expect(f.rule_unlock).toBe('any');
    expect(f.rule_any).toEqual(['reading_started', 'stage:training']);
    expect(formToStage(f).rules).toMatchObject({ lane: 'service', unlock: 'any', any: RULES.any });
    expect(formToStage({ ...f, rule_any: [] }).rules.any).toEqual(RULES.any);
    expect(formToStage({ ...f, rule_any: ['reading_started'] }).rules.any).toEqual([{ type: 'reading_started' }]);
  });
  it('خيار «أي من» للخدمة وحدها', () => {
    const unlock = stageFields([], SVC, 'support').find((x) => x.name === 'rule_unlock');
    expect(Object.keys(unlock.options({ rule_lane: 'stage' }))).not.toContain('any');
    expect(Object.keys(unlock.options({ rule_lane: 'service' }))).toContain('any');
    const any = stageFields([], SVC, 'consulting').find((x) => x.name === 'rule_any');
    expect(any.show({ rule_lane: 'service', rule_unlock: 'any' })).toBe(true);
    expect(Object.keys(any.options)).toEqual(expect.arrayContaining(['reading_started', 'stage:training']));
    expect(Object.keys(any.options)).not.toContain('stage:consulting');
  });
});

describe('انحدار: النسخ القديمة بلا أي فرق', () => {
  it('stageRules لكل قاعدة قديمة بلا مفتاح any', () => {
    for (const s of STAGES) expect(stageRules(s)).not.toHaveProperty('any');
    expect(stageRules({ rules: { lane: 'service', unlock: 'stages', after: ['approval'] } })).not.toHaveProperty('any');
  });
  it('الإشارات لا تغير رحلة نسخة بلا any حرفًا', () => {
    for (const done of [PRE, TRAINED, new Set([...TRAINED, 'o-mreg', 'o-breg', 'c-meet'])]) {
      expect(journeyOf(STAGES, done, { signals: { readingStarted: true, unlocked: new Set(['consulting']) } })).toEqual(journeyOf(STAGES, done));
    }
  });
});

describe('الترحيل والتقرير', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261128150000_leaders_consult_service.sql'), 'utf8');
  it('يمس المسودة وحدها: لا program_versions ولا cohorts', () => {
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/update\s+leaders\.program_versions/i);
    expect(code).not.toMatch(/update\s+leaders\.cohorts/i);
    expect(sql).toMatch(/^-- restore: /m);
    expect(sql).toMatch(/^-- deploy-gate: tolerant/m);
    expect(sql).toContain("'unlock', 'any'");
  });
  it('التقرير قراءة فقط', () => {
    const rep = readFileSync(join(root, 'scripts/db/verify-consult-programs.sql'), 'utf8');
    const code = rep.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/\b(update|insert|delete|alter|drop|create)\b/i);
  });
});
