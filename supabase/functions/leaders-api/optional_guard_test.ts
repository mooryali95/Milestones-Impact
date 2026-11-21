// حارس قاعدة «الاختياري لا يُحسب» (قرار المالك 2026-11-21، optional.js)، على غرار counting_guard_test.ts وgroup_once_guard_test.ts:
// يقرأ ملفات الخادم (leaders-api و_shared)، وكل موضع قد يعدّ نشاطًا أو ورشة يجب أن يمر بقاعدة مسماة من optional.js، أو يحمل
// استثناءً مكتوبًا بسببه. مستهلك جديد ينسى القاعدة يُسقط البناء هنا. ثلاثة أشكال للنسيان، وكلها وُجدت قبل القرار:
//   1. قراءة العلامة مباشرة (x.required) بدل countsItem وcountedItems وcountedDef: كانت في اكتمال المرحلة وخريطة الرحلة.
//   2. عدّ بنود رحلة (items بطولها أو بما اكتمل منها) بلا القاعدة: كان في مقام نسبة التقدم وفي بريد التذكير «أنجز N من M».
//   3. قراءة جلسات الورش بلا وسمها: بأعمدة مسماة لا تحمل optional، فلا يستطيع من بعدها أن يخرج الاختيارية من عدّه.
//
// ما يمر بلا استثناء:
//   1 و2: السطر يسمي قاعدة من optional.js (countsItem، countedItems، countedProgress، countedDef، countedSessions، optionalReq،
//         optionalSession، itemOptional، eachWorkshop).
//   3: القراءة بـ* أو عبر sessionCols (فيحمل الصف وسمه)، أو كتابة، أو صف جلسة واحدة بمعرّفه (فعل على الجلسة نفسها لا عدّ).
// وما سواه بسطر «// optional-exempt: السبب» على سطره أو السطر الذي قبله.
// حدود معروفة: يقرأ النص لا التنفيذ. قاعدة تُطبق في سطر لاحق لا يراها (تُكتب في السطر نفسه أو يُستثنى بسببه)، وعدّ بلا كلمة
// items ولا required ولا اسم جدول الجلسات خارجه ويُراجع باليد. ولوحتا الإدارة والقادة تعدّان مما يختمه الخادم (required
// وdone وtotal)، ومن اختبارات الواجهة ما يثبت شاراتهما.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

