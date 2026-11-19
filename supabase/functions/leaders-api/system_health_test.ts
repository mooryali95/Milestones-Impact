// حالة النظام في اللوحة (ops-4) على قاعدة مزيفة: الترحيل المؤجل بقرار لا يُطلب تطبيقه، وقناة التنبيه من الأسرار
// المفحوصة، وجاهزية الإطلاق تضم بنود م2 التي تحكم بها بوابات المراحل (دفعة جهة بلا مستشار مثلًا).
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1.0.19';
const { db } = await import('./core.ts');
const { health } = await import('./system.ts');
const { MIGRATIONS } = await import('./migrations.js');
const { ALERT_CHANNEL_KEY } = await import('./readiness.js');

type Res = { data?: unknown; error?: unknown; count?: number | null };
function install(route: (table: string, ops: string[]) => Res) {
  const from = (table: string) => {
    const ops: string[] = [];
    const q: any = new Proxy({}, {
      get(_t, k: string) {
        if (k === 'then') return (ok: (x: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(route(table, ops)).then(ok, bad);
        return (...args: unknown[]) => { ops.push(`${k}:${JSON.stringify(args)}`); return q; };
      },
    });
    return q;
  };
  const saved = (db as any).schema;
  Object.assign(db as any, { from, schema: () => ({ from }) });
  return { restore: () => { delete (db as any).from; (db as any).schema = saved; } };
}

const DEFERRED = '20261102100100_leaders_activate_v5';
const TOLERANT = '20261110130000_leaders_hall_timer';

Deno.test('حالة النظام: المؤجل بقرار منفصل عن المطلوب تطبيقه، وقناة التنبيه مفحوصة، وبنود م2 في الجاهزية', async () => {
  Deno.env.delete('LEADERS_ALERT_WEBHOOK');
  Deno.env.delete('LEADERS_SLACK_BOT_TOKEN');
  Deno.env.delete('LEADERS_SLACK_CHANNEL');
  const f = install((t, ops) => {
    if (t === 'schema_migrations') return { data: MIGRATIONS.filter((n) => n !== DEFERRED && n !== TOLERANT).map((name) => ({ name })), error: null };
    if (t === 'mail_events') return { data: null, count: 0, error: null };
    if (t === 'programs') return ops.some((o) => o.includes('"head":true')) ? { data: null, count: 1, error: null } : { data: { final_eval: null }, error: null };
    if (t === 'organizations') return { data: [{ id: 'o1', name: 'جهة أ', status: 'active' }], error: null };
    if (t === 'cohorts') return { data: [{ id: 'c1', name: 'دفعة أ', organization_id: 'o1', status: 'running', advisor_expert_id: null, content_release: null, delivery: {} }], error: null };
    if (t === 'workshop_sessions') return { data: [], error: null };
    if (t === 'instruments') return { data: [{ key: 'b', kind: 'baseline', active: true, version: 1 }, { key: 'p', kind: 'post', active: true, version: 1 }], error: null };
    if (t === 'certificate_settings') return { data: { signatory: { name: 'س' }, hours: 40 }, error: null };
    return { data: [], error: null };
  });
  try {
    const h: any = await health();
    assertEquals(h.missing_migrations, [TOLERANT]);
    assertEquals(h.pending_migrations.map((m: any) => [m.name, m.gate]), [[DEFERRED, 'deferred'], [TOLERANT, 'tolerant']]);
    assertEquals(h.missing_secrets.includes(ALERT_CHANNEL_KEY), true);
    assertEquals(h.missing_secrets.includes('LEADERS_ALERT_WEBHOOK'), false);
    // سلاك بسرّيه يكفي قناةً بلا الرابط
    Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-test');
    Deno.env.set('LEADERS_SLACK_CHANNEL', 'C0TEST');
    assertEquals(((await health()) as any).missing_secrets.includes(ALERT_CHANNEL_KEY), false);
    Deno.env.delete('LEADERS_SLACK_CHANNEL');
    assertEquals(((await health()) as any).missing_secrets.includes(ALERT_CHANNEL_KEY), true);
    Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/a');
    assertEquals(((await health()) as any).missing_secrets.includes(ALERT_CHANNEL_KEY), false);
    const r = Object.fromEntries(h.readiness.map((x: any) => [x.key, x.ok]));
    // الإعداد مكتمل («4 من 4» كما كانت اللوحة تقول)، وم2 ليست كذلك
    assertEquals([r.baseline, r.post, r.program, r.certificate], [true, true, true, true]);
    assertEquals([r['cohort-per-org'], r.advisor, r.sessions, r['final-eval'], r['release-pinned'], r['version-pinned']], [true, false, false, false, false, false]);
    // قائمة البرامج لم تُقرأ صفوفًا في هذه القاعدة المزيفة، فلا يُحكم ببند نسخ البرامج
    assertEquals('program-versions' in r, false);
  } finally { f.restore(); for (const k of ['LEADERS_ALERT_WEBHOOK', 'LEADERS_SLACK_BOT_TOKEN', 'LEADERS_SLACK_CHANNEL']) Deno.env.delete(k); }
});
