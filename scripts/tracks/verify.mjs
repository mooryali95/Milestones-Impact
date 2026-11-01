// ════════════════════════════════════════════════════════════════
// تحقق المسارات (المرحلة ب): المحتوى المعتمد مقابل ما يسلّمه النظام فعلًا
// ════════════════════════════════════════════════════════════════
// يطبّق تعديلات supabase/content/tracks/v2 على لقطة الحالة (state-before.json)
// بالدوال نفسها التي يستعملها الخادم (modelsFor، fieldsFor، capstoneModels،
// trackProject، labVisible، handbookModulesFor)، ثم يتحقق من:
//   1) كل مسار من الـ27 له ملف تعريف يطابق إطار أولويته ومستواه فيه
//   2) نصوص الملفات بلا قوالب «نحو/مسار» ولا كلمات نطاق ولا وعود جلسات أو ورش بالمستوى
//   3) كل وعد في ملف التعريف يسلّمه النظام لذلك المستوى، ومختبرات الإطار كلها مذكورة
//   4) المختبرات تصل كل مستوى كما هو مقصود (يطبع جدولًا)
//   5) الأثر التأسيسي يحصل على نموذجين على الأقل، وتقرير الأثر في وثيقة الاحترافي
// node scripts/tracks/verify.mjs  ← يخرج بـ 1 عند أي خلل
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIMENSIONS, DIM_AR, LEVEL_AR } from '../../supabase/functions/leaders-api/labels.js';
import { fieldsFor, handbookModulesFor, modelsFor, priorityFor, profileKey, rubricPriority, strengthsLine, trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { capstoneModels, RUBRIC, trackProject } from '../../supabase/functions/leaders-api/capstone.js';
import { labVisible } from '../../supabase/functions/leaders-api/lab.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/content/tracks/v2');
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const state = read('state-before.json');
const { profiles } = read('profiles.json');
const M = read('models.json');
const LABS = read('labs.json');
const { tracks } = read('tracks.json');
const fixes = read('title-fixes.json').titles;
const LV = ['beginner', 'intermediate', 'advanced'];
const DIMS = DIMENSIONS.map((d) => d.key);

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// ── الحالة بعد الترحيل (المحاكاة نفسها التي يكتبها build.mjs في SQL) ──
export function applyContent(st) {
  const models = st.models.map((m) => {
    let fields = m.fields.map((f) => {
      const p = M.patch_fields.find((x) => x.model === m.key && x.field === f.key);
      return p ? { ...f, ...p.patch } : f;
    });
    for (const a of M.add_fields.filter((x) => x.model === m.key)) {
      if (fields.some((f) => f.key === a.field.key)) continue;
      const at = fields.findIndex((f) => f.key === 'track_depth');
      fields = at < 0 ? [...fields, a.field] : [...fields.slice(0, at), a.field, ...fields.slice(at)];
    }
    return {
      ...m, fields,
      min_level: M.min_level[m.key]?.to || m.min_level,
      capstone_sort: m.capstone_sort ?? M.capstone_sort[m.key]?.to ?? null,
    };
  });
  const labs = st.labs.map((l) => ({ ...l, id: l.key, audience: LABS.audience[l.key] || l.audience }));
  return { models, labs };
}
const { models, labs } = applyContent(state);
const chapters = state.chapters.map((c) => ({ ...c, body_md: 'x', sort: 0 }));
const byKey = Object.fromEntries(models.map((m) => [m.key, m]));
const flat = (p) => [p.title_ar, p.summary_ar, ...p.journey_ar].join('\n');
// مستويات تمثيلية لملف تعريف: إطاره بمستواه، والإطاران الآخران بالمستوى نفسه (لا يؤثران في إطاره)
const levelsOf = (p) => Object.fromEntries(DIMS.map((d) => [d, p.level]));

