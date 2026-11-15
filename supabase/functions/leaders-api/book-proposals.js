// ════════════════════════════════════════════════════════════════
// مقترحات تعديل الكتاب الأم (المرحلة 4، الخطوة 1، اعتمدها المالك 2026-11-15): منطق خالص بلا قاعدة
// ════════════════════════════════════════════════════════════════
// لا كتابة مباشرة في نص الكتاب: التعديل مقترح على قسم بعينه، يُعرض على اللجنة بالفرق، ويعتمده المدير العام،
// ثم يدخل إصدارًا جديدًا للكتاب (الخطوة 2). المقاس (اختبار الباب) لا يُقترح هنا، فمصدره المستودع وحده.
import { lintHandbookMd } from './logic.js';
import { headingsOf } from './master-book.js';

export const PROPOSAL_STATUS = ['draft', 'review', 'approved', 'rejected', 'withdrawn', 'released'];
export const PROPOSAL_AR = { draft: 'مسودة', review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مردود', withdrawn: 'مسحوب', released: 'في إصدار' };
export const REASON_MIN = 10;
export const PROPOSED_MAX = 20000;
const OPEN = /^:::\s*((?:min|only|scope)=\S+(?:\s+(?:min|only|scope)=\S+)*)\s*$/;

/** أقسام الباب نصًا خامًا بمفاتيحها (headingsOf)، فتُستبدل كما هي بوسوم مستواها.
 *  الوسم الفاتح الذي يسبق العنوان مباشرة جزء من القسم، فلا يبقى القسم السابق بكتلة مفتوحة */
export function rawSections(md) {
  const lines = String(md || '').split('\n');
  const keys = headingsOf(md).filter((h) => h.level === 2).map((h) => h.key);
  const out = [{ key: '', lines: [] }];
  let k = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      const prev = out[out.length - 1];
      const carry = [];
      while (prev.lines.length && OPEN.test(prev.lines[prev.lines.length - 1])) carry.unshift(prev.lines.pop());
      out.push({ key: keys[k++], lines: [...carry, line] });
    } else out[out.length - 1].lines.push(line);
  }
  return out.filter((s, i) => i > 0 || s.lines.some((l) => l.trim())).map((s) => ({ key: s.key, md: s.lines.join('\n') }));
}
export const sectionSource = (md, key) => rawSections(md).find((s) => s.key === key)?.md ?? null;
/** الباب بعد استبدال قسم واحد بنصه المقترح، أو null إن لم يوجد القسم */
export function replaceSection(md, key, next) {
  const secs = rawSections(md);
  const i = secs.findIndex((s) => s.key === key);
  if (i < 0) return null;
  // السطر الفارغ الذي يفصل القسم عن تاليه يبقى كما كان، فلا يتغير في الملف إلا ما اقتُرح
  secs[i] = { key, md: String(next).replace(/\s+$/, '') + (secs[i].md.match(/\n*$/)?.[0] || '') };
  return secs.map((s) => s.md).join('\n');
}

/** تحقق المقترح: القسم قائم، والنص مختلف وغير فارغ، والكتل متوازنة، والسبب مكتوب
 * @param {{ module_id?: string, section?: string, proposed_md?: string, reason?: string }} b @param {{ id: string, body_md: string, min_level?: string }} mod */
