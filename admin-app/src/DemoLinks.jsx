// ════════════════════════════════════════════════════════════════
// روابط تجربة حساب العرض (تصور 2026-11-19): رابط باسم مستلمه يُرسل لشخص ليجرّب المنصة بحساب العرض
// ════════════════════════════════════════════════════════════════
// في بطاقة حساب العرض بالنظرة العامة. الرابط برمزه يُعرض مرة واحدة عند الإنشاء (الخادم لا يحفظ إلا بصمته)، والقائمة
// بالروابط النشطة: لمن، ومن أنشأه ومتى، وانتهاؤه وآخر استعمال، وزر الإلغاء. الحساب واحد مشترك الآن، والنص يقول ذلك.
import React, { useCallback, useEffect, useState } from 'react';
import { L } from './leaders.js';
import { dateTime } from './dates.js';
import { useCopy, useUI } from './ui.jsx';
import { DEMO_LINK_DAYS, DEMO_LINK_DEFAULT_DAYS, DEMO_LINK_LABEL_MAX } from '../../supabase/functions/leaders-api/demo-links.js';

export const demoDaysAr = (d) => (d === 1 ? 'يوم واحد' : d === 2 ? 'يومان' : d <= 10 ? `${d} أيام` : `${d} يومًا`);
// أسماء الروابط النشطة كما تُذكر في تأكيد إعادة الضبط: «مدير الدفعة»، «مسؤول الجهة»
export const linkNamesAr = (links) => (links || []).map((l) => `«${l.label}»`).join('، ');
export const resetConfirmAr = (links) => ((links || []).length
  ? `إعادة حساب العرض إلى البداية؟ تُمسح إجاباته وتقدمه. الحساب واحد مشترك، فتنتهي الآن تجربة من يستعمل ${links.length === 1 ? 'الرابط النشط' : 'الروابط النشطة'}: ${linkNamesAr(links)}. يبقى ${links.length === 1 ? 'رابطه صالحًا ويبدأ' : 'روابطهم صالحة ويبدؤون'} من البداية.`
  : 'إعادة حساب العرض إلى البداية؟ تُمسح إجاباته وتقدمه، ويبدأ العرض التالي من شاشة الدخول.');

// القائمة تُقرأ مع فتح البطاقة وبعد كل إنشاء وإلغاء. state: null قبل الوصول، وready: false قبل ترحيل الجدول
export function useDemoLinks() {
  const [state, setState] = useState(null);
  const load = useCallback(async () => {
    const r = await L('admin.demo-links').catch((e) => ({ success: false, message: e?.message }));
    setState(r.success ? r : { failed: true, message: r.message, links: [] });
    return r;
  }, []);
  useEffect(() => { load(); }, [load]);
  return { state, load };
}

export function DemoLinks({ state, load }) {
  const { toast, confirm } = useUI();
  const copy = useCopy();
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(DEMO_LINK_DEFAULT_DAYS);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);   // { label, url }: الرابط برمزه، يُعرض مرة واحدة
  const links = state?.links || [];
  const create = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await L('admin.demo-link-create', { label, days });
    setBusy(false);
    if (!r.success) return toast(r.message);
    setFresh({ label: r.link.label, url: r.url });
    setLabel('');
    load();
  };
  const revoke = async (l) => {
    if (!(await confirm(`إلغاء رابط «${l.label}»؟ يتوقف الرابط الآن، وتنتهي تجربة من يستعمله.`, { danger: true }))) return;
    setBusy(true);
    const r = await L('admin.demo-link-revoke', { id: l.id });
    setBusy(false);
    toast(r.success ? 'أُلغي الرابط' : r.message);
    load();
  };
  return (
    <div className="demo-links" data-testid="demo-links">
      <b>روابط التجربة</b>
      <p className="la-muted">رابط ترسله لشخص ليجرّب المنصة بحساب العرض، بلا رمز دخول. الحساب واحد مشترك الآن: ما يفعله أحدهم يراه الباقون، وإعادته إلى البداية تمسح تجربة الجميع. الروابط وفتحك للعرض لا يُخرج أحدها الآخر.</p>
      {state?.failed && <p className="la-note" role="status">تعذّرت قراءة الروابط الآن. {state.message || 'أعد المحاولة بعد قليل.'}</p>}
      {state && !state.failed && state.ready === false && <p className="la-note" role="status">روابط التجربة لم تُفعَّل بعد: تحتاج تحديث قاعدة البيانات.</p>}
      {state?.ready && (
        <>
          <form className="demo-links-form" onSubmit={create}>
            <label>
              <span>لمن الرابط؟</span>
              <input value={label} maxLength={DEMO_LINK_LABEL_MAX} placeholder="اسم أو صفة، مثل: مدير الدفعة" onChange={(e) => setLabel(e.target.value)} required />
            </label>
            <label>
              <span>يصلح</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {DEMO_LINK_DAYS.map((d) => <option key={d} value={d}>{demoDaysAr(d)}</option>)}
              </select>
            </label>
            <button className="btn-sm primary" type="submit" disabled={busy || label.trim().length < 2}>أنشئ الرابط</button>
          </form>
          {fresh && (
            <div className="la-note demo-links-fresh" role="status">
              <span>رابط «{fresh.label}» جاهز. انسخه الآن: لا يُعرض مرة أخرى.</span>
              <span className="la-row">
                <input readOnly dir="ltr" value={fresh.url} aria-label="رابط التجربة" onFocus={(e) => e.target.select()} />
                <button className="btn-sm primary" type="button" onClick={() => copy(fresh.url, 'نُسخ الرابط')}>انسخ</button>
                <button className="btn-sm ghost" type="button" onClick={() => setFresh(null)}>أخفِه</button>
              </span>
            </div>
          )}
          {links.length === 0 ? <p className="la-muted">لا روابط نشطة.</p> : (
            <ul className="demo-links-list" aria-label="الروابط النشطة">
              {links.map((l) => (
                <li key={l.id}>
                  <div>
                    <b>{l.label}</b>
                    <span className="la-muted">أنشأه <bdi dir="ltr">{l.created_by}</bdi> · {dateTime(l.created_at)}</span>
                    <span className="la-muted">ينتهي {dateTime(l.expires_at)} · {l.last_used_at ? `آخر استعمال ${dateTime(l.last_used_at)}` : 'لم يُستعمل بعد'}</span>
                  </div>
                  <button className="btn-sm ghost" type="button" disabled={busy} onClick={() => revoke(l)} aria-label={`ألغِ رابط ${l.label}`}>ألغِ</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