// ── 1) الربط ──
check(tracks.length === 27, `عدد المسارات ${tracks.length} لا 27`);
const pkeys = new Set(profiles.map((p) => p.key));
for (const t of tracks) {
  const lv = trackLevels(t.key);
  const pk = profileKey(lv, t.priority_dimension);
  check(pk === t.profile_key, `${t.key}: profile_key ${t.profile_key} ≠ ${pk}`);
  check(pkeys.has(t.profile_key), `${t.key}: لا ملف تعريف ${t.profile_key}`);
  check(t.title_en && t.title_en.length <= 200, `${t.key}: title_en فارغ`);
  // محور الأولوية هو الأضعف (القاعدة التي يقوم عليها الطي)
  const r = DIMS.map((d) => LV.indexOf(lv[d]));
  check(LV.indexOf(lv[t.priority_dimension]) === Math.min(...r), `${t.key}: الأولوية ليست الأضعف`);
  check(!!strengthsLine(lv, t.priority_dimension), `${t.key}: سطر أقوى الأطر فارغ`);
}
for (const p of profiles) {
  check(p.key === `${p.priority_dimension}-${p.level}`, `${p.key}: المفتاح لا يطابق الإطار والمستوى`);
}
// الأولوية للمشارك (priorityFor): عند التعادل تحسمها مؤشراته، فأي إطار متعادل في الأضعف ممكن.
// كل تركيبة (إطار × مستوى) يبلغها priorityFor لها ملف، وكل ملف تبلغه تركيبة واحدة على الأقل.
const reach = {}; // مفتاح الملف ← تركيبات المستويات التي تبلغه
for (const t of tracks) {
  const lv = trackLevels(t.key);
  const tied = DIMS.filter((d) => LV.indexOf(lv[d]) === Math.min(...DIMS.map((x) => LV.indexOf(lv[x]))));
  for (const d of tied) {
    const comp = Object.fromEntries(DIMS.map((x) => [x, x === d ? 10 : 50]));
    const pr = priorityFor(lv, comp, t.priority_dimension);
    check(pr === d, `${t.key}: priorityFor لا يختار ${d} بأدنى مؤشر`);
    const pk = profileKey(lv, pr);
    check(pkeys.has(pk), `${t.key} بأولوية ${pr}: لا ملف تعريف ${pk}`);
    (reach[pk] ||= []).push(lv);
  }
  check(priorityFor(lv, null, t.priority_dimension) === t.priority_dimension, `${t.key}: الافتراض بلا مؤشرات ≠ tracks.priority_dimension`);
}
for (const p of profiles) check((reach[p.key] || []).length > 0, `${p.key}: لا تركيبة تبلغه`);
check(Object.keys(reach).length === 9 && profiles.length === 9, `ملفات التعريف ${profiles.length} والممكنة ${Object.keys(reach).length}، والمطلوب 9`);
const allEqual = (lv) => DIMS.every((d) => lv[d] === lv[DIMS[0]]);
for (const [k, f] of Object.entries(fixes)) {
  const t = tracks.find((x) => x.key === k);
  check(t?.title_ar === f.to, `${k}: العنوان لم يُصحح`);
  check(state.tracks.find((x) => x.key === k)?.title_ar === f.from, `${k}: العنوان الأصلي في اللقطة تغيّر عن ${f.from}`);
}

