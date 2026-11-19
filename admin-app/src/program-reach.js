// ════════════════════════════════════════════════════════════════
// لمن يسري البرنامج، ومن يصله تعديل رحلته (P9 في تصور البرامج والجهات والدفعات)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لـ«من يتبع البرنامج الآن» هو عدد أعضاء كل دفعة كما يحسبه الخادم بقاعدة الالتحاق (members في
// admin.programs، memberCounts وpickCohort): المسجّل صراحة ومن يتبع الدفعة بجهته. فلا يُعد هنا شيء من جديد، ولا يُقال
// «يسري على» دفعة لا عضو فيها.
import { peopleAr, peopleGenAr } from './team.js';

const membersOf = (c) => Number(c?.members ?? c?.enrolled ?? 0) || 0;
const liveOn = (pid, cohorts) => (cohorts || []).filter((c) => c.program_id === pid && c.status !== 'closed');

/**
 * سطر «يسري على» في بطاقة البرنامج: الأعضاء الفعليون مقسمين بدفعاتهم، لا عدد الدفعات.
 * @param {{ id: string }} p @param {any[]} cohorts @param {(id: string) => string} orgName
 * @returns {{ on: boolean, total: number, text: string }}
 */
export function programReach(p, cohorts, orgName = () => '') {
  const live = liveOn(p?.id, cohorts);
  if (!live.length) return { on: false, total: 0, text: 'لا توجد دفعة على هذا البرنامج بعد، فلا يسري على أي مشارك. أنشئ له دفعة لجهة أو لأفراد متى احتجته.' };
  const withPeople = live.filter((c) => membersOf(c) > 0);
  const total = withPeople.reduce((n, c) => n + membersOf(c), 0);
  if (!total) return { on: false, total: 0, text: `${live.length === 1 ? 'دفعته' : 'دفعاته'} بلا أعضاء بعد، فلا يسري الآن على أي مشارك.` };
  const where = (c) => (c.is_default ? 'الدفعة المفتوحة' : c.organization_id ? orgName(c.organization_id) || c.name : `«${c.name}»`);
  const parts = withPeople.sort((a, b) => membersOf(b) - membersOf(a)).map((c) => `${where(c)} ${membersOf(c)}`);
  return { on: true, total, text: `يسري على ${peopleGenAr(total)}: ${parts.join('، ')}` };
}

/**
 * من يصله تعديل رحلة البرنامج: كل دفعة غير مغلقة باسمها ونسختها وأعضائها. المثبتة على نسخة لا يصلها التعديل حتى
 * تُحفظ نسخة وتُرقّى إليها، وغير المثبتة (إن بقيت) يصلها فورًا فتُسمّى أولًا.
 * @param {string} pid @param {any[]} programs @param {any[]} cohorts
 */
export function journeyAudience(pid, programs, cohorts) {
  const prog = (programs || []).find((p) => p.id === pid);
  const numberOf = (c) => prog?.versions?.find((v) => v.id === c.program_version_id)?.number ?? null;
  const rows = liveOn(pid, cohorts).map((c) => ({ id: c.id, name: c.name, members: membersOf(c), version: numberOf(c), pinned: !!c.program_version_id }));
  return {
    immediate: rows.filter((r) => !r.pinned),
    pinned: rows.filter((r) => r.pinned),
    latest: prog?.versions?.[0]?.number ?? null,
  };
}

const cohortLine = (r) => `«${r.name}»${r.pinned ? ` على النسخة ${r.version ?? '؟'}` : ''} (${r.members ? peopleAr(r.members) : 'بلا أعضاء بعد'})`;

/** الجمل التي يقرؤها المشرف في محرر الرحلة: لا يقول «يظهر فورًا» إلا لدفعة يصلها فعلًا */
export function journeyAudienceAr(a) {
  const out = [];
  if (a.immediate.length) out.push({ tone: 'warn', text: `يصل ما تحرره هنا فورًا إلى ${a.immediate.length === 1 ? 'الدفعة غير المثبتة' : 'الدفعات غير المثبتة'}: ${a.immediate.map(cohortLine).join('، ')}. ثبّتها على نسخة من «البرامج والدفعات» لتحميها.` });
  out.push({ tone: 'info', text: a.pinned.length
    ? `ما تحرره هنا مسودة البرنامج، ولا يصل إلى ${a.pinned.length === 1 ? 'الدفعة المثبتة' : 'الدفعات المثبتة'} حتى تحفظه نسخة من «البرامج والدفعات» وترقّي إليها كل دفعة بنفسك بعد مراجعة الفرق: ${a.pinned.map(cohortLine).join('، ')}.`
    : 'ما تحرره هنا مسودة البرنامج، ولا دفعة عليه الآن. الدفعة الجديدة تُثبَّت على آخر نسخة محفوظة منه، فاحفظ نسخة بعد التعديل.' });
  return out;
}
