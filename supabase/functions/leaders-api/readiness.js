// ════════════════════════════════════════════════════════════════
// جاهزية الإطلاق: مصدر واحد للأحكام والنصوص
// ════════════════════════════════════════════════════════════════
// تقرؤه حالة النظام في اللوحة وتقرير الأسبوع (system.ts) وبوابات المراحل (scripts/ops/stage-gates.mjs)، كلٌّ بقراءته
// من القاعدة (الدالة بالعميل، والبوابات بالاستعلام المباشر)، ثم الحكم هنا على الصفوف نفسها. كانت اللوحة تعرض «3 من 4»
// والبوابات «1 من 8» (لا تعرف اللوحة مستشار الدفعة ولا المواعيد ولا الإعداد الختامي ولا إصدار المحتوى ولا قناة
// التنبيه)، وكانت تطلب تطبيق ترحيل مؤجل بقرار. منطق نقي بلا قاعدة، فيُختبر في vitest.

// أسرار الدالة التي لا قيمة افتراضية آمنة لها: بلا مفتاح التوقيع لا تصدر شهادة، وبلا قناة التنبيه لا إنذار بغير البريد.
// البقية لها افتراضي آمن في docs/SECRETS.md. البوابة تشترطها بأسمائها، وحالة النظام تفحص قيمها
import { sessionsFor, usesHandbook } from './cohort-setup.js';

export const REQUIRED_SECRETS = ['LEADERS_CERT_SIGNING_KEY', 'LEADERS_ALERT_WEBHOOK'];

// ── الترحيلات ──
// الوسم من سطور الترحيل الأولى (gateOf في scripts/ops/pending-migrations.mjs، مولَّد في migrations.js بـ migrations-list.mjs):
//   blocking  يُطبَّق بسير migrate.yml قبل نشر الدوال
//   tolerant  الدوال تعمل قبله وبعده، فيُطبَّق في أقرب نافذة
//   deferred  مؤجل بقرار مسمّى في سطره، ولا تعتمد عليه الدوال، فلا يُطبَّق قبل رفع التأجيل
// بوابة النشر تعدّ فوق ذلك ما في بيان المطبّق (applied-manifest.json) حاجبًا، وهو مطبّق على الإنتاج فلا يظهر هنا
export const MIGRATION_GATE_AR = { blocking: 'حاجب', tolerant: 'متسامح', deferred: 'مؤجل بقرار' };

/** ما لم يُطبَّق بترتيب المجلد، بوسمه وملاحظته
 * @param {string[]} names @param {Iterable<string>} applied @param {Record<string, string[]>} [gates] الوسم وملاحظته */
export function pendingMigrations(names, applied, gates = {}) {
  const done = new Set(applied);
  return names.filter((n) => !done.has(n)).map((name) => {
    const [gate, note] = gates[name] || ['blocking', ''];
    return { name, gate: MIGRATION_GATE_AR[gate] ? gate : 'blocking', note: note || '' };
  });
}

/** سطر واحد بالمجموعات الثلاث (سبب بوابة المراحل وتقرير الأسبوع) @param {{ name: string, gate: string }[]} pending */
export function migrationsSummary(pending) {
  return ['blocking', 'tolerant', 'deferred']
    .map((g) => [g, pending.filter((p) => p.gate === g).map((p) => p.name)])
    .filter(([, list]) => list.length)
    .map(([g, list]) => `${MIGRATION_GATE_AR[g]}: ${list.join('، ')}`)
    .join('؛ ');
}

// ── إعدادات اللوحة قبل أول دفعة ──
const LIVE = ['open', 'running'];
const newestOf = (list, kind) => list.filter((x) => x.kind === kind)
  .sort((a, b) => (b.version ?? 0) - (a.version ?? 0) || String(b.created_at).localeCompare(String(a.created_at)))[0];

/** بنود الإعداد: القياسان والبرنامج الافتراضي والشهادة. where تبويب ضبطه في اللوحة
 * @param {{ instruments?: any[], certificate?: any, defaultPrograms?: number }} rows */
export function setupReadiness({ instruments = [], certificate = null, defaultPrograms = 0 } = {}) {
  const active = (kind) => instruments.find((x) => x.kind === kind && x.active);
  const base = active('baseline'), latest = newestOf(instruments, 'baseline'), post = active('post');
  const c = certificate || {};
  return [
    { key: 'baseline', ok: !!base && base.key === latest?.key, where: 'assessment',
      label: base ? (base.key === latest?.key ? `القياس القبلي المفعّل ${base.key}` : `المفعّل ${base.key} وأحدث نسخة ${latest.key}`) : 'لا قياس قبلي مفعّل' },
    { key: 'post', ok: !!post, where: 'assessment',
      label: post ? `القياس البعدي المفعّل ${post.key}` : 'القياس البعدي غير مفعّل، فلا يُقاس الأثر في نهاية البرنامج' },
    { key: 'program', ok: defaultPrograms > 0, where: 'programs', label: defaultPrograms ? 'برنامج افتراضي محدد' : 'لا برنامج افتراضي، فالدفعات الجديدة بلا قالب' },
    { key: 'certificate', ok: c.enabled !== false && !!c.signatory?.name && !!c.hours, where: 'certs',
      label: c.enabled === false ? 'الشهادات معطلة' : !c.signatory?.name ? 'الشهادة بلا موقّع' : !c.hours ? 'الشهادة بلا عدد ساعات' : 'الشهادة مكتملة الإعداد' },
  ];
}

