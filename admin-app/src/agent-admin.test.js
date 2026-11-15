// شاشة المساعد الآلي: صياغة المال والنسب، وحكم الحلقة، وخلاصة كل قسم، وخريطة أخطاء المفتاح، وحلقة التقييم من المتصفح.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convSummary, enableBlock, gateText, KEY_ERROR_AR, keyLooksValid, keyMessage, keySummary, ringLevel, runEvalLoop, runSummary, spendSummary, stateSummary, usd, usd2 } from './agent-admin.js';
import { companionKnown } from './screens/OrgForm.jsx';
import { OWNER_TABS, TABS } from './leaders-tabs.js';

describe('المال والنسب', () => {
  it('الميكرو إلى دولار: أربعة أرقام دون الدولار، واثنان فوقه، وغير المقروء لا يصير صفرًا', () => {
    expect(usd(1100)).toBe('0.0011 دولار');
    expect(usd(2_500_000)).toBe('2.50 دولار');
    expect(usd(0)).toBe('0.00 دولار');
    expect(usd(null)).toBe('غير مقروء');
    expect(usd2(420_000)).toBe('0.42');
  });
  it('الحلقة: 79.9% أخضر، و80% كهرماني، و100% أحمر، والرمز والكلمة مع كل حال', () => {
    expect(ringLevel(1_598_000, 2_000_000)).toMatchObject({ level: 'green', icon: '✓' });
    expect(ringLevel(1_600_000, 2_000_000)).toMatchObject({ level: 'amber', icon: '!', word: 'قريب من السقف' });
    expect(ringLevel(2_000_000, 2_000_000)).toMatchObject({ level: 'red', icon: '✕', ratio: 1 });
    expect(spendSummary({ today: { spent_micros: 420_000, cap_micros: 2_000_000 } }).text).toBe('اليوم 0.42 من 2.00 دولار (21%)');
  });
});

describe('خلاصة الأقسام', () => {
  const base = { effective: false, reason: 'db_off', can_write: true, env_mode: 'allow', known_model: true, model: 'claude-haiku-5-5', key: { source: 'env' }, gate: { ok: false, reason: 'none' } };
  it('الحالة بكلمتها لكل سبب', () => {
    expect(stateSummary({ ...base, effective: true }).text).toBe('مفعّل ويرد الآن');
    expect(stateSummary(base).text).toBe('مطفأ من اللوحة');
    expect(stateSummary({ ...base, reason: 'env_off' })).toEqual({ level: 'red', text: 'مطفأ بمفتاح الطوارئ في الخادم' });
    expect(stateSummary({ ...base, reason: 'stale' }).text).toBe('مطفأ: تغير الإعداد بعد آخر تقييم');
  });
  it('سبب تعطيل التفعيل بالترتيب، والبوابة المفتوحة تسمح', () => {
    expect(enableBlock(base)).toBe('شغّل التقييم أولًا');
    expect(enableBlock({ ...base, can_write: false })).toMatch(/للمدير الأعلى/);
    expect(enableBlock({ ...base, env_mode: 'off' })).toMatch(/off/);
    expect(enableBlock({ ...base, key: { source: null } })).toMatch(/لا مفتاح/);
    expect(enableBlock({ ...base, gate: { ok: true } })).toBe(null);
    expect(gateText(base).text).toBe('لا تقييم ناجح لهذا الإعداد: شغّل التقييم أولًا');
    expect(gateText({ gate: { ok: true, run: { eval_pass: 40, eval_total: 42, redteam_pass: 21, redteam_total: 21, finished_at: 'x' } } }, () => 'قبل ساعتين').text)
      .toBe('آخر تقييم ناجح لهذا الإعداد: eval 95.2% وredteam 100%، قبل ساعتين');
  });
  it('المفتاح والمحادثات والتقييم', () => {
    expect(keySummary({ source: 'db', last4: 'abcd' }).text).toBe('من اللوحة (••••abcd)');
    expect(keySummary({ source: 'env', env_last4: 'wxyz', ok_at: '2026-11-15T10:00:00Z', error_at: '2026-11-15T11:00:00Z', error: 'http_401' })).toEqual({ level: 'amber', text: 'سر الخادم ANTHROPIC_API_KEY (••••wxyz)، وآخر استدعاء: رفضت Anthropic المفتاح' });
    expect(keySummary({ source: null }).level).toBe('red');
    expect(convSummary({ total: 128, contacts: 9 }).text).toBe('128 محادثة في المدة، منها 9 طلبت التواصل');
    expect(runSummary(null).text).toBe('لم يُشغَّل التقييم بعد');
    expect(runSummary({ status: 'passed', eval_pass: 39, eval_total: 42, redteam_pass: 21, redteam_total: 21, cost_micros: 70_000 }).text)
      .toBe('آخر تشغيل: ناجح، eval 92.9% (39/42) وredteam 100% (21/21)، 0.07 دولار');
  });
  it('خريطة أخطاء المفتاح تغطي كل رمز يقبله القيد في القاعدة', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261115200000_leaders_agent_admin.sql'), 'utf8');
    const codes = sql.match(/key_error text check \(key_error in \(([^)]+)\)\)/)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
    for (const c of codes) expect(KEY_ERROR_AR[c], c).toBeTruthy();
    expect(keyMessage({ code: 'key_rejected' })).toMatch(/رفضت Anthropic/);
    expect(keyMessage({ code: 'other', message: 'نص الخادم' })).toBe('نص الخادم');
    expect(keyLooksValid(' sk-ant-api03-abcdefghijklmnopqrstu ')).toBe(true);
    expect(keyLooksValid('sk-test')).toBe(false);
  });
});

