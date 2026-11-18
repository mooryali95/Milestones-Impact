// حراس سلامة الإصدار (تصور تحديث المنصة بلا أثر على المستخدمين، المرحلة 0 جزء الكود والمرحلة 2):
// قاعدة الدخان ش6، ونافذة النشر والتجميد ش13، وحارس التراجع الآلي بعد ترحيل حاجب، وحارس الفحوص الليلية ش11،
// وقراءة كاتون بكل إصداراته، وأن ملفات السير تطابق هذا كله.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// js-yaml من اعتماديات eslint (مرفوعة في node_modules)، لقراءة ملفات السير كما يقرؤها GitHub
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { evaluate, inWindow, parseCalendar, parseWindow, riyadh } from './deploy-window.mjs';
import { FUNCTIONS, MODES, judge, probeRequest, runSmoke, verdict } from './smoke.mjs';
import { rollbackSafety } from './rollback-guard.mjs';
import { watch } from './nightly-watch.mjs';
import { diffContent, katonVersions, repoContent } from '../content/live.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const seq = (s) => [...s].map((c) => c === '1');

describe('قاعدة الدخان ش6', () => {
  const rule = MODES.deploy;
  it('فشل عابر واحد أو اثنان في عشر محاولات لا يُسقط النشر', () => {
    expect(verdict(seq('0111111111'), rule)).toBe('pass');
    expect(verdict(seq('1101111011'), rule)).toBe('pass');
    expect(verdict(seq('01'), rule)).toBe('pending');
  });
  it('ثلاثة إخفاقات متتالية تُسقطه فورًا، وأكثر من 20% من عشر تُسقطه ولو تفرقت', () => {
    expect(verdict(seq('000'), rule)).toBe('fail');
    expect(verdict(seq('1111000'), rule)).toBe('fail');
    expect(verdict(seq('0101101'), rule)).toBe('fail');   // ثلاثة متفرقة = 30%
    expect(verdict(seq('0101111111'), rule)).toBe('pass');   // اثنان = 20%، ليس أكثر
  });
  it('وضع check (بلا نشر): أول نجاح يكفي، وثلاثة متتالية وحدها تُفشل', () => {
    expect(verdict(seq('1'), MODES.check)).toBe('pass');
    expect(verdict(seq('001'), MODES.check)).toBe('pass');
    expect(verdict(seq('00'), MODES.check)).toBe('pending');
    expect(verdict(seq('000'), MODES.check)).toBe('fail');
  });
  it('الحكم على الرد: 200 وsuccess: true وحدهما نجاح', () => {
    expect(judge(200, '{"success":true,"db_ms":12}')).toEqual({ ok: true, note: 'db_ms 12' });
    expect(judge(503, '{"code":"BOOT_ERROR","message":"Worker failed to boot"}').ok).toBe(false);
    expect(judge(200, '<html>').ok).toBe(false);
    expect(judge(200, '{"success":false}').ok).toBe(false);
  });
  it('الجولات: عابر يُعاد فحصه وينجح، والمستمر يوقف الدخان مبكرًا', async () => {
    const plan = { 'leaders-api': seq('0111111111'), 'send-otp': seq('1100011111') };
    const calls = {};
    const probe = async (fn) => { const i = (calls[fn.name] = (calls[fn.name] || 0) + 1) - 1; return { ok: plan[fn.name]?.[i] ?? true, note: 'x' }; };
    const res = await runSmoke({ functions: FUNCTIONS, rule, probe, sleep: async () => {} });
    expect(res.ok).toBe(false);
    expect(res.rows.find((r) => r.name === 'send-otp')).toMatchObject({ verdict: 'fail', tries: 5 });
    expect(calls['leaders-api']).toBe(5);   // توقف الجميع عند الجولة الخامسة، لا عشر جولات
    const ok = await runSmoke({ functions: FUNCTIONS, rule, probe: async () => ({ ok: true, note: '' }), sleep: async () => {} });
    expect(ok.ok).toBe(true);
    expect(ok.rows.every((r) => r.tries === 10 && r.verdict === 'pass')).toBe(true);
  });
  it('عشر محاولات بفاصل 12 ثانية: نحو دقيقتين', () => {
    expect(rule.attempts).toBe(10);
    expect(((rule.attempts - 1) * rule.intervalMs) / 1000).toBeGreaterThanOrEqual(100);
    expect(((rule.attempts - 1) * rule.intervalMs) / 1000).toBeLessThanOrEqual(130);
  });
  it('طلب المسبار: الخطافان بـGET، والبقية بإجرائها، والمنطقة نفسها', () => {
    const get = probeRequest(FUNCTIONS.find((f) => f.name === 'creem-webhook'));
    expect(get.init.method).toBe('GET');
    expect(get.url).toBe('https://eormhcupwgwpllhrfxxg.supabase.co/functions/v1/creem-webhook?forceFunctionRegion=ap-south-1');
    const post = probeRequest(FUNCTIONS.find((f) => f.name === 'send-otp'), { anon: 'k' });
    expect(JSON.parse(post.init.body)).toEqual({ action: 'ping' });
    expect(post.init.headers.apikey).toBe('k');
  });
});

