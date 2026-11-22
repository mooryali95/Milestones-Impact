// حارس قاعدة العد (تصور الحساب التجريبي 2026-11-19، المرحلة 0)، على غرار حارس تصنيف الأفعال في program_gate_test.ts:
// يقرأ ملفات الخادم، وكل قراءة صفوف من المشاركين أو من جداول العد (القياسات، الحضور، الشهادات) يجب أن تمر بقاعدة مسماة من
// counting.ts (counted أو listed، أو أغلفتها forStats وorgFilter وlistFilter)، أو تحمل استثناءً مكتوبًا بسببه. خمس ثغرات
// وُجدت في 2026-11-19 كلها من هذا النوع: استعلام عدّ كُتب بلا الشرط (الحضور، تقرير الصحة، الاتجاهات، ثبات الأداة، تحليل
// البنود)، ومعها النظرة العامة وأعداد المسارات. استعلام جديد ينسى القاعدة يُسقط البناء هنا.
//
// ما يمر بلا قاعدة، بحكم شكله لا بحكم كاتبه:
//   كتابة (insert وupdate وupsert وdelete): لا تعدّ ولا تعرض.
//   صف بمفتاحه (eq على id أو email أو participant_id أو serial): قراءة صاحب الصف نفسه أو صف طلبه المدير بمعرّفه.
//   مرشح صريح على العلامة نفسها (eq على is_demo): قرار مكتوب في مكانه (حساب العرض نفسه في demo.ts، وعزل الأقران).
// وما سواه بقاعدة، أو بسطر «// counting-exempt: السبب» على سطره أو السطر الذي قبله، أو في EXEMPT أدناه لملف لا يُحرَّر الآن.
// حدود معروفة: يقرأ النص لا التنفيذ، فمرشح يُضاف إلى استعلام في سطر لاحق لا يراه (يُكتب في العبارة نفسها أو يُستثنى بسببه)،
// وجدول يُعدّ من غير هذه الأربعة (التسكينات والإلحاقات والنقاط) خارجه ويُراجع باليد. يُوسَّع مع حساب لكل دفعة (المرحلة 2).
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