export function checkProposal(b, mod) {
  const section = String(b.section ?? '');
  const proposed = String(b.proposed_md ?? '').replace(/\r/g, '').trim();
  const reason = String(b.reason ?? '').trim();
  if (!mod) return { error: 'الباب غير موجود' };
  const base = sectionSource(mod.body_md, section);
  if (base == null) return { error: 'القسم غير موجود في الباب، فقد يكون تغيّر. أعد تحميل الكتاب' };
  if (!proposed) return { error: 'اكتب النص المقترح' };
  if (proposed.length > PROPOSED_MAX) return { error: 'النص المقترح أطول من المسموح' };
  if (proposed === base.trim()) return { error: 'لم يتغير شيء عن النص الحالي' };
  if (reason.length < REASON_MIN) return { error: `اكتب سبب التعديل (${REASON_MIN} أحرف على الأقل): ما الذي يتحسن ولمن` };
  // قسم بعنوان لا يُحذف عنوانه بالمقترح: الحذف إلغاء قسم يمر بسجل الهويات في الإصدار
  if (section && !/^\s*(?::::[^\n]*\n)*##\s+/.test(proposed)) return { error: 'أبقِ عنوان القسم (## ...) في أول النص. حذف القسم كله قرار إصدار لا مقترح نص' };
  const next = replaceSection(mod.body_md, section, proposed);
  const errs = lintHandbookMd(next, mod.min_level || 'beginner').filter((x) => x.level === 'error');
  if (errs.length) return { error: `النص المقترح يكسر بنية الباب: ${errs.map((x) => x.msg).join('؛ ')}` };
  return { value: { module_id: mod.id, section, base_md: base, proposed_md: proposed, reason } };
}

// من يفعل ماذا: الكاتب يعدّل مسودته ويعرضها ويسحبها، والمدير العام يعتمد أو يرد ما قيد المراجعة
/** @param {{ kind: string, ref: string, write: boolean, superAdmin?: boolean }} v @param {any} p @param {string} to */
export function canMove(v, p, to) {
  if (!v?.write || v.kind !== 'admin') return false;
  const mine = p.author_ref === v.ref;
  if (to === 'review' || to === 'withdrawn' || to === 'draft') return mine && ['draft', 'review'].includes(p.status) && p.status !== to;
  if (to === 'approved' || to === 'rejected') return !!v.superAdmin && p.status === 'review';
  return false;
}
export const canEdit = (v, p) => !!v?.write && v.kind === 'admin' && p.author_ref === v.ref && ['draft', 'review'].includes(p.status);
// مقترح على نص تغيّر بعده (أصله لم يعد هو القسم الحالي): يُعرض «متقادم» ولا يُعتمد حتى يُحدَّث
export const isStale = (p, mod) => sectionSource(mod?.body_md, p.section) !== p.base_md;

/** فرق الكلمات بين نصين للعرض: [{ t: 'same'|'del'|'add', s }] (أطول تتابع مشترك، بحد للحجم) */
export function wordDiff(a, b, max = 2500) {
  const A = String(a || '').split(/(\s+)/), B = String(b || '').split(/(\s+)/);
  if (A.length * B.length > max * max) return [{ t: 'del', s: a }, { t: 'add', s: b }];
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (t, s) => { const last = out[out.length - 1]; if (last && last.t === t) last.s += s; else out.push({ t, s }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push('del', A[i++]); else push('add', B[j++]);
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('add', B[j++]);
  return out;
}

// من يرى المقترح: مسودة كاتبها له وحده، وما عُرض على اللجنة يراه المراجعون كلهم (الخبراء يعلّقون ولا يقررون)
export function visibleTo(v, p) {
  if (p.status === 'draft') return v?.kind === 'admin' && p.author_ref === v.ref;
  if (p.status === 'withdrawn') return v?.kind === 'admin';
  return true;
}
/** المقترح كما يصل القارئ: بقسمه الحالي، ومتقادم أم لا، وما يملكه القارئ من أفعال
 * @param {any} v @param {any} p @param {any} mod الباب الحالي @param {string|null} key مفتاح القسم الحالي بالهوية */
export function proposalView(v, p, mod, key = null) {
  const section = key ?? p.section;
  const stale = ['draft', 'review', 'approved'].includes(p.status) && isStale({ ...p, section }, mod);
  const can = Object.fromEntries(['review', 'withdrawn', 'draft', 'approved', 'rejected'].map((t) => [t, canMove(v, p, t) && !(t === 'approved' && stale)]));
  return {
    id: p.id, module_id: p.module_id, section, status: p.status, status_ar: PROPOSAL_AR[p.status] || p.status,
    base_md: p.base_md, proposed_md: p.proposed_md, reason: p.reason, author_name: p.author_name,
    decided_by: p.decided_by ? String(p.decided_by).split('@')[0] : null, decided_at: p.decided_at, decision_note: p.decision_note || '',
    release_version: p.release_version || null, created_at: p.created_at, updated_at: p.updated_at,
    stale, mine: p.author_ref === v?.ref && v?.kind === 'admin', edit: canEdit(v, p), can,
  };
}
// عدد المقترحات المفتوحة (قيد المراجعة) لكل باب ولكل قسم، كعدادات التعليقات
export function proposalCounts(list) {
  const byModule = {}, bySection = {};
  for (const p of list) {
    if (p.status !== 'review') continue;
    byModule[p.module_id] = (byModule[p.module_id] || 0) + 1;
    const k = `${p.module_id}|${p.section}`;
    bySection[k] = (bySection[k] || 0) + 1;
  }
  return { byModule, bySection, review: list.filter((p) => p.status === 'review').length, approved: list.filter((p) => p.status === 'approved').length };
}