const DIRS = [new URL('./', import.meta.url), new URL('../_shared/', import.meta.url)];
const RULE = /\b(countsItem|countedItems|countedProgress|countedDef|countedSessions|optionalReq|optionalSession|itemOptional|eachWorkshop)\b/;
const MARK = /\/\/ optional-exempt: (.*)$/;
// 1. قراءة العلامة من متغير (لا من ثابت تسميات مثل TIMELINE_AR.required ولا مفتاح كائن)
const FLAG = /(?:\b[a-z][A-Za-z0-9]*|\))\??\.required\b/;
// 2. عدّ بنود: items بطولها، أو بما حالته «done» منها، على السطر نفسه
const ITEMS = /\bitems\b[^;]*?(\.length\b|status\s*[!=]==\s*'done')/;
// 3. قراءة جلسات الورش
const SESSIONS = /from\('workshop_sessions'\)/g;
const WRITE = /\.(insert|update|upsert|delete)\(/;
const TAGGED = /sessionCols\(|\.select\('\*'\)/;
const ONE = /\.eq\('id',/;

// ملفات لا بنود رحلة فيها: كلمة items فيها لشيء آخر (بنود جاهزية، أسئلة قياس، عناصر صندوق). كل بند بسببه.
// ملف جديد ليس هنا يُفحص، فيمر بالقاعدة أو يكتب استثناءه
const NOT_JOURNEY: Record<string, string> = {
  'optional.js': 'القاعدة نفسها',
  'business-case.js': 'بنود دراسة الجدوى لا بنود رحلة',
  'answer-review.js': 'إجابات القياس وأسئلته لا أنشطة رحلة',
  'cohort-readiness.js': 'بنود جاهزية الدفعة (ok أو لا) لا أنشطة',
  'cohort-setup.js': 'بنود إعداد الدفعة لا أنشطة، وجلساتها بـworkshopOf الذي يسمي القاعدة',
  'org-readiness.js': 'بنود جاهزية الجهة لا أنشطة',
  'readiness.js': 'بنود جاهزية الإطلاق لا أنشطة',
  'today-desk.js': 'بنود مكتب اليوم من الجاهزية، وأقرب جلسة بـworkshopOf',
  'inbox.js': 'عناصر صندوق «ينتظرني» لا أنشطة',
  'erasure.js': 'بنود طلب الحذف لا أنشطة',
  'continuous.js': 'أسئلة القياس المستمر لا أنشطة',
  'peer.ts': 'عناصر تقييم الأقران لا أنشطة',
  'lab.js': 'بنود المختبر وأسئلته لا أنشطة رحلة',
  'lab.ts': 'بنود المختبر وأسئلته لا أنشطة رحلة',
  'evidence.js': 'بنود أداة القياس (ثبات وتحليل) لا أنشطة',
  'feedback360.js': 'عبارات التقدير لا أنشطة',
  'feedback360.ts': 'عبارات التقدير لا أنشطة',
  'guide.js': 'عناصر سياق المرشد لا أنشطة',
  'guide.ts': 'عناصر سياق المرشد لا أنشطة',
  'guide-eval.js': 'حالات تقييم المرشد لا أنشطة',
  'guide-eval.ts': 'حالات تقييم المرشد لا أنشطة',
  'capstone.js': 'فصول وثيقة المبادرة وبنودها لا أنشطة رحلة',
  'capstone.ts': 'فصول وثيقة المبادرة وبنودها لا أنشطة رحلة',
  'closure.js': 'بنود إقفال المبادرة لا أنشطة',
  'handbook-section-ids.js': 'معرّفات أقسام كتاب القائد',
  'migrations.js': 'قائمة مولّدة',
};

type Site = { file: string; line: number; kind: 'flag' | 'items' | 'sessions'; text: string; why: string | null; pass: boolean };
const code = (line: string) => { const i = line.indexOf('//'); return i < 0 ? line : line.slice(0, i); };

// العبارة من موضع from حتى نهايتها (كما في counting_guard_test.ts)
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
  const whyAt = (n: number) => { const m = MARK.exec(lines[n]) || MARK.exec(lines[n - 1] || ''); return m ? m[1].trim() : null; };
  lines.forEach((raw, n) => {
    const line = code(raw);
    if (!line.trim()) return;
    if (FLAG.test(line)) out.push({ file, line: n + 1, kind: 'flag', text: line.trim().slice(0, 140), why: whyAt(n), pass: RULE.test(line) });
    else if (!(file in NOT_JOURNEY) && ITEMS.test(line)) out.push({ file, line: n + 1, kind: 'items', text: line.trim().slice(0, 140), why: whyAt(n), pass: RULE.test(line) });
  });
  for (let m = SESSIONS.exec(src); m; m = SESSIONS.exec(src)) {
    const n = src.slice(0, m.index).split('\n').length - 1;
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const st = statement(src, m.index);
    const window = src.slice(lineStart, m.index) + st;
    out.push({ file, line: n + 1, kind: 'sessions', text: st.replace(/\s+/g, ' ').slice(0, 140), why: whyAt(n), pass: WRITE.test(st) || TAGGED.test(window) || ONE.test(st) });
  }
  return out;
}

async function sources() {
  const out: [string, string][] = [];
  for (const dir of DIRS) {
    for await (const e of Deno.readDir(dir)) {
      if (!e.isFile || !/\.(ts|js)$/.test(e.name) || /_test\.ts$|\.test\.js$/.test(e.name) || e.name.startsWith('_')) continue;
      if (e.name === 'optional.js') continue;
      out.push([e.name, await Deno.readTextFile(new URL(e.name, dir))]);
    }
  }
  return out.sort(([a], [b]) => a.localeCompare(b));
}

Deno.test('كل موضع قد يعدّ نشاطًا أو ورشة يمر بقاعدة من optional.js أو يحمل استثناءً بسببه', async () => {
  const sites = (await sources()).flatMap(([f, s]) => scan(f, s));
  // الفحص يقرأ فعلًا: المواضع المعروفة موجودة بأنواعها الثلاثة
  const of = (k: Site['kind']) => sites.filter((s) => s.kind === k);
  assert(of('flag').length >= 8 && of('items').length >= 8 && of('sessions').length >= 25, `قُرئ ${of('flag').length} علامة و${of('items').length} عدّ بنود و${of('sessions').length} قراءة جلسات: هل تغيّر شكل الكود؟`);
  const open = sites.filter((s) => !s.pass && !s.why).map((s) => `${s.file}:${s.line} [${s.kind}] ${s.text}`);
  assertEquals(open, [], 'موضع بلا قاعدة ولا استثناء: استعمل countsItem أو countedItems أو countedProgress أو countedDef (وللجلسات sessionCols أو * ثم countedSessions) من optional.js، أو اكتب فوقه «// optional-exempt: السبب»');
  // سبب الاستثناء جملة تُقرأ، لا علامة فارغة
  assertEquals(sites.filter((s) => s.why != null && s.why.length < 12).map((s) => `${s.file}:${s.line}`), []);
  // والاستثناء لموضع فحصه الحارس، لا تعليق يتيم بقي بعد حذف سطره
  for (const [f, src] of await sources()) {
    const lines = src.split('\n');
    lines.forEach((l, n) => {
      if (!MARK.test(l) || l.trim().startsWith('//') === false) return;
      assert(sites.some((s) => s.file === f && (s.line === n + 2 || s.line === n + 1)), `${f}:${n + 1} استثناء لا موضع تحته`);
    });
  }
});

Deno.test('الحارس يلتقط الأشكال الثلاثة، ويقبل القاعدة والاستثناء', () => {
  const bad = [
    "const need = stage.items.filter((x) => x.required && x.status !== 'done');",
    "const total = items.length;",
    "const done = st.items.filter((i) => i.status === 'done').length;",
    "const rows = await db.from('workshop_sessions').select('id, cohort_id, starts_at').eq('cohort_id', c.id);",
  ];
  assertEquals(bad.map((l) => scan('new-consumer.ts', l).filter((s) => !s.pass && !s.why).map((s) => s.kind)), [['flag'], ['items'], ['items'], ['sessions']]);
  const good = [
    "const need = countedItems(stage.items).filter((x) => x.status !== 'done');",
    "const n = countedProgress(items); const total = n.total;",
    "const rows = await db.from('workshop_sessions').select(await sessionCols('id, cohort_id, starts_at')).eq('cohort_id', c.id);",
    "const all = await db.from('workshop_sessions').select('*').order('starts_at');",
    "const s = await db.from('workshop_sessions').select('id, cohort_id').eq('id', id).maybeSingle();",
    "await db.from('workshop_sessions').update({ invited_at: now }).eq('cohort_id', c.id);",
    "// optional-exempt: حقل نموذج لا نشاط في الرحلة\nif (f.required === false) continue;",
    "const label = TIMELINE_AR.required;",
    "const out = { required: true };",
  ];
  assertEquals(good.flatMap((l) => scan('new-consumer.ts', l).filter((s) => !s.pass && !s.why)), []);
  // ملف خارج بنود الرحلة لا يُفحص عدّ بنوده، وتبقى قراءة العلامة والجلسات مفحوصة فيه
  assertEquals(scan('inbox.js', "const total = items.length;\nconst opt = it.required === false;").map((s) => s.kind), ['flag']);
});