const DIR = new URL('./', import.meta.url);
export const TABLES = ['participants', 'assessments', 'workshop_attendance', 'certificates'];
const PREDICATE = /\b(counted|listed|forStats|orgFilter|listFilter)\(/;
const WRITE = /\.(insert|update|upsert|delete)\(/;
const KEYED = /\.eq\('(id|email|participant_id|serial)',/;
const FLAG = /\.eq\('(?:[a-z_]+\.)?is_demo',/;
const MARK = /\/\/ counting-exempt: (.*)$/;
const HAND = /\.eq\('(?:[a-z_]+\.)?is_demo', false\)/;

// استثناء بلا سطر في الملف: لملف يحرره زميل الآن (CLAUDE.md، العمل بالتوازي). كل بند: الملف، وجزء من العبارة، والسبب
const EXEMPT: { file: string; has: string; why: string }[] = [
  { file: 'cohort-plan.ts', has: ".select('*').in('id', m.ids.slice(i, i + 150))", why: 'معرّفات أعضاء الدفعة من cohortMemberIds (listed)؛ الملف يحرره زميل (محرر رحلة الدفعة) فلا يُمس الآن' },
];

type Site = { file: string; line: number; table: string; text: string; why: string | null; pass: string | null };

// العبارة من موضع from حتى نهايتها: فاصلة منقوطة أو فاصلة آخر سطر على العمق نفسه، أو إغلاق القوس الذي يحويها
function statement(src: string, at: number) {
  let d = 0, i = at;
  for (; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { d--; if (d < 0) break; }
    else if (c === ';' && d === 0) break;
    else if (c === ',' && d === 0 && src[i + 1] === '\n') break;
  }
  return src.slice(at, i);
}

export function scan(file: string, src: string): Site[] {
  const lines = src.split('\n');
  const out: Site[] = [];
  for (const table of TABLES) {
    const re = new RegExp(`from\\('${table}'\\)`, 'g');
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const line = src.slice(0, m.index).split('\n').length;
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const st = statement(src, m.index);
      const window = src.slice(lineStart, m.index) + st;
      const mark = MARK.exec(lines[line - 1]) || MARK.exec(lines[line - 2] || '');
      const listedHere = EXEMPT.find((e) => e.file === file && st.includes(e.has));
      const why = mark ? mark[1].trim() : listedHere ? listedHere.why : null;
      const pass = WRITE.test(st) ? 'write' : PREDICATE.test(window) ? 'predicate' : FLAG.test(st) ? 'flag' : KEYED.test(st) ? 'keyed' : null;
      out.push({ file, line, table, text: st.replace(/\s+/g, ' ').slice(0, 140), why, pass });
    }
  }
  return out;
}

async function sources() {
  const out: [string, string][] = [];
  for await (const e of Deno.readDir(DIR)) {
    if (!e.isFile || !e.name.endsWith('.ts') || e.name.endsWith('_test.ts') || e.name.startsWith('_') || e.name === 'counting.ts') continue;
    out.push([e.name, await Deno.readTextFile(new URL(e.name, DIR))]);
  }
  return out.sort(([a], [b]) => a.localeCompare(b));
}

Deno.test('كل قراءة صفوف من المشاركين وجداول العد تمر بقاعدة من counting.ts أو تحمل استثناءً بسببه', async () => {
  const sites = (await sources()).flatMap(([f, s]) => scan(f, s));
  assert(sites.length > 150, `قُرئ ${sites.length} موضعًا فقط: هل تغيّر شكل الاستعلامات؟`);
  const open = sites.filter((s) => !s.pass && !s.why).map((s) => `${s.file}:${s.line} [${s.table}] ${s.text}`);
  assertEquals(open, [], 'استعلام بلا قاعدة عد ولا استثناء: لفّه بـcounted أو listed من counting.ts، أو اكتب فوقه «// counting-exempt: السبب»');
  // سبب الاستثناء جملة تُقرأ، لا علامة فارغة
  assertEquals(sites.filter((s) => s.why != null && s.why.length < 15).map((s) => `${s.file}:${s.line}`), []);
});

Deno.test('لا استثناء بلا موضعه: سطر counting-exempt يتبعه استعلام يحتاجه، وكل بند في EXEMPT يطابق عبارة قائمة', async () => {
  const srcs = await sources();
  const sites = srcs.flatMap(([f, s]) => scan(f, s));
  const stale: string[] = [];
  for (const [file, src] of srcs) {
    src.split('\n').forEach((l, i) => {
      if (!MARK.test(l)) return;
      // السطر نفسه أو الذي يليه موضع، وليس مما يمر وحده بقاعدة (استثناء فوق استعلام مصفّى يضلل القارئ)
      const hit = sites.find((s) => s.file === file && (s.line === i + 1 || s.line === i + 2));
      if (!hit || hit.pass === 'predicate') stale.push(`${file}:${i + 1}`);
    });
  }
  assertEquals(stale, []);
  assertEquals(EXEMPT.filter((e) => !sites.some((s) => s.file === e.file && s.why === e.why)).map((e) => e.file), []);
});

Deno.test('الشرط لا يُكتب باليد: لا eq على is_demo بقيمة false خارج counting.ts', async () => {
  const hand: string[] = [];
  for (const [file, src] of await sources()) src.split('\n').forEach((l, i) => { if (HAND.test(l)) hand.push(`${file}:${i + 1}`); });
  assertEquals(hand, []);
});

Deno.test('الحارس نفسه: يلتقط العدّ بلا قاعدة، ويمرر القاعدة والمفتاح والكتابة والاستثناء', () => {
  const src = [
    "const a = await db.from('participants').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);",
    "const b = await counted(db.from('participants').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo));",
    "const c = await db.from('participants').select('*').eq('id', id).maybeSingle();",
    "await db.from('participants').update({ status: 'placed' }).in('id', ids);",
    '// counting-exempt: حارس حذف لا عدّ، أي صف يمنع الحذف',
    "const d = await db.from('workshop_attendance').select('session_id', { count: 'exact', head: true }).eq('session_id', sid);",
    "const e = await db.from('assessments').select('id, form').eq('instrument_id', base.id).eq('status', 'submitted');",
    "const f = await listed(db.from('certificates').select('id, participants!inner(is_demo)'), 'participants');",
    "const g = await db.from('participants').select('id').eq('is_demo', true).maybeSingle();",
  ].join('\n');
  const got = scan('x.ts', src).sort((x, y) => x.line - y.line).map((s) => [s.line, s.pass, s.why != null]);
  assertEquals(got, [[1, null, false], [2, 'predicate', false], [3, 'keyed', false], [4, 'write', false], [6, null, true], [7, null, false], [8, 'predicate', false], [9, 'flag', false]]);
});

// ── حساب تجريبي لكل دفعة (المرحلة 2 من التصور) ──
// حساب الدفعة يحمل دفعته في participants.demo_cohort_id وحده، ولا صف له في أي جدول عضوية، فكل قراءة بالدفعة لا تجده وكل
// قراءة من المشاركين تستبعده بالقاعدة أعلاه. الحارسان التاليان يثبتان الشرطين: لا كاتب عضوية يقبله، ولا يُقرأ العمود إلا
// في مواضعه المعروفة (قراءة جديدة به تعني طريقًا جديدًا إلى الحساب، فتُراجع هنا).
// (الجلسة الجماعية مع المستشار صفوفها في coaching_sessions، ويرد classify في coaching-groups.ts الحساب التجريبي بسببه المكتوب)
export const MEMBERSHIP_TABLES = ['enrollments', 'cohort_group_members', 'cohort_roles', 'hall_presence'];
const MEMBER_MARK = /\/\/ demo-member-exempt: (.{15,})$/;

export function membershipWrites(file: string, src: string) {
  const lines = src.split('\n');
  const out: { file: string; line: number; table: string; guarded: boolean }[] = [];
  for (const table of MEMBERSHIP_TABLES) {
    const re = new RegExp(`from\\('${table}'\\)\\.(insert|upsert)\\(`, 'g');
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const line = src.slice(0, m.index).split('\n').length;
      // الدالة التي تحوي الكتابة: من آخر «function» قبلها حتى موضعها
      const start = Math.max(src.lastIndexOf('\nexport async function ', m.index), src.lastIndexOf('\nasync function ', m.index), src.lastIndexOf('\nfunction ', m.index));
      const body = src.slice(start < 0 ? 0 : start, m.index);
      const marked = MEMBER_MARK.test(lines[line - 1]) || MEMBER_MARK.test(lines[line - 2] || '') || MEMBER_MARK.test(lines[line - 3] || '');
      out.push({ file, line, table, guarded: /\brefuseDemo\(/.test(body) || marked });
    }
  }
  return out;
}

Deno.test('كل كتابة عضوية في دفعة ترد الحساب التجريبي (refuseDemo) أو تحمل سبب استثنائها', async () => {
  const sites = (await sources()).flatMap(([f, s]) => membershipWrites(f, s));
  assert(sites.length >= 5, `قُرئ ${sites.length} موضعًا فقط: هل تغيّر شكل الكتابة؟`);
  assertEquals(sites.filter((s) => !s.guarded).map((s) => `${s.file}:${s.line} [${s.table}]`), [],
    'كتابة عضوية بلا حارس: استدعِ refuseDemo (demo-cohort.ts) قبلها، أو اكتب فوقها «// demo-member-exempt: السبب»');
  // والحارس نفسه يلتقط: كتابة بلا حارس تُرى، وبالحارس أو بالسبب تمر
  const probe = [
    'export async function a(ids: string[]) {', "  await db.from('enrollments').upsert(ids.map((participant_id) => ({ participant_id })));", '}',
    'export async function b(ids: string[]) {', '  await refuseDemo(ids);', "  await db.from('enrollments').upsert(ids.map((participant_id) => ({ participant_id })));", '}',
    'export async function c(rows: any[]) {', '  // demo-member-exempt: الأعضاء من cohortMembers (listed) وحدهم', "  await db.from('cohort_group_members').insert(rows);", '}',
  ].join('\n');
  assertEquals(membershipWrites('x.ts', probe).sort((x, y) => x.line - y.line).map((s) => [s.line, s.guarded]), [[2, false], [6, true], [10, true]]);
});

Deno.test('عمود دفعة الحساب التجريبي لا يُقرأ ولا يُكتب إلا في مواضعه: دفعة المشارك نفسه، وملف demo-cohort.ts، وفتح الحساب', async () => {
  const ALLOWED: Record<string, string> = {
    'demo-cohort.ts': 'تعريف الربط: دفعة الحساب، وحذفه عند إغلاق دفعته بشرطي العلامة والدفعة',
    'demo.ts': 'إنشاء الحساب عند أول فتح بعمود دفعته',
  };
  const used = (await sources()).filter(([, s]) => /demo_cohort_id/.test(s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'))).map(([f]) => f);
  assertEquals(used.filter((f) => !ALLOWED[f]), [], 'ملف جديد يقرأ participants.demo_cohort_id: دفعة الحساب تُقرأ بـdemoCohortOf من demo-cohort.ts وحده');
  // ودفعة المشارك نفسه تمر بالدالة المسماة لا بالعمود
  const programs = await Deno.readTextFile(new URL('programs.ts', DIR));
  assert(programs.includes('const demoCohort = demoCohortOf(p as any);'));
  // والحذف التلقائي لا يكتب حذفًا من المشاركين بلا العلامة: عبارة واحدة، وفيها is_demo والدفعة معًا
  const dc = await Deno.readTextFile(new URL('demo-cohort.ts', DIR));
  const deletes = dc.split('\n').filter((l) => /from\('participants'\)\.delete\(\)/.test(l));
  assertEquals(deletes.length, 1);
  assert(/\.eq\('is_demo', true\)\.eq\('demo_cohort_id', cohortId\)/.test(deletes[0]));
});
