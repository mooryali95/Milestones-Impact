// ════════════════════════════════════════════════════════════════
// «أصدر الكتاب»: لوحة المدير العام لإصدار الكتاب من المقترحات المعتمدة (اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// معاينة ما يدخل وما يُتخطى، ثم تشغيل البناء، ثم متابعته خطوة خطوة، ثم «انشر» بعد خضرة الفحوص.
// القواعد على الخادم (book-release.ts)، والمراحل من releaseStage في book-release.js.
import React, { useCallback, useEffect, useState } from 'react';
import { useDialogFocus } from './Proposals.jsx';

const STEPS = [
  ['idle', 'المعتمد ينتظر'],
  ['building', 'يُبنى الإصدار'],
  ['review', 'جاهز للمراجعة'],
  ['merging', 'يُنشر'],
  ['published', 'نُشر للمشاركين'],
];
const ORDER = { idle: 0, failed: 1, building: 1, review: 2, merging: 3, published: 4 };
const CHECKS = { pending: 'الفحوص تعمل', success: 'الفحوص ناجحة', failure: 'فحص فشل' };

export default function ReleaseSheet({ api, onClose }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const box = useDialogFocus();
  const load = useCallback(() => api.release().then((r) => { if (r?.success) setS(r); else setErr(r?.message || 'تعذّرت قراءة حالة الإصدار'); }), [api]);
  useEffect(() => { load(); }, [load]);
  // المتابعة الحية ما دام شيء يجري (بناء، أو فحوص، أو تطبيق الترحيل)
  const live = s && (s.stage === 'building' || s.stage === 'merging' || (s.stage === 'review' && s.pr?.checks === 'pending'));
  useEffect(() => { if (!live) return undefined; const t = setInterval(load, 15000); return () => clearInterval(t); }, [live, load]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);

  const act = async (name, fn, ask) => {
    if (ask && !confirm(ask)) return;
    setBusy(name); setErr('');
    const r = await fn();
    setBusy('');
    if (!r?.success) { setErr(r?.message || 'تعذّر التنفيذ'); return; }
    setTimeout(load, 4000);
    load();
  };

  const at = s ? ORDER[s.stage] ?? 0 : 0;
  const n = s?.preview?.applied?.length || 0;
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={box} tabIndex={-1} className="mb-sheet tall wide" role="dialog" aria-modal="true" aria-label="إصدار الكتاب">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h">
          <div><small>الكتاب الأم · للمدير العام</small><b>إصدار الكتاب</b></div>
          <button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        <div className="mb-sheet-body">
          {!s && !err && <p className="mb-empty">تُقرأ حالة الإصدار…</p>}
          {s && <>
            <ol className="mb-rel-steps" aria-label="مراحل الإصدار">
              {STEPS.map(([k, l], i) => <li key={k} className={i < at ? 'done' : i === at ? (s.stage === 'failed' ? 'bad' : 'now') : ''}><span>{i + 1}</span>{i === 1 && s.stage === 'failed' ? 'تعذّر البناء' : l}</li>)}
            </ol>

            {!s.configured && (
              <section className="mb-dep warn"><header><b>يلزم إعداد واحد قبل أول إصدار</b></header>
                <ol className="mb-dep-list mb-rel-setup">
                  <li>أنشئ مفتاحًا في GitHub من هذا المسار:
                    <code className="mb-ltr" dir="ltr">Settings › Developer settings › Fine-grained tokens › Generate new token</code>
                    اختر هذا المستودع وحده، وامنحه هذه الصلاحيات الثلاث، كلها قراءة وكتابة:
                    <code className="mb-ltr" dir="ltr">Actions · Contents · Pull requests</code></li>
                  <li>احفظه في Supabase من هذا المسار:
                    <code className="mb-ltr" dir="ltr">Edge Functions › Secrets</code>
                    باسم:
                    <code className="mb-ltr" dir="ltr">GITHUB_RELEASE_TOKEN</code></li>
                  <li>أعد فتح هذه اللوحة. وإلى ذلك الحين يُصدر Claude الكتاب بطلبك.</li>
                </ol>
              </section>
            )}

            {(s.stage === 'idle' || s.stage === 'failed' || s.stage === 'published') && <>
              <p className="mb-dep-lead">{n ? `${n} مقترحًا معتمدًا تدخل الإصدار التالي.` : 'لا مقترح معتمد ينطبق الآن.'} لا يتغير ما يقرؤه المشاركون حتى تضغط «انشر» بعد مراجعة الإصدار.</p>
              {n > 0 && <ul className="mb-rel-list">{s.preview.applied.map((p) => <li key={p.id}><b>{p.chapter}</b> · {p.section}<small>{p.reason} · {p.author}</small></li>)}</ul>}
              {s.preview.skipped.length > 0 && <section className="mb-dep warn"><header><b>لا تدخل هذا الإصدار</b><span className="mb-dep-n">{s.preview.skipped.length}</span></header>
                <ul className="mb-dep-list">{s.preview.skipped.map((p) => <li key={p.id}>{p.chapter} · {p.section}: {p.why}</li>)}</ul>
                <p>يعيدها كاتبها مسودةً ويحدّثها على النص الحالي، أو تسحبها من «المقترحات».</p></section>}
              {s.stage === 'failed' && <p className="mb-err">تعذّر بناء الإصدار الأخير. {s.run?.url && <a href={s.run.url} target="_blank" rel="noreferrer">سجل التشغيل</a>}</p>}
              {s.configured && <button type="button" className="mb-btn gold wide" disabled={!n || !!busy} onClick={() => act('start', api.releaseStart, `يُبنى إصدار من ${n} مقترحًا ويُفتح للمراجعة. لا يصل للمشاركين قبل «انشر». ابدأ؟`)}>{busy === 'start' ? 'يبدأ…' : 'ابدأ بناء الإصدار'}</button>}
            </>}

            {s.stage === 'building' && <p className="mb-dep-lead">يُبنى الإصدار ويُفحص الآن (بضع دقائق). تتحدث هذه اللوحة وحدها. {s.run?.url && <a href={s.run.url} target="_blank" rel="noreferrer">المتابعة في GitHub</a>}</p>}
            {s.orphan && s.stage !== 'review' && <section className="mb-dep warn"><header><b>الإصدار بُني ولم يُفتح طلب مراجعته</b></header>
              <button type="button" className="mb-btn gold" disabled={!!busy} onClick={() => act('pr', api.releasePr)}>{busy === 'pr' ? 'يُفتح…' : 'افتح طلب المراجعة'}</button></section>}

            {s.stage === 'review' && s.pr && <>
              <p className="mb-dep-lead">الإصدار <b dir="ltr">{s.pr.version}</b> جاهز للمراجعة: <span className={`mb-pr-st st-${s.pr.checks === 'success' ? 'approved' : s.pr.checks === 'failure' ? 'rejected' : 'review'}`}>{CHECKS[s.pr.checks]}</span></p>
              <ul className="mb-dep-list">
                <li><a href={`${s.pr.url}/files`} target="_blank" rel="noreferrer">ما تغيّر في الكتاب (الفرق)</a></li>
                <li><a href={s.pr.url} target="_blank" rel="noreferrer">طلب الإصدار، ومعه سجل المقترحات وتقرير الأثر</a></li>
              </ul>
              <button type="button" className="mb-btn gold wide" disabled={s.pr.checks !== 'success' || !!busy}
                onClick={() => act('publish', () => api.releasePublish(s.pr.number, s.pr.sha), `ينشر الإصدار ${s.pr.version}: يُدمج ويُطبَّق ترحيله، فيتغير ما يقرؤه المشاركون. انشر؟`)}>
                {busy === 'publish' ? 'يُنشر…' : s.pr.checks === 'success' ? `انشر الإصدار ${s.pr.version}` : 'انشر (بعد نجاح الفحوص)'}</button>
            </>}

            {s.stage === 'merging' && s.pr && <>
              <p className="mb-dep-lead">دُمج الإصدار <b dir="ltr">{s.pr.version}</b>، ويُطبَّق ترحيله الآن. يصل المشاركين خلال دقائق.</p>
              {s.applied === false && <button type="button" className="mb-btn ghost" disabled={!!busy} onClick={() => act("publish", () => api.releasePublish(s.pr.number, s.pr.sha))}>أعد تطبيق الترحيل</button>}
            </>}
            {s.stage === 'published' && s.pr && <p className="mb-note">نُشر الإصدار <b dir="ltr">{s.pr.version}</b> للمشاركين، وصارت مقترحاته «في إصدار».</p>}
          </>}
          {err && <p className="mb-err" role="alert">{err}</p>}
        </div>
      </aside>
    </div>
  );
}