describe('حلقة التقييم', () => {
  const noWait = { wait: async () => {} };
  it('تتوقف عند done وتمرر التقدم', async () => {
    const seen = [];
    const steps = [{ success: true, done: false, done_cases: 6 }, { success: true, done: false, done_cases: 12 }, { success: true, done: true, done_cases: 15, status: 'passed' }];
    const out = await runEvalLoop(async () => steps.shift(), 'r', (p) => seen.push(p.done_cases), null, noWait);
    expect(out.done).toBe(true);
    expect(seen).toEqual([6, 12, 15]);
  });
  it('تنتظر وتعيد بعد busy، وتتوقف عند الإيقاف، ولا تتجاوز حد الطلبات', async () => {
    let n = 0;
    const out = await runEvalLoop(async () => (++n === 1 ? { success: false, code: 'busy' } : { success: true, done: true }), 'r', () => {}, null, noWait);
    expect([out.done, n]).toEqual([true, 2]);
    const ac = new AbortController();
    let m = 0;
    const stopped = await runEvalLoop(async () => { m++; ac.abort(); return { success: true, done: false }; }, 'r', () => {}, ac.signal, noWait);
    expect([stopped.stopped, m]).toEqual([true, 1]);
    let k = 0;
    const capped = await runEvalLoop(async () => { k++; return { success: true, done: false }; }, 'r', () => {}, null, { ...noWait, maxRequests: 5 });
    expect([capped.code, k]).toEqual(['max_requests', 5]);
    const failed = await runEvalLoop(async () => ({ success: false, code: 'daily_cap', message: 'لا يتسع' }), 'r', () => {}, null, noWait);
    expect(failed.error).toBe('لا يتسع');
  });
});

describe('مفتاح المرافق في نموذج الجهة وتبويب المساعد', () => {
  it('لا يُرسل الحقل قبل الترحيل، ويُرسل حين يظهر في صف الجهة أو في أي جهة', () => {
    expect(companionKnown({ id: 'o', name: 'x' })).toBe(false);
    expect(companionKnown({ id: 'o', companion_allowed: true })).toBe(true);
    expect(companionKnown(null, false)).toBe(false);
    expect(companionKnown(null, true)).toBe(true);
  });
  it('تبويب المساعد في الأقسام، ومقصور على المدير الأعلى والمالك', () => {
    expect(TABS.find(([k]) => k === 'agent')?.[1]).toBe('المساعد الآلي');
    expect(OWNER_TABS.has('agent')).toBe(true);
    const src = readFileSync(join(__dirname, 'screens/Leaders.jsx'), 'utf8');
    expect(src).toMatch(/\['البرامج', \['programs', 'orgs', 'tracks', 'levels', 'settings', 'agent'\]\]/);
  });
  it('لا شرطة طويلة ولا متوسطة في الملفات الجديدة', () => {
    const files = ['agent-admin.js', 'agent-admin.css', 'screens/Agent.jsx', '../../supabase/functions/leaders-api/agent-admin.ts', '../../supabase/functions/agent-chat/runtime.ts',
      '../../supabase/functions/agent-chat/version.ts', '../../supabase/functions/agent-chat/evals/runner.ts', '../../supabase/functions/admin-api/step_up.ts', '../../supabase/migrations/20261115200000_leaders_agent_admin.sql'];
    for (const f of files) expect(/[\u2013\u2014]/.test(readFileSync(join(__dirname, f), 'utf8')), f).toBe(false);
  });
});