describe('نافذة النشر والتجميد ش13', () => {
  const at = (iso) => new Date(iso);
  it('توقيت الرياض UTC+3', () => {
    expect(riyadh(at('2026-11-18T21:30:00Z'))).toMatchObject({ date: '2026-11-19', hhmm: '00:30' });
  });
  it('بلا نافذة ولا تقويم: النشر في أي وقت كما كان', () => {
    expect(evaluate({ now: at('2026-11-18T12:00:00Z') })).toMatchObject({ deploy: true, code: 'open' });
  });
  it('النافذة تعبر منتصف الليل، وعدة نوافذ بفاصلة', () => {
    const w = parseWindow('23:00-05:00,13:00-14:00');
    expect(inWindow(w, 23 * 60 + 30)).toBe(true);
    expect(inWindow(w, 4 * 60 + 59)).toBe(true);
    expect(inWindow(w, 5 * 60)).toBe(false);
    expect(inWindow(w, 13 * 60 + 15)).toBe(true);
    expect(evaluate({ window: '23:00-05:00', now: at('2026-11-18T09:00:00Z') })).toMatchObject({ deploy: false, code: 'outside_window' });   // 12:00 الرياض
    expect(evaluate({ window: '23:00-05:00', now: at('2026-11-18T21:00:00Z') })).toMatchObject({ deploy: true, code: 'open' });   // 00:00 الرياض
  });
  it('صيغة نافذة خاطئة ترمي خطأ يسمّيها ولا تُفسَّر صامتة', () => {
    for (const bad of ['23-05', '25:00-01:00', '10:00', '10:00-10:00', '01:00-02:00-03:00']) expect(() => parseWindow(bad), bad).toThrow(/DEPLOY_WINDOW/);
  });
  it('يوم الورشة يجمّد يومه واليوم السابق بتوقيت الرياض، والفترة شاملة الطرفين', () => {
    const calendar = { workshops: [{ date: '2026-12-03', note: 'الدفعة الأولى' }], freezes: [{ from: '2026-12-20', to: '2026-12-22' }] };
    expect(evaluate({ calendar, now: at('2026-12-01T20:59:00Z') }).deploy).toBe(true);   // 23:59 الرياض في 1 ديسمبر
    expect(evaluate({ calendar, now: at('2026-12-01T21:00:00Z') })).toMatchObject({ deploy: false, code: 'frozen' });   // 00:00 في 2 ديسمبر
    expect(evaluate({ calendar, now: at('2026-12-03T20:59:00Z') }).deploy).toBe(false);
    expect(evaluate({ calendar, now: at('2026-12-03T21:00:00Z') }).deploy).toBe(true);   // 4 ديسمبر
    expect(evaluate({ calendar, now: at('2026-12-22T12:00:00Z') }).deploy).toBe(false);
    expect(evaluate({ calendar, now: at('2026-12-23T12:00:00Z') }).deploy).toBe(true);
  });
  it('الإصلاح العاجل يتجاوز النافذة والتجميد', () => {
    const calendar = { workshops: [{ date: '2026-12-03' }] };
    expect(evaluate({ window: '23:00-05:00', calendar, now: at('2026-12-03T09:00:00Z'), urgent: true })).toMatchObject({ deploy: true, code: 'urgent' });
  });
  it('تقويم خاطئ يُرفض بموضعه', () => {
    expect(() => parseCalendar({ workshops: [{ date: '2026-13-01' }] })).toThrow(/workshops\[0\]/);
    expect(() => parseCalendar({ freezes: [{ from: '2026-12-05', to: '2026-12-01' }] })).toThrow(/نهايته قبل بدايته/);
    expect(() => parseCalendar([])).toThrow();
  });
  it('تقويم المستودع صالح، وفارغ حتى يحرره المالك فلا يتغير النشر', () => {
    const cal = JSON.parse(read('docs/ops/deploy-freeze.json'));
    expect(() => parseCalendar(cal)).not.toThrow();
  });
});

