// ════════════════════════════════════════════════════════════════
// شارة «حساب تجريبي» وأدوات التخطي (تصور الحساب التجريبي 2026-11-19، المرحلة 1، البندان 4.3 و4.6)
// ════════════════════════════════════════════════════════════════
// شريط ثابت تحت الترويسة في كل شاشة من الحساب التجريبي، لا يُغلق، سواء فُتح الحساب من لوحة الإدارة أو برابط تجربة
// (ولرابط التجربة سطر «وقد يراه غيرك» لأن الحساب واحد مشترك). فيه «تخطَّ هذه المرحلة» و«افتح كل المراحل»، ورابط صغير
// «أعد من البداية» بتأكيد في الشريط نفسه. الأزرار
// يطلبان من الخادم، والخادم هو الحارس (للحساب التجريبي وحده، على صف صاحب الجلسة): إخفاؤهما هنا ليس الحماية.
// نص الشارة وحكم المرحلة الحالية من demo-stage.js، المصدر نفسه الذي يقرؤه الخادم.
import React, { useState } from 'react';
import { call } from './api.js';
import { gateDone } from './gates.js';
import { DEMO_BADGE_LINE_AR, DEMO_NAME_AR, DEMO_RESTART_AR, DEMO_RESTART_ASK_AR, DEMO_RESTART_ASK_SHARED_AR, DEMO_SHARED_LINE_AR, demoLockedStages, demoSkipTarget } from '../../supabase/functions/leaders-api/demo-stage.js';

/** ما يعرضه الشريط لهذا الحساب الآن: المرحلة التي يتخطاها الزر، وهل بقي ما يُفتح */
export function demoBarState(me) {
  const approved = !!me?.profile?.approved;
  const target = demoSkipTarget({ profileDone: gateDone(me, 'profile'), approved, journey: me?.journey || [] });
  return { target, canOpenAll: target.kind === 'stage' && demoLockedStages(me?.journey).length > 0, allOpen: approved && demoLockedStages(me?.journey).length === 0 };
}

export default function DemoBar({ me, shared, onUpdate, onRestart }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  // «أعد من البداية» بتأكيد في الشريط نفسه: سطر بما يُمسح وما يبقى، ثم زران
  const [asking, setAsking] = useState(false);
  const { target, canOpenAll, allOpen } = demoBarState(me);
  const run = async (action) => {
    setBusy(action); setErr('');
    const r = await call(action);
    setBusy('');
    if (r.success) { onUpdate(r); if (action === 'demo.restart') { setAsking(false); onRestart?.(); } } else setErr(r.message || 'تعذّر التنفيذ، حاول مرة أخرى');
  };
  return (
    <div className="demo-bar" role="region" aria-label={DEMO_NAME_AR} data-testid="demo-bar">
      <div className="demo-bar-in">
        <p className="demo-bar-id">
          <b className="demo-badge" data-testid="demo-badge">{DEMO_NAME_AR}</b>
          <span>{DEMO_BADGE_LINE_AR}{shared ? `، ${DEMO_SHARED_LINE_AR}` : ''}.</span>
          {!asking && <button type="button" className="demo-restart" disabled={!!busy} onClick={() => { setErr(''); setAsking(true); }}>{DEMO_RESTART_AR}</button>}
        </p>
        {asking ? (
          <div className="demo-ask" role="alertdialog" aria-label={DEMO_RESTART_AR} data-testid="demo-restart-ask">
            <span>{shared ? DEMO_RESTART_ASK_SHARED_AR : DEMO_RESTART_ASK_AR}</span>
            <button type="button" className="demo-btn" disabled={!!busy} onClick={() => run('demo.restart')}>{busy === 'demo.restart' ? 'لحظة…' : 'نعم، أعد من البداية'}</button>
            <button type="button" className="demo-btn ghost" disabled={!!busy} onClick={() => setAsking(false)}>تراجع</button>
          </div>
        ) : (
        <div className="demo-tools">
          {target.kind !== 'none' && <span className="demo-cur" data-testid="demo-current">المرحلة الحالية: <b>{target.title}</b></span>}
          {target.kind === 'none' && <span className="demo-cur" data-testid="demo-current">تخطيت كل المراحل</span>}
          {target.kind !== 'none' && <button type="button" className="demo-btn" disabled={!!busy} onClick={() => run('demo.skip-stage')}>{busy === 'demo.skip-stage' ? 'لحظة…' : 'تخطَّ هذه المرحلة'}</button>}
          {canOpenAll && <button type="button" className="demo-btn ghost" disabled={!!busy} onClick={() => run('demo.open-all')}>{busy === 'demo.open-all' ? 'لحظة…' : 'افتح كل المراحل'}</button>}
          {!canOpenAll && allOpen && target.kind === 'stage' && <span className="demo-open-note" data-testid="demo-all-open">كل المراحل مفتوحة</span>}
        </div>
        )}
        {err && <p className="demo-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