// ── الإطلاق التجريبي (م2): الجهات ودفعاتها ──
// موعد قادم أو حديث (آخر 14 يومًا)، والجلسة بلا دفعة تعمّ الدفعات
const missingIn = (rows) => rows.filter((r) => !r.has).map((r) => r.name);
// ما ينقص بمعرّفه ونوعه (جهة أو دفعة): تفتح اللوحة ملف كلٍّ منها مباشرة. لا يدخل الحكم ولا النص، فالبوابات لا تتأثر
const refsIn = (rows) => rows.filter((r) => !r.has && r.id).map((r) => ({ kind: r.kind, id: r.id, name: r.name }));
// jsonb يصل كائنًا من العميل، وقد يصل نصًا من الاستعلام المباشر للبوابات
const asJson = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
// «هل للدفعة جلسات؟» من cohort-setup.js وحده: الحكم نفسه في ملف الدفعة وصفحة الجهة وهنا

/** بنود م2 الآلية من صفوف القاعدة. check معرّف نقطة البوابة، وwhere تبويب ضبطه في اللوحة (null: يُضبط خارجها)
 * @param {{ organizations?: any[], cohorts?: any[], sessions?: any[], finalEval?: unknown }} rows
 *   organizations: id, name, status · cohorts: id, name, organization_id, status, advisor_expert_id, content_release, delivery
 *   sessions: cohort_id, active, starts_at, ends_at · finalEval: programs.final_eval للبرنامج الافتراضي */
export function launchReadiness({ organizations = [], cohorts = [], sessions = [], finalEval = null } = {}, now = Date.now()) {
  const orgCohorts = cohorts.filter((c) => c.organization_id && LIVE.includes(c.status));
  const perOrg = organizations.filter((o) => o.status === 'active')
    .map((o) => ({ kind: 'org', id: o.id, name: o.name, has: cohorts.some((c) => c.organization_id === o.id && LIVE.includes(c.status)) }));
  const advisor = orgCohorts.map((c) => ({ kind: 'cohort', id: c.id, name: c.name, has: !!c.advisor_expert_id }));
  const dated = orgCohorts.map((c) => ({ kind: 'cohort', id: c.id, name: c.name, has: sessionsFor(c, sessions, now) > 0 || usesHandbook(c) }));
  const running = cohorts.filter((c) => c.status === 'running').map((c) => ({ kind: 'cohort', id: c.id, name: c.name, has: !!c.content_release }));
  const fe = asJson(finalEval);
  const finalSaved = fe != null && JSON.stringify(fe) !== '{}';
  const noOrgCohort = 'لا دفعة جهة مفتوحة أو جارية بعد';
  const judge = (rows, empty, bad, good) => {
    if (!rows.length) return { ok: false, label: empty };
    const miss = missingIn(rows);
    return { ok: !miss.length, label: miss.length ? `${bad}: ${miss.join('، ')}` : good(rows.length), ...(miss.length ? { refs: refsIn(rows) } : {}) };
  };
  return [
    { key: 'cohort-per-org', check: 'm2.cohort-per-org', where: 'programs',
      ...judge(perOrg, 'لا جهة فعّالة بعد', 'جهات فعّالة بلا دفعة مفتوحة أو جارية', (n) => `${n} جهة فعّالة، ولكلٍّ دفعة`) },
    { key: 'advisor', check: 'm2.advisor', where: 'programs',
      ...judge(advisor, noOrgCohort, 'دفعات جهات بلا مستشار أساسي', (n) => `${n} دفعة جهة، ولكلٍّ مستشار أساسي`) },
    { key: 'sessions', check: 'm2.sessions', where: 'activities',
      ...judge(dated, noOrgCohort, 'دفعات جهات بلا مواعيد قادمة ولا صيغة الكتيب', () => 'لكل دفعة جهة مواعيد قادمة أو صيغة الكتيب') },
    { key: 'final-eval', check: 'm2.final-eval', where: 'programs',
      ok: finalSaved, label: finalSaved ? 'إعداد التقييم الختامي محفوظ للبرنامج الافتراضي' : 'إعداد التقييم الختامي لم يُحفظ بعد للبرنامج الافتراضي' },
    // الإصدار يُقطع ويُثبَّت بترحيل من أداة إصدار المحتوى، لا من اللوحة
    { key: 'release-pinned', check: 'm2.release-pinned', where: null,
      ...judge(running, 'لا دفعة جارية بعد', 'دفعات جارية بلا إصدار محتوى مثبّت (يُثبَّت بترحيل إصدار المحتوى)', () => 'كل دفعة جارية بإصدار محتوى مثبّت') },
  ];
}