describe('التراجع الآلي بعد ترحيل حاجب', () => {
  it('ترحيل حاجب جديد يمنع التراجع الآلي، والمتسامح والمؤجل لا يمنعانه', () => {
    expect(rollbackSafety([]).auto).toBe(true);
    expect(rollbackSafety([{ name: 'a', sql: '-- x\n-- deploy-gate: tolerant\nalter table t add column c int;' }, { name: 'b', sql: '-- deploy-gate: deferred بقرار\n' }]).auto).toBe(true);
    const r = rollbackSafety([{ name: '20991231000000_x', sql: '-- عنوان\nalter table t drop column c;' }]);
    expect(r).toMatchObject({ auto: false, blocking: ['20991231000000_x'] });
  });
});

describe('حارس الفحوص الليلية ش11', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  it('نجاح واحد في 36 ساعة يكفي، وغيابه في الكل يُحمّر', () => {
    expect(watch({ 'schema-check.yml': '2026-11-17T02:00:00Z', 'backup.yml': null }, now).ok).toBe(true);
    expect(watch({ 'schema-check.yml': '2026-11-16T23:00:00Z', 'backup.yml': '2026-11-15T00:30:00Z', 'restore-drill.yml': null }, now).ok).toBe(false);
  });
});

describe('الفحص الليلي للمحتوى يقرأ كاتون بكل إصداراته (سبب الإنذار الكاذب منذ 2026-11-11)', () => {
  it('موضوعات v2 الستة ليست «في الإنتاج وحده»', () => {
    expect(katonVersions().slice(0, 2)).toEqual(['v1', 'v2']);
    const repo = repoContent();
    const live = {
      katon_topics: [...repo.katon.values()].map((t) => ({ key: t.key, title_ar: t.title_ar })),
      katon_sentences: [...repo.katon.values()].flatMap((t) => t.sentences.map((s, i) => ({ topic_key: t.key, sort: i + 1, text_ar: s.text_ar, key: s.key, question: s.question }))),
    };
    for (const k of ['impact-baseline', 'impact-benefits-plan', 'impact-report', 'leadership-stakeholders', 'leadership-manage-lead', 'leadership-handover', 'basics-1']) expect(repo.katon.has(k), k).toBe(true);
    const katon = diffContent(live, repo).filter((d) => d.kind === 'katon');
    expect(katon.length).toBe(repo.katon.size);
    expect(katon.filter((d) => d.status !== 'same')).toEqual([]);
  });
});

