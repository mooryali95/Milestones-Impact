// «التوجيه والإرشاد» (المرحلة G1): قاعدة التفعيل الواحدة، وسقوف المالك في الإعدادات العامة، وموضع اللوحة
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { GUIDANCE_READ_SECONDS, guidanceState } from '../../supabase/functions/leaders-api/guidance.js';
import { cleanGroup, DEFAULTS, resolveSettings, SETTINGS } from '../../supabase/functions/leaders-api/settings.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('guidanceState: من لم يبدأ لا يوجَّه بعد', () => {
  it('بلا قراءة ولا اختبار ولا مبادرة ولا نموذج: غير متاح', () => {
    expect(guidanceState({ read_seconds: 0, quizzes: 0, initiative: false, models: 0 })).toEqual({ ready: false, signals: [] });
    expect(guidanceState(null).ready).toBe(false);
  });
  it('قراءة أقل من الحد لا تكفي، وبلوغه يكفي', () => {
    expect(guidanceState({ read_seconds: GUIDANCE_READ_SECONDS - 1 }).ready).toBe(false);
    expect(guidanceState({ read_seconds: GUIDANCE_READ_SECONDS })).toEqual({ ready: true, signals: ['reading'] });
  });
  it('كل إشارة وحدها تكفي، وتُذكر كلها', () => {
    expect(guidanceState({ quizzes: 1 }).signals).toEqual(['quiz']);
    expect(guidanceState({ initiative: true }).signals).toEqual(['initiative']);
    expect(guidanceState({ models: 2 }).signals).toEqual(['model']);
    expect(guidanceState({ read_seconds: 999, quizzes: 3, initiative: true, models: 1 }).signals).toEqual(['reading', 'quiz', 'initiative', 'model']);
  });
});

describe('سقوف التوجيه في الإعدادات العامة', () => {
  it('افتراضيها قرار المالك: 5 دولارات يوميًا، 30 شهريًا، 8 يوميًا، 90 يومًا', () => {
    expect(DEFAULTS.guidance).toEqual({ enabled: false, daily_spend_usd: 5, monthly_questions: 30, daily_questions: 8, retention_days: 90 });
    expect(SETTINGS.guidance.super).toBe(true);
  });
  it('تعديل صالح يُقبل، وأسئلة اليوم لا تزيد على الشهر، والسالب مرفوض', () => {
    expect(cleanGroup('guidance', { daily_spend_usd: '7.5' }).value.daily_spend_usd).toBe(7.5);
    expect(cleanGroup('guidance', { daily_questions: 20, monthly_questions: 10 }).ok).toBe(false);
    expect(cleanGroup('guidance', { daily_spend_usd: -1 }).ok).toBe(false);
  });
  it('صف تالف في المخزن يعود إلى الافتراضي', () => {
    expect(resolveSettings([{ key: 'guidance', value: { daily_questions: 40, monthly_questions: 10 } }]).guidance).toEqual(DEFAULTS.guidance);
  });
  it('الخادم يحصر حفظ المجموعة المالية في المدير الأعلى والمالك، واللوحة كذلك', () => {
    expect(read('supabase/functions/leaders-api/settings.ts')).toMatch(/\.super && a\.role !== 'super_admin' && !a\.owner\) throw new Fail/);
    expect(read('admin-app/src/screens/AppSettings.jsx')).toMatch(/\(!SETTINGS\[g\]\.super \|\| isSuper\)/);
  });
});

describe('موضع اللوحة: مكان واحد للاستشارة وأسئلة الفريق', () => {
  it('الرحلة والمبادرة تعرضان اللوحة، والكتاب زرها، ولا استدعاء منفرد بعدها', () => {
    const journey = read('leaders-app/src/screens/Journey.jsx');
    expect(journey).toMatch(/<GuidancePanel guidance=\{me\.guidance\}/);
    expect(journey).not.toMatch(/<ChooseExpert|<PeerRequests/);
    expect(read('leaders-app/src/screens/Capstone.jsx')).toMatch(/<GuidancePanel guidance=\{me\.guidance\} context="capstone"/);
    expect(read('leaders-app/src/screens/Handbook.jsx')).toMatch(/<GuidanceButton guidance=\{me\.guidance\}/);
  });
  it('الخادم يرسل الحكم للمعتمد وحده ومن الرحلة نفسها', () => {
    const p = read('supabase/functions/leaders-api/participant.ts');
    expect(p).toMatch(/guidance: audience === 'participant' && approved \? await guidanceFor\(p\.id, !!initiative\)/);
  });
});