// ── 2) النصوص ──
const BANNED = [
  [/(^|[\s،.:«(])نحو(?=[\s،.:»)]|$)/, 'قالب «نحو»'],
  [/(^|[\s،.:«(])مسار(ك|ه)?(?=[\s،.:»)]|$)/, '«مسار» حشوًا'],
  [/محفظ|المحافظ|برامج|برنامج|على مستوى/, 'كلمة نطاق'],
  [/ورش|عيادة|حلقة|النصيب الأكبر|جلسات|الجلسة/, 'وعد جلسات أو ورش بالمستوى'],
  [/صُمّم لمن|صمم لمن|تبني الرحلة على نقاط قوتك|الملهم|متكامل/, 'قالب الملخصات القديم'],
  [/\d/, 'رقم صريح (الأرقام تأتي من الإعداد)'],
];
for (const p of profiles) {
  const txt = flat(p);
  for (const [re, why] of BANNED) check(!re.test(txt), `${p.key}: ${why}: ${txt.match(re)?.[0]}`);
  check(/^[A-Z][A-Za-z ,:&'-]{3,80}$/.test(p.title_en) && !/track/i.test(p.title_en), `${p.key}: title_en «${p.title_en}»`);
  check(p.title_ar.length <= 40, `${p.key}: العنوان أطول من 40 حرفًا`);
  check(p.summary_ar.length >= 120 && p.summary_ar.length <= 320, `${p.key}: طول الملخص ${p.summary_ar.length}`);
  for (const line of p.journey_ar) check(/^[^:]{2,20}: \S/.test(line), `${p.key}: سطر رحلة بلا «عنوان: نص»: ${line.slice(0, 30)}`);
}
// أصالة: لا عنوانان ولا ملخصان متقاربان (تشابه ثنائيات الحروف)
const grams = (s) => { const g = new Set(); const t = s.replace(/\s+/g, ' '); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
const dice = (a, b) => { const A = grams(a); const B = grams(b); let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return (2 * n) / (A.size + B.size); };
for (let i = 0; i < profiles.length; i++) for (let j = i + 1; j < profiles.length; j++) {
  const [a, b] = [profiles[i], profiles[j]];
  check(dice(a.summary_ar, b.summary_ar) < 0.6, `ملخصا ${a.key} و${b.key} متقاربان (${dice(a.summary_ar, b.summary_ar).toFixed(2)})`);
  check(a.title_ar !== b.title_ar && a.title_en !== b.title_en, `عنوانا ${a.key} و${b.key} متطابقان`);
}

// ── 3) الوعود مقابل ما يُسلَّم ──
const RUBRIC_DIMS = new Set(RUBRIC.map((r) => r.dimension));
for (const p of profiles) {
  const lv = levelsOf(p);
  const d = p.priority_dimension;
  const txt = flat(p);
  const myModels = modelsFor(models, lv, 'project').filter((m) => m.dimension === d);
  const myCap = capstoneModels(models, lv, 'project').filter((m) => m.dimension === d);
  const myLabs = labVisible(labs, { levels: lv, participantId: 'x' }).filter((l) => l.dimension === d);
  const myChapters = handbookModulesFor(chapters, lv).filter((c) => c.dimension === d);
  for (const pr of p.promises) {
    const tag = `${p.key} ← ${pr.kind} ${pr.key || pr.code || pr.chapter || pr.field || ''}`;
    if (pr.kind === 'chapter') check(myChapters.some((c) => c.chapter_key === pr.chapter), `${tag}: الباب غير مرئي للمستوى`);
    else if (pr.kind === 'lab') {
      const l = myLabs.find((x) => x.key === pr.key);
      check(!!l, `${tag}: المختبر لا يصل المستوى تلقائيًا`);
      check(l && txt.includes(l.title_ar), `${tag}: اسم المختبر غير مذكور حرفيًا`);
    } else if (pr.kind === 'model') {
      const m = myModels.find((x) => x.key === pr.key);
      check(!!m, `${tag}: النموذج غير متاح للمستوى`);
      check(m && txt.includes(m.title_ar), `${tag}: اسم النموذج غير مذكور`);
    } else if (pr.kind === 'field') {
      const m = byKey[pr.model];
      check(!!myModels.find((x) => x.key === pr.model), `${tag}: نموذج الحقل غير متاح`);
      const f = m && fieldsFor(m.fields, p.level, 'project', true).find((x) => x.key === pr.field);
      check(!!f, `${tag}: الحقل غير ظاهر للمستوى`);
      // الحقل وعد بمستوى: يجب ألا يظهر لمستوى أدنى إن كان الوعد «ما يميز مستواك»
      if (f?.min_level) check(f.min_level === p.level, `${tag}: الحقل من مستوى ${f.min_level} لا ${p.level}`);
    } else if (pr.kind === 'track_depth') {
      const deep = myCap.filter((m) => m.fields.some((f) => f.track)).map((m) => m.key);
      check(JSON.stringify([...deep].sort()) === JSON.stringify([...pr.models].sort()), `${tag}: فصول التعمق الفعلية ${deep.join('، ')}`);
      for (const k of pr.models) check(txt.includes(byKey[k].title_ar), `${tag}: «${byKey[k].title_ar}» غير مذكور`);
    } else if (pr.kind === 'rubric_weight') {
      // المضاعفة تحدث فعلًا في تركيبة غير متساوية، ولا تحدث في المتساوية؛ فإن بلغته تركيبة متساوية فالنص يستثنيها
      const rs = reach[p.key] || [];
      check(RUBRIC_DIMS.has(d), `${tag}: لا معيار تقييم للإطار`);
      check(rs.some((lv) => rubricPriority(lv, d) === d), `${tag}: لا تركيبة يتضاعف فيها الوزن`);
      check(rs.filter(allEqual).every((lv) => rubricPriority(lv, d) === null), `${tag}: وزن مضاعف عند تساوي المستويات`);
      check(/مضاعف/.test(txt), `${tag}: الوعد غير مذكور`);
      if (rs.some(allEqual)) check(txt.includes('ما لم تتساوَ مستوياتك في الأطر الثلاثة'), `${tag}: الوعد لا يستثني تساوي المستويات`);
    } else if (pr.kind === 'equal_weight') {
      const rs = reach[p.key] || [];
      check(rs.length > 0 && rs.every((lv) => allEqual(lv) && rubricPriority(lv, d) === null), `${tag}: تبلغه تركيبة يتضاعف فيها الوزن`);
      check(!/مضاعف/.test(txt) && /بوزن واحد/.test(txt), `${tag}: النص لا يقول «بوزن واحد» أو يعد بالمضاعفة`);
    }
    else if (pr.kind === 'requirement') {
      const r = state.requirements.find((x) => x.code === pr.code);
      const st = state.stages.find((s) => s.key === r?.stage_key);
      check(r && r.active && st?.active !== false, `${tag}: المتطلب غير مفعّل`);
      check(r && r.dimension === d && r.level === p.level, `${tag}: المتطلب ليس لهذا الإطار والمستوى`);
    } else check(false, `${tag}: نوع وعد غير معروف`);
  }
  check(p.promises.filter((x) => x.kind === 'rubric_weight' || x.kind === 'equal_weight').length === 1, `${p.key}: قاعدة الوزن غير محددة`);
  // كل مختبر يصل هذا الإطار والمستوى مذكور، ولا اسم مختبر في النص بلا وعد
  const promisedLabs = new Set(p.promises.filter((x) => x.kind === 'lab').map((x) => x.key));
  for (const l of myLabs) check(promisedLabs.has(l.key), `${p.key}: المختبر «${l.title_ar}» يصل المستوى ولا يذكره الملف`);
  for (const l of labs) if (!myLabs.includes(l) && txt.includes(l.title_ar) && l.dimension === d) check(false, `${p.key}: يذكر «${l.title_ar}» ولا يصله`);
  // متطلبات المستوى المفعّلة كلها مذكورة
  const reqs = state.requirements.filter((r) => r.active && r.dimension === d && r.level === p.level);
  for (const r of reqs) check(p.promises.some((x) => x.kind === 'requirement' && x.code === r.code), `${p.key}: متطلب المستوى ${r.code} غير مذكور`);
  // المشروع التطبيقي المشتق يتعمق في الفصول نفسها
  const proj = trackProject(models, lv, 'project', d);
  check(proj && proj.deep.length > 0, `${p.key}: لا فصول تعمق في المشروع التطبيقي`);
}

// ── 4) المختبرات بالمستوى ──
const RANK = { beginner: 0, intermediate: 1, advanced: 2 };
for (const l of labs) {
  const ch = state.chapters.find((c) => c.dimension === l.dimension && c.chapter_key === l.chapter_key);
  check(ch && RANK[l.min_level] >= RANK[ch.min_level], `${l.key}: المختبر (${l.min_level}) قبل بابه ${l.chapter_key} (${ch?.min_level})`);
  check(l.audience === 'all' || LABS.granted_why[l.key], `${l.key}: بمنحة يدوية بلا مبرر`);
  check(l.key in LABS.audience, `${l.key}: لا قرار جمهور في labs.json`);
}
const table = [];
for (const d of DIMS) for (const lv of LV) {
  const seen = labVisible(labs, { levels: { [d]: lv }, participantId: 'x' }).filter((l) => l.dimension === d);
  check(seen.length > 0, `${d}/${lv}: لا مختبر يصل المستوى`);
  table.push({ الإطار: DIM_AR[d], المستوى: LEVEL_AR[lv], العدد: seen.length, المختبرات: seen.map((l) => l.title_ar).join('، ') });
}
const granted = labs.filter((l) => l.audience === 'granted').map((l) => l.title_ar);

// ── 5) النماذج ──
const imp = (lv) => modelsFor(models, { milestone: lv, impact: lv, leadership: lv }, 'project').filter((m) => m.dimension === 'impact');
const impCap = (lv) => capstoneModels(models, { milestone: lv, impact: lv, leadership: lv }, 'project').filter((m) => m.dimension === 'impact');
check(imp('beginner').length >= 2, `الأثر التأسيسي: ${imp('beginner').length} نموذج`);
check(impCap('beginner').length >= 2, `الأثر التأسيسي: ${impCap('beginner').length} فصل في الوثيقة`);
check(impCap('advanced').some((m) => m.key === 'impact-report'), 'تقرير الأثر غائب عن وثيقة الأثر الاحترافي');
check(!impCap('intermediate').some((m) => m.key === 'impact-report'), 'تقرير الأثر يظهر للمتوسط');
const toc = (lv) => fieldsFor(byKey['theory-of-change'].fields, lv, 'project', false).map((f) => f.key);
check(JSON.stringify(toc('beginner')) === JSON.stringify(['program', 'impact', 'chain']), `نظرية التغيير للتأسيسي: ${toc('beginner')}`);
check(toc('intermediate').includes('weakest') && toc('intermediate').includes('test') && !toc('intermediate').includes('external'), 'نظرية التغيير للمتوسط');
const lead = modelsFor(models, { milestone: 'beginner', impact: 'beginner', leadership: 'beginner' }, 'project').map((m) => m.key);
check(lead.includes('conflict-mode'), 'تشخيص نمط الخلاف لا يصل القيادة التأسيسية');
check(labs.find((l) => l.key === 'conflict-modes')?.min_level === byKey['conflict-mode'].min_level, 'مستوى نموذج الخلاف ≠ مستوى مختبره');
for (const a of M.add_fields) {
  const m = byKey[a.model];
  const at = (lv) => fieldsFor(m.fields, lv, 'project', false).some((f) => f.key === a.field.key);
  check(at('advanced') && !at('intermediate') && !at('beginner'), `${a.model}.${a.field.key}: لا يظهر للاحترافي وحده`);
  const keys = m.fields.map((f) => f.key);
  check(new Set(keys).size === keys.length, `${a.model}: مفاتيح حقول مكررة`);
  check(keys.indexOf(a.field.key) < keys.indexOf('track_depth'), `${a.model}.${a.field.key}: بعد «تعمق المسار»`);
}
// كل نموذج راكد صار يتعمق للاحترافي
for (const k of ['initiative-charter', 'benefits-register', 'transformation-story', 'stage-gate', 'wbs']) {
  const n = (lv) => fieldsFor(byKey[k].fields, lv, 'project', false).length;
  check(n('advanced') > n('intermediate'), `${k}: الاحترافي = المتوسط`);
}

// ── التقرير ──
console.log('\nملفات التعريف التسعة:');
console.table(profiles.map((p) => ({ المفتاح: p.key, العنوان: p.title_ar, English: p.title_en, 'افتراضي لـ': tracks.filter((t) => t.profile_key === p.key).map((t) => t.key).join(' ') || '—', 'تبلغه': (reach[p.key] || []).length })));
console.log('المختبرات بالمستوى (تلقائيًا، audience = all):');
console.table(table);
console.log(`بمنحة المستشار فقط: ${granted.join('، ') || 'لا شيء'}`);
console.log(`نماذج الأثر: تأسيسي ${imp('beginner').map((m) => m.key).join('، ')} · متوسط ${imp('intermediate').length} · احترافي ${imp('advanced').length} (في الوثيقة: ${impCap('advanced').map((m) => m.key).join('، ')})`);
if (fails.length) {
  console.error(`\n✗ ${fails.length} خلل:\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log('\n✓ كل الفحوص سليمة');