describe('ملفات السير تطابق القواعد', () => {
  const ciText = read('.github/workflows/ci.yml');
  const manualText = read('.github/workflows/deploy-leaders-api.yml');
  const ci = yaml.load(ciText);
  const manual = yaml.load(manualText);
  const steps = (wf, job) => wf.jobs[job].steps;
  const runOf = (wf, job, name) => steps(wf, job).find((s) => s.name && s.name.startsWith(name))?.run || '';
  const deployOrder = (text) => [...text.matchAll(/^\s*deploy ([a-z-]+)( --no-verify-jwt)?$/gm)].map((m) => [m[1], Boolean(m[2])]);
  const expected = FUNCTIONS.map((f) => [f.name, Boolean(f.noVerifyJwt)]);
  const warmOrder = (text) => [...text.matchAll(/^\s*(?:ping ([a-z-]+) \S+|health ([a-z-]+))$/gm)].map((m) => m[1] || m[2]);

  it('السيران ينشران الدوال السبع بترتيب FUNCTIONS وأعلامها، ويسخّنانها كلها', () => {
    expect(deployOrder(runOf(ci, 'deploy', 'Deploy edge functions'))).toEqual(expected);
    expect(deployOrder(runOf(manual, 'deploy', 'Deploy the functions'))).toEqual(expected);
    expect(warmOrder(runOf(ci, 'deploy', 'Warm up'))).toEqual(FUNCTIONS.map((f) => f.name));
    expect(warmOrder(runOf(manual, 'deploy', 'Warm up'))).toEqual(FUNCTIONS.map((f) => f.name));
    expect(runOf(ci, 'deploy', 'Warm up')).toMatch(/for i in 1 2; do/);
  });
  it('ci.yml: النافذة أولًا، والدخان ش6 والتراجع من release، ولا ترقية إن غاب الرمز وتغيرت الدوال', () => {
    const names = steps(ci, 'deploy').map((s) => s.name || s.uses);
    const idx = (n) => names.findIndex((x) => x && x.startsWith(n));
    expect(idx('Deploy window and freeze calendar')).toBeLessThan(idx('Functions changed since'));
    expect(idx('Is an automatic rollback safe?')).toBeLessThan(idx('Deploy edge functions'));
    expect(idx('Warm up')).toBeLessThan(idx('Promote to release'));
    const dep = runOf(ci, 'deploy', 'Deploy edge functions');
    expect(dep).toMatch(/node scripts\/ops\/smoke\.mjs deploy/);
    expect(dep).toMatch(/git worktree add --detach "\$RUNNER_TEMP\/release" "\$RELEASE_SHA"/);
    expect(dep).toMatch(/AUTO_ROLLBACK" != "true"/);
    const miss = steps(ci, 'deploy').find((s) => s.name === 'Functions changed but the deploy token is missing');
    expect(miss.if).toMatch(/env\.SUPABASE_ACCESS_TOKEN == '' && steps\.fn\.outputs\.deploy == 'true'/);
    expect(miss.run).toMatch(/exit 1/);
    // كل خطوة بعد البوابة مشروطة بقرارها، فلا نشر ولا ترقية خارج النافذة
    for (const s of steps(ci, 'deploy').slice(idx('Functions changed since'))) expect(s.if, s.name || s.uses).toMatch(/steps\.go\.outputs\.run == 'true'/);
  });
  it('ci.yml: الجدولة تشغّل وظيفة deploy وحدها بشرط متغير النافذة، ومجموعة تزامن مستقلة، وDeno مثبّت', () => {
    expect(ci.on.schedule[0].cron).toBe('37 */3 * * *');
    expect(ci.jobs.changes.if).toMatch(/^github\.event_name != 'schedule' && /);
    expect(ci.jobs.deploy.if).toMatch(/github\.event_name == 'schedule' && \(vars\.DEPLOY_WINDOW != '' \|\| vars\.DEPLOY_SCHEDULE == 'on'\)/);
    expect(ci.concurrency.group).toMatch(/'ci-deferred-deploy'/);
    expect(ci.on.workflow_dispatch.inputs.urgent.default).toBe(false);
    const deno = steps(ci, 'checks').find((s) => s.uses === 'denoland/setup-deno@v2');
    expect(deno.with['deno-version']).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('سير التراجع الموحد: من main وحده، والكود من الهدف، والسكربتات من main، ويحرك release ثم الدخان الكامل', () => {
    expect(manual.on.workflow_dispatch.inputs.ref.required).toBe(true);
    const s = steps(manual, 'deploy');
    expect(s[0].run).toMatch(/"\$GITHUB_REF" != "refs\/heads\/main"/);
    const names = s.map((x) => x.name || x.uses);
    const idx = (n) => names.findIndex((x) => x && x.startsWith(n));
    expect(idx('Sign-in secrets')).toBeLessThan(idx('Deploy the functions'));
    expect(idx('Pending migrations')).toBeLessThan(idx('Deploy the functions'));
    expect(idx('Deploy the functions')).toBeLessThan(idx('Move release'));
    expect(idx('Move release')).toBeLessThan(idx('Verify the live functions'));
    expect(s.find((x) => x.name === 'Deploy the functions from the target')['working-directory']).toBe('${{ steps.target.outputs.dir }}');
    expect(runOf(manual, 'deploy', 'Verify the live functions')).toBe('node scripts/ops/smoke.mjs deploy');
    expect(runOf(manual, 'deploy', 'Pending migrations')).toMatch(/--dir=/);
  });
  it('الفحص الليلي وظيفتان باسمين، والمسبار يسأل send-otp والخطافين ويحرس الليلي', () => {
    const sc = yaml.load(read('.github/workflows/schema-check.yml'));
    expect(Object.keys(sc.jobs)).toEqual(['schema', 'content']);
    expect(JSON.stringify(sc.jobs.schema)).toMatch(/snapshot\.mjs --check/);
    expect(JSON.stringify(sc.jobs.schema)).not.toMatch(/export-live/);
    expect(JSON.stringify(sc.jobs.content)).toMatch(/export-live\.mjs --check/);
    const probe = read('.github/workflows/probe.yml');
    expect(probe).toMatch(/ping send-otp ping/);
    expect(probe).toMatch(/health creem-webhook\n\s+health leaders-hooks/);
    expect(probe).toMatch(/node scripts\/ops\/nightly-watch\.mjs/);
  });
  it('مسبار send-otp قبل أي إجراء، بلا كتابة ولا بريد، والخطافان بفحص GET قبل رفض غير POST', () => {
    const otp = read('supabase/functions/send-otp/index.ts');
    const at = otp.indexOf('if (action === "ping")');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(otp.indexOf('if (action === "contact")'));
    expect(otp.slice(at, at + 300)).toMatch(/from\("contact_requests"\)\.select\("id"\)\.limit\(1\)[\s\S]*db_ms/);
    for (const fn of ['creem-webhook', 'leaders-hooks']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src.indexOf(`healthCheck(req, '${fn}')`), fn).toBeGreaterThan(0);
      expect(src.indexOf(`healthCheck(req, '${fn}')`), fn).toBeLessThan(src.indexOf("if (req.method !== 'POST')"));
    }
  });
});
