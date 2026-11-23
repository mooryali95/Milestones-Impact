// ════════════════════════════════════════════════════════════════
// الحساب التجريبي للدفعة (تصور الحساب التجريبي 2026-11-19، المرحلة 2): بطاقته في ملف الدفعة
// ════════════════════════════════════════════════════════════════
// لكل دفعة حسابها التجريبي: يُنشأ عند أول فتح من هنا، ويعرض رحلة هذه الدفعة كما يراها أعضاؤها (نسخة برنامجها وخطتها
// ومواعيدها وما أُوقف من مراحلها وجلساتها). سطر الحالة: هل هو قائم، وعند أي مرحلة، ومتى استُعمل آخر مرة ومن فتحه.
// الفتح والروابط للمدير بصلاحية الكتابة، وإعادة الضبط للمدير العام وحده (الخادم هو الحارس). الدفعة المفتوحة حسابها هو
// الحساب التجريبي العام القائم. قبل ترحيل قاعدة البيانات تعرض البطاقة «غير مفعّلة بعد» ولا تفتح شيئًا.
import React, { useCallback, useEffect, useState } from 'react';
import { isSuperAdmin, L } from '../leaders.js';
import { dateTime } from '../dates.js';
import { useUI } from '../ui.jsx';
import { cohortResetConfirmAr, DemoLinks, resetConfirmAr } from '../DemoLinks.jsx';

/** سطر الحالة كما يُعرض، من رد admin.demo-cohort */
export function cohortDemoLine(s) {
  if (!s || s.failed) return '';
  if (!s.ready) return 'غير مفعّلة بعد';
  if (s.closed) return s.exists ? 'الدفعة مغلقة وحسابها التجريبي ما زال قائمًا: يحذفه المدير العام بإعادته إلى البداية' : 'الدفعة مغلقة: حُذف حسابها التجريبي عند إغلاقها، ولا يُفتح لدفعة مغلقة';
  if (!s.exists) return 'لم يُنشأ بعد: يُنشأ عند أول فتح';
  return ['قائم', s.stage ? `عند: ${s.stage}` : '', s.last_used_at ? `آخر استعمال ${dateTime(s.last_used_at)}` : 'لم يُستعمل بعد',
    s.last_opened_by ? `آخر فتح من اللوحة ${dateTime(s.last_opened_at)}` : ''].filter(Boolean).join(' · ');
}

export default function CohortDemo({ c, canWrite }) {
  const { toast, confirm } = useUI();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await L('admin.demo-cohort', { cohort_id: c.id }).catch((e) => ({ success: false, message: e?.message }));
    const next = r.success ? r : { failed: true, message: r.message, links: [] };
    setState(next);
    return next;
  }, [c.id]);
  useEffect(() => { if (canWrite) load(); }, [load, canWrite]);
  // المقدِّم يعود من نافذة الحساب إلى اللوحة: تُقرأ الحالة من جديد، فالمرحلة وآخر استعمال كما هما الآن
  useEffect(() => {
    if (!canWrite) return undefined;
    const again = () => { load(); };
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [load, canWrite]);
  if (!canWrite) return null;
  const s = state;
  const scope = s?.general ? {} : { cohort_id: c.id };
  const open = async () => {
    // النافذة تُفتح فورًا بضغطة المستخدم، ثم يُكتب فيها الرابط، فلا يمنعها المتصفح
    const w = window.open('', '_blank');
    setBusy(true);
    const r = await L('admin.demo-open', scope);
    setBusy(false);
    if (!r.success) { w?.close(); toast(r.message); load(); return; }
    if (w) w.location.href = r.url; else location.href = r.url;
    load();
  };
  const reset = async () => {
    // القائمة تُقرأ من جديد قبل السؤال: رابط أنشأه مدير آخر للتو يُذكر باسمه
    const now = await load();
    const links = now?.links || [];
    if (!(await confirm(s.general ? resetConfirmAr(links) : cohortResetConfirmAr(c.name, links), { danger: true }))) return;
    setBusy(true);
    const r = await L('admin.demo-reset', scope);
    setBusy(false);
    toast(r.success ? 'أُعيد الحساب التجريبي إلى البداية' : r.message);
    load();
  };
  const usable = s && !s.failed && s.ready && !s.closed;
  return (
    <section className="cohort-demo" data-testid="cohort-demo" aria-label="الحساب التجريبي للدفعة">
      <div className="la-row between">
        <div>
          <b>الحساب التجريبي لهذه الدفعة</b>
          <p className="la-muted">{s?.general
            ? 'الدفعة المفتوحة حسابها هو الحساب التجريبي العام: يعرض رحلتها، وهو نفسه الذي في النظرة العامة.'
            : 'لشرح الرحلة أمام مشاركي هذه الدفعة: يعرض مراحلها وخطتها ومواعيدها وجلساتها كما يرونها، وفي أعلاه شريط «حساب تجريبي» باسم الدفعة وأدوات التخطي. ليس عضوًا فيها: لا يدخل عددها ولا مقاعدها ولا حضورها ولا تقاريرها، ولا يرى أسماء أعضائها ولا بياناتهم، ولا يصله بريد.'}</p>
        </div>
        {s && !s.failed && s.ready && (
          <span className="la-row">
            {usable && <button className="btn-sm primary" type="button" disabled={busy} onClick={open}>افتح الحساب التجريبي</button>}
            {isSuperAdmin() && s.exists && <button className="btn-sm ghost" type="button" disabled={busy} onClick={reset}>أعِده إلى البداية</button>}
          </span>
        )}
      </div>
      {!s && <p className="la-muted" role="status">تُقرأ حالة الحساب…</p>}
      {s?.failed && <p className="la-note" role="status">تعذّرت قراءة حالة الحساب التجريبي الآن. {s.message || 'أعد المحاولة بعد قليل.'}</p>}
      {s && !s.failed && (
        <p className={`cohort-demo-status ${usable && s.exists ? 'on' : ''}`} role="status" data-testid="cohort-demo-status">
          <span className="la-muted">الحالة</span> <b>{cohortDemoLine(s)}</b>
          {s.exists && s.last_opened_by && <span className="la-muted"> بواسطة <bdi dir="ltr">{s.last_opened_by}</bdi></span>}
        </p>
      )}
      {s && !s.failed && !s.ready && <><p className="la-note" role="status">يُفعَّل بعد تحديث قاعدة البيانات؛ استعمل الحساب العام إلى ذلك الحين.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>الحساب التجريبي لكل دفعة يُفعَّل بعد تحديث قاعدة البيانات، بلا نشر جديد. إلى ذلك الحين استعمل الحساب التجريبي العام من النظرة العامة: يعرض رحلة الدفعة المفتوحة.</p></details></>}
      {usable && !s.general && <DemoLinks state={s} load={load} cohort={{ id: c.id, name: c.name }} />}
    </section>
  );
}
