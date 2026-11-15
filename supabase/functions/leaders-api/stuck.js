// ════════════════════════════════════════════════════════════════
// إشارات التعثر في وثيقة المبادرة، ومسار السؤال إلى مختص (مرافق بناء المبادرة 4د)
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md. لا تتبع إضافي ولا جدول جديد: الإشارة تُشتق مما يرسله
// الخادم أصلًا (حالة البطاقة، وفحوص الاتساق، وآخر حفظ لكل فصل). منطق خالص يقرؤه تطبيق المشارك واختباراته.

export const STUCK_DAYS = Object.freeze({ check: 7, draft: 14 });

// الفصول التي يُصلح فيها كل فحص اتساق: الإشارة تقول للمشارك أين يذهب، والسؤال يحمل اسم الفصل
export const CHECK_CHAPTERS = Object.freeze({
  sponsor: ['initiative-charter'], 'do-nothing': ['options-analysis'], 'wbs-owner': ['wbs'],
  'raci-cover': ['governance', 'wbs'], 'raci-a': ['governance'], 'cost-cover': ['cost-plan', 'wbs'], 'cost-envelope': ['cost-plan'],
  dates: ['schedule'], deps: ['schedule'], window: ['schedule', 'initiative-charter'], 'risk-owner': ['raid'], 'risk-link': ['raid', 'wbs'],
  'benefit-owner': ['benefits-register'], evidence: ['evidence-plan', 'benefits-register'], procurement: ['procurement'],
  tranches: ['roadmap'], weights: ['portfolio-review'],
});

const daysSince = (t, now) => { const d = Date.parse(t || ''); return Number.isFinite(d) ? Math.floor((now - d) / 864e5) : null; };

/**
 * إشارات التعثر مرتبة بالأولوية: البطاقة المعادة، ثم الفحوص اللازمة، ثم بقية الفحوص، ثم الفصول المتوقفة
 * @param {{ sections?: any[], checks?: any[], card?: { state?: string } | null, now?: number }} input
 * @returns {{ key: string, kind: 'card' | 'check' | 'draft', title: string, detail: string | null, chapter: any, days: number | null }[]}
 */
export function stuckSignals({ sections = [], checks = [], card = null, now = Date.now() } = {}) {
  const by = Object.fromEntries(sections.map((s) => [s.key, s]));
  const out = [];
  if (card?.state === 'returned' && by['initiative-charter']) {
    out.push({ key: 'card', kind: 'card', title: 'أعاد المستشار بطاقة مبادرتك', detail: 'افتح البطاقة لترى ملاحظاته، ثم عدّلها وسلّمها من جديد.', chapter: by['initiative-charter'], days: null });
  }
  const failing = checks.filter((c) => !c.ok).sort((a, b) => Number(!!b.blocking) - Number(!!a.blocking));
  for (const c of failing) {
    const chapters = (CHECK_CHAPTERS[c.key] || []).map((k) => by[k]).filter(Boolean);
    if (!chapters.length) continue;
    // الفحص فاشل وفصوله لم تُلمس منذ أسبوع: محاولة ذاتية كافية، والتوقف إشارة
    const ages = chapters.map((s) => daysSince(s.updated_at, now));
    if (ages.some((d) => d == null || d < STUCK_DAYS.check)) continue;
    out.push({ key: `check:${c.key}`, kind: 'check', title: c.title, detail: c.detail || null, chapter: chapters[0], days: Math.min(...ages) });
  }
  for (const s of sections) {
    if (s.complete || !['draft', 'returned', null, undefined].includes(s.status)) continue;
    const d = daysSince(s.updated_at, now);
    // بدأه ثم توقف أسبوعين؛ ما لم يُبدأ بعد ليس تعثرًا
    if (d == null || d < STUCK_DAYS.draft) continue;
    if (out.some((x) => x.chapter?.key === s.key)) continue;
    out.push({ key: `draft:${s.key}`, kind: 'draft', title: `«${s.title}» متوقف منذ ${d} يومًا`, detail: s.missing ? `بقي فيه ${s.missing} من الحقول.` : null, chapter: s, days: d });
  }
  return out;
}

// نوع الحاجة يختار دور الخبير: المنهج للخبير الموضوعي، والتعثر للموجّه، والجودة للمستشار (قرار التصور §4)
export const NEED_TYPES = Object.freeze([
  { key: 'method', label: 'لا أفهم المطلوب أو الأداة', role: 'specialist' },
  { key: 'stuck', label: 'علقت ولا أعرف كيف أكمل', role: 'coach' },
  { key: 'quality', label: 'أريد رأيًا في جودة ما كتبت', role: 'advisor' },
]);
export const roleForNeed = (need) => NEED_TYPES.find((n) => n.key === need)?.role || 'coach';

/** وصف الحاجة معبأً بالسياق: يبدأ الخبير وهو يعرف الفصل والفحص، ويكمل المشارك سؤاله بكلماته */
export function askNote(chapterTitle, detail = null) {
  return [chapterTitle ? `فصل «${chapterTitle}» في وثيقة مبادرتي` : 'وثيقة مبادرتي', detail ? `(${String(detail).slice(0, 200)})` : null].filter(Boolean).join(' ') + '. سؤالي: ';
}
