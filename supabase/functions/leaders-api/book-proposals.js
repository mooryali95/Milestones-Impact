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
export const REASON_MAX = 2000;
export const PROPOSED_MAX = 20000;
// عنوان القسم بالقاعدة نفسها في headingsOf (نص بعد ##)، فلا يختلف عدد الأقسام عن عدد مفاتيحها
const H2 = /^##\s+\S/;
const HEADING_LINE = /^(#{2,3})\s+(.+?)\s*$/;
const OPEN = /^:::\s*((?:min|only|scope)=\S+(?:\s+(?:min|only|scope)=\S+)*)\s*$/;

/** أقسام الباب نصًا خامًا بمفاتيحها (headingsOf)، فتُستبدل كما هي بوسوم مستواها.
 *  الوسم الفاتح الذي يسبق العنوان مباشرة جزء من القسم، فلا يبقى القسم السابق بكتلة مفتوحة */
export function rawSections(md) {
  const lines = String(md || '').split('\n');
  const keys = headingsOf(md).filter((h) => h.level === 2).map((h) => h.key);
  const out = [{ key: '', lines: [] }];
  let k = 0;
  for (const line of lines) {
    if (H2.test(line)) {
      const prev = out[out.length - 1];
      const carry = [];
      while (prev.lines.length && OPEN.test(prev.lines[prev.lines.length - 1])) carry.unshift(prev.lines.pop());
      out.push({ key: keys[k++], lines: [...carry, line] });
    } else out[out.length - 1].lines.push(line);
  }
  return out.filter((s, i) => i > 0 || s.lines.some((l) => l.trim())).map((s) => ({ key: s.key, md: s.lines.join('\n') }));
}
export const sectionSource = (md, key) => rawSections(md).find((s) => s.key === key)?.md ?? null;
// سؤال التأمل جزء من الباب يُقترح تعديله كالأقسام (المرحلة 4، الخطوة 3)، بمفتاح لا يكون عنوانًا
export const REFLECTION = '@reflection';
export const REFLECTION_MAX = 600;
export const targetLabel = (section) => (section === REFLECTION ? 'سؤال التأمل' : section || 'مقدمة الباب');
/** نص الهدف في الباب الحالي: القسم من المتن، أو سؤال التأمل */
export const targetSource = (mod, section) => (section === REFLECTION ? String(mod?.reflection_ar ?? '') : sectionSource(mod?.body_md, section));
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
  if (section === REFLECTION) {
    const base = String(mod.reflection_ar ?? '');
    if (!proposed) return { error: 'اكتب سؤال التأمل المقترح' };
    if (proposed.length > REFLECTION_MAX) return { error: `سؤال التأمل أطول من ${REFLECTION_MAX} حرف` };
    if (proposed === base.trim()) return { error: 'لم يتغير سؤال التأمل' };
    if (reason.length < REASON_MIN) return { error: `اكتب سبب التعديل (${REASON_MIN} أحرف على الأقل): ما الذي يتحسن ولمن` };
    return { value: { module_id: mod.id, section, base_md: base, proposed_md: proposed, reason } };
  }
  const base = sectionSource(mod.body_md, section);
  if (base == null) return { error: 'القسم غير موجود في الباب، فقد يكون تغيّر. أعد تحميل الكتاب' };
  if (!proposed) return { error: 'اكتب النص المقترح' };
  if (proposed.length > PROPOSED_MAX) return { error: 'النص المقترح أطول من المسموح' };
  if (proposed === base.trim()) return { error: 'لم يتغير شيء عن النص الحالي' };
  if (reason.length < REASON_MIN) return { error: `اكتب سبب التعديل (${REASON_MIN} أحرف على الأقل): ما الذي يتحسن ولمن` };
  if (reason.length > REASON_MAX) return { error: `سبب التعديل أطول من ${REASON_MAX} حرف` };
  // نص الكتاب يدخل ترحيلًا بين وسوم $…$: لا يُقبل وسم مثلها داخله
  if (/\$[A-Za-z0-9_]*\$/.test(proposed)) return { error: 'النص يحوي وسمًا بين علامتي $ ($…$)، وهو محجوز لترحيل الكتاب. احذفه أو افصل العلامتين' };
  // عنوان بلا نص يُسقط القسم من فهرس الأقسام ويزيح مفاتيح ما بعده
  const empty = proposed.split('\n').find((l) => /^#{2,3}(\s|$)/.test(l) && !l.replace(/^#{2,3}/, '').replace(/[*_\s]/g, ''));
  if (empty !== undefined) return { error: 'في النص عنوان بلا نص (## أو ### وحدها). اكتب العنوان أو احذف السطر' };
  // قسم بعنوان لا يُحذف عنوانه بالمقترح: الحذف إلغاء قسم يمر بسجل الهويات في الإصدار
  if (section && !/^\s*(?::::[^\n]*\n)*##\s+/.test(proposed)) return { error: 'أبقِ عنوان القسم (## ...) في أول النص. حذف القسم كله قرار إصدار لا مقترح نص' };
  const next = replaceSection(mod.body_md, section, proposed);
  const errs = lintHandbookMd(next, mod.min_level || 'beginner').filter((x) => x.level === 'error');
  if (errs.length) return { error: `النص المقترح يكسر بنية الباب: ${errs.map((x) => x.msg).join('؛ ')}` };
  // العناوين المكررة تُرقَّم في الباب كله ((2)، (3)…)، وهويات الأقسام تتبع المفاتيح: لا يغيّر مقترح مفاتيح أقسام غيره
  const moved = outsideKeysChange(mod.body_md, section, proposed, next);
  if (moved) return { error: `المقترح يغيّر ترقيم عنوان مكرر في قسم آخر من الباب («${moved}»). اجعل العنوان الجديد مميزًا عن عناوين الباب` };
  return { value: { module_id: mod.id, section, base_md: base, proposed_md: proposed, reason } };
}

// مفاتيح العناوين خارج القسم المستهدف قبل المقترح وبعده: أول مفتاح تغيّر، أو null
function outsideKeysChange(before, section, proposed, after) {
  const secs = rawSections(before);
  const i = secs.findIndex((s) => s.key === section);
  const count = (md) => String(md).split('\n').filter((l) => HEADING_LINE.test(l)).length;
  const pre = secs.slice(0, i).reduce((n, s) => n + count(s.md), 0);
  const kb = headingsOf(before).map((h) => h.key), ka = headingsOf(after).map((h) => h.key);
  const ob = [...kb.slice(0, pre), ...kb.slice(pre + count(secs[i].md))];
  const oa = [...ka.slice(0, pre), ...ka.slice(pre + count(proposed))];
  for (let k = 0; k < Math.max(ob.length, oa.length); k++) if (ob[k] !== oa[k]) return ob[k] || oa[k];
  return null;
}

// من يفعل ماذا: الكاتب يعدّل مسودته ويعرضها ويسحبها، والمدير العام يعتمد أو يرد ما قيد المراجعة
/** @param {{ kind: string, ref: string, write: boolean, superAdmin?: boolean }} v @param {any} p @param {string} to */
export function canMove(v, p, to) {
  if (!v?.write || v.kind !== 'admin') return false;
  const mine = p.author_ref === v.ref;
  if (to === 'review') return mine && p.status === 'draft';
  // المعتمد الذي تخطاه الإصدار (تغيّر قسمه بعده): يعيده كاتبه مسودةً ليحدّثه، أو يسحبه هو أو المدير العام
  if (to === 'draft') return mine && ['review', 'approved'].includes(p.status);
  if (to === 'withdrawn') return (mine && ['draft', 'review', 'approved'].includes(p.status)) || (!!v.superAdmin && p.status === 'approved');
  if (to === 'approved' || to === 'rejected') return !!v.superAdmin && p.status === 'review';
  return false;
}
export const canEdit = (v, p) => !!v?.write && v.kind === 'admin' && p.author_ref === v.ref && ['draft', 'review'].includes(p.status);
// مقترح على نص تغيّر بعده (أصله لم يعد هو القسم الحالي): يُعرض «متقادم» ولا يُعتمد حتى يُحدَّث
export const isStale = (p, mod) => targetSource(mod, p.section) !== p.base_md;

/** تعديل الباب كاملًا من محرر الاستوديو ← مقترح لكل قسم تغيّر: { changes: [{ section, proposed }] } أو { error }.
 *  الأقسام تُطابق بموضعها إن بقي عددها، والقسم الجديد يُلحق بالذي قبله، وحذف قسم أو دمج قسمين قرار إصدار لا مقترح */
export function splitEdit(oldMd, newMd) {
  const A = rawSections(oldMd), B = rawSections(String(newMd || '').replace(/\r/g, ''));
  const t = (x) => x.md.replace(/\s+$/, '');
  let i = 0;
  while (i < A.length && i < B.length && t(A[i]) === t(B[i])) i++;
  if (i === A.length && i === B.length) return { changes: [] };
  let ja = A.length - 1, jb = B.length - 1;
  while (ja >= i && jb >= i && t(A[ja]) === t(B[jb])) { ja--; jb--; }
  const join = (xs) => xs.map(t).join('\n\n');
  if (A.length === B.length) {
    const changes = [];
    for (let k = i; k <= ja; k++) if (t(A[k]) !== t(B[k])) changes.push({ section: A[k].key, proposed: t(B[k]) });
    return { changes };
  }
  if (ja < i) {
    // إضافة قسم أو أكثر دون مساس بغيرها: تُلحق بالقسم السابق (أو تسبق الأول)
    if (i === 0) return { changes: [{ section: A[0].key, proposed: join(B.slice(0, jb + 2)) }] };
    return { changes: [{ section: A[i - 1].key, proposed: join(B.slice(i - 1, jb + 1)) }] };
  }
  if (ja === i && jb >= i) return { changes: [{ section: A[i].key, proposed: join(B.slice(i, jb + 1)) }] };
  return { error: 'التعديل يحذف قسمًا أو يدمج أقسامًا. حذف القسم قرار إصدار: عدّل نص كل قسم على حدة، أو اقترح الحذف في تعليق' };
}

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
