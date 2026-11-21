// حارس «الجلسة الجماعية تُعدّ للخبير مرة واحدة» (تصور تشغيل الدفعة 2026-11-19، المرحلة 5، القرار 8)، على غرار counting_guard_test.ts:
// الجلسة الجماعية كيان واحد تحته صف لكل مشارك في coaching_sessions. فكل استعلام يقرأ صفوف جلسات لخبير (يختار expert_id أو يصفّي
// به، أو يقرأ كل الأعمدة بلا مفتاح) قد يجمعها، وجمع الصفوف يضاعف ساعات المستشار وتكلفته وحِمله بعدد المدعوين. يمر الاستعلام إن:
//   كتب (insert وupdate وupsert وdelete)، أو
//   قرأ بمفتاح صف أو مشارك أو جلسة (eq على id أو participant_id أو external_id، أو eq أو in على group_id): صف لكل مشارك لا جمع لخبير، أو
//   حمل على سطره أو السطر الذي قبله «// group-once: الدالة» باسم دالة العدّ بالكيان التي يمر بها (sessionUnits أو tallyOnce أو
//   expertStats، وكلها في logic.js)، وقرأ عمود الربط (groupCols أو *)، والدالة مستعملة في الملف نفسه، أو
//   حمل «// group-once-exempt: السبب» بسبب يُقرأ.
// استعلام جديد يجمع جلسات خبير وينسى الكيان يُسقط البناء هنا. حدود معروفة: يقرأ النص لا التنفيذ، فجمع يُكتب في ملف آخر فوق صفوف
// قُرئت هنا لا يراه (يُسمّى في الوسم)، وجدول آخر يُشتق منه حِمل الخبير خارجه.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

const DIR = new URL('./', import.meta.url);
const WRITE = /\.(insert|update|upsert|delete)\(/;
const KEYED = /\.eq\('(id|participant_id|external_id|group_id)',|\.in\('group_id',/;
const TRIGGER = /expert_id|select\((?:await groupCols\()?[`']\*/;
const MARK = /\/\/ group-once: (sessionUnits|tallyOnce|expertStats)\b/;
const EXEMPT = /\/\/ group-once-exempt: (.*)$/;
const LINKED = /groupCols\(|select\([`']\*/;

type Site = { file: string; line: number; text: string; pass: string | null; problem: string | null };

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
  const re = /from\('coaching_sessions'\)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const line = src.slice(0, m.index).split('\n').length;
    const st = statement(src, m.index);
    const here = `${lines[line - 2] || ''}\n${lines[line - 1]}`;
    const mark = MARK.exec(here), exempt = EXEMPT.exec(lines[line - 1]) || EXEMPT.exec(lines[line - 2] || '');
    let pass: string | null = null, problem: string | null = null;
    if (WRITE.test(st)) pass = 'write';
    else if (!TRIGGER.test(st)) pass = 'no-expert';
    else if (KEYED.test(st)) pass = 'keyed';
    else if (mark) {
      pass = 'once';
      if (!LINKED.test(st)) problem = 'لا يقرأ عمود الربط group_id (groupCols أو *)، فالدالة تعدّ كل صف وحدة';
      else if (!new RegExp(`\\b${mark[1]}\\(`).test(src)) problem = `الدالة ${mark[1]} المسماة في الوسم غير مستعملة في الملف`;
    } else if (exempt) {
      pass = 'exempt';
      if (exempt[1].trim().length < 15) problem = 'سبب الاستثناء أقصر من أن يُقرأ';
    }
    out.push({ file, line, text: st.replace(/\s+/g, ' ').slice(0, 150), pass, problem });
  }
  return out;
}

async function sources() {
  const out: [string, string][] = [];
  for await (const e of Deno.readDir(DIR)) {
    if (!e.isFile || !e.name.endsWith('.ts') || e.name.endsWith('_test.ts') || e.name.startsWith('_')) continue;
    out.push([e.name, await Deno.readTextFile(new URL(e.name, DIR))]);
  }
  return out.sort(([a], [b]) => a.localeCompare(b));
}

Deno.test('كل قراءة لجلسات خبير تعدّ الجلسة الجماعية مرة واحدة، أو تحمل استثناءً بسببه', async () => {
  const sites = (await sources()).flatMap(([f, s]) => scan(f, s));
  assert(sites.length > 30, `قُرئ ${sites.length} موضعًا فقط: هل تغيّر شكل الاستعلامات؟`);
  assertEquals(sites.filter((s) => !s.pass).map((s) => `${s.file}:${s.line} ${s.text}`), [],
    'استعلام يقرأ جلسات خبير بلا عدّ بالكيان: اقرأ عمود الربط بـgroupCols ومرّر الصفوف من sessionUnits أو tallyOnce أو expertStats واكتب فوقه «// group-once: الدالة»، أو «// group-once-exempt: السبب»');
  assertEquals(sites.filter((s) => s.problem).map((s) => `${s.file}:${s.line} ${s.problem}`), []);
  // المواضع المعروفة التي تجمع للخبير: ملفه وقائمته وبوابته (expertStats)، وحِمله في الترشيح والرؤية الشاملة وفريق الدفعة ومعاينة الجلسة (tallyOnce)
  const once = sites.filter((s) => s.pass === 'once').map((s) => s.file).sort();
  assertEquals(once, ['coaching-groups.ts', 'coaching-groups.ts', 'experts.ts', 'experts.ts', 'experts.ts', 'experts.ts', 'insight.ts', 'team.ts']);
});

Deno.test('الحارس يمسك جمعًا جديدًا ينسى الكيان، ويقبل الصحيح', () => {
  const bad = scan('x.ts', `const { data } = await db.from('coaching_sessions').select('expert_id, starts_at, ends_at').eq('status', 'attended');`);
  assertEquals(bad.map((s) => s.pass), [null]);
  const star = scan('x.ts', `const { data } = await db.from('coaching_sessions').select('*').eq('status', 'attended');`);
  assertEquals(star.map((s) => s.pass), [null]);
  // وسم بلا عمود الربط، أو بدالة غير مستعملة: مخالفة
  const noLink = scan('x.ts', `// group-once: tallyOnce\nconst a = await db.from('coaching_sessions').select('expert_id').eq('status', 'booked');\ntallyOnce(a.data);`);
  assert(noLink[0].problem?.includes('group_id'));
  const noUse = scan('x.ts', `// group-once: tallyOnce\nconst a = await db.from('coaching_sessions').select(await groupCols('expert_id')).eq('status', 'booked');`);
  assert(noUse[0].problem?.includes('tallyOnce'));
  const ok = scan('x.ts', `// group-once: tallyOnce\nconst a = await db.from('coaching_sessions').select(await groupCols('expert_id')).eq('status', 'booked');\ntallyOnce(a.data);`);
  assertEquals([ok[0].pass, ok[0].problem], ['once', null]);
  assertEquals(scan('x.ts', `await db.from('coaching_sessions').select('expert_id').eq('participant_id', p.id);`)[0].pass, 'keyed');
  assertEquals(scan('x.ts', `await db.from('coaching_sessions').update({ expert_id: x }).eq('status', 'booked');`)[0].pass, 'write');
  assertEquals(scan('x.ts', `// group-once-exempt: قصير\nawait db.from('coaching_sessions').select('expert_id');`)[0].problem != null, true);
});
