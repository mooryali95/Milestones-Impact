// ════════════════════════════════════════════════════════════════
// هيكل ملف المشارك (المرحلة P2، اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// رأس ثابت بهوية المشارك وإجرائه الأهم، وست تبويبات بدل ثلاثة عشر قسمًا في تمرير واحد، وعمود «لمحة»
// بما يحتاجه المراجع في نظرة. كله عرض لما يرسله admin.participant (file.ts): لا حساب جديد ولا مصدر ثانٍ.
import React, { useEffect, useRef, useState } from 'react';
import { date, STATUS, trackOfPlacements } from '../leaders.js';
import { FileFlags } from './PersonFile.jsx';
import { currentStages } from '../../../supabase/functions/leaders-api/journey-map.js';
import { keepInView } from '../../../shared/ui/keep-in-view.js';

export const TABS = [
  ['decision', 'القرار'],
  ['journey', 'الرحلة'],
  ['learning', 'التعلم'],
  ['initiative', 'المبادرة'],
  ['profile', 'الملف'],
  ['log', 'السجل'],
];
const TAB_KEY = 'mi_admin_pf_tab';

// قبل الاعتماد: ما يعني المراجع هو القياس والقرار (حالات المشارك من labels.js)
const BEFORE_APPROVAL = ['registered', 'profiled', 'assessing', 'pending_approval'];
/** التبويب الذي يفتح به الملف: من لم يُعتمد مساره بعد يفتح على القرار دائمًا، وغيره على آخر تبويب اختاره المدير في الجلسة، وإلا الرحلة */
export function startTab(p, kept) {
  if (BEFORE_APPROVAL.includes(p?.status)) return 'decision';
  return TABS.some(([k]) => k === kept) ? kept : 'journey';
}
export function keptTab() { try { return sessionStorage.getItem(TAB_KEY); } catch { return null; } }
export function keepTab(t) { try { sessionStorage.setItem(TAB_KEY, t); } catch { /* محجوب */ } }

/** ما ينتظر المراجع في كل تبويب: رقم صغير على التبويب */
export function tabBadges(r) {
  const p = r?.participant || {};
  const submitted = (r?.journey || []).reduce((n, s) => n + (s.items || []).filter((it) => it.status === 'submitted').length, 0);
  const models = (r?.models || []).filter((x) => x.status === 'submitted').length;
  return {
    decision: p.status === 'pending_approval' ? '!' : null,
    journey: submitted || null,
    learning: models || null,
    log: (r?.observations || []).length || null,
  };
}

/** الإجراء الأهم الآن، واحد فقط: اعتماد المنتظر، ثم مراجعة ما سلّمه، ثم ملاحظة */
export function primaryAction(r, canWrite) {
  if (!canWrite) return null;
  const b = tabBadges(r);
  if (b.decision) return { tab: 'decision', label: 'راجع واعتمد', focus: 'lc-title' };
  if (b.journey) return { tab: 'journey', label: `راجع المسلَّم (${b.journey})` };
  if (b.learning) return { tab: 'learning', label: `قيّم النماذج (${b.learning})` };
  return { tab: 'log', label: 'أضف ملاحظة', focus: 'pf-obs-h' };
}

// آخر نشاط فعلي من الخادم (last_active_at: الأحدث من آخر دخول وآخر استعمال للجلسة، last-active.js)، وقبل وصوله آخر دخول.
// «آخر دخول» وحده يقلل من النشاط: الجلسة تبقى 14 يومًا بلا دخول جديد
export const seenAt = (p) => p?.last_active_at || p?.last_login_at || null;

/** لمحة: ما يحتاجه المراجع في نظرة، من بيانات الملف نفسها */
export function glance(r) {
  const p = r.participant;
  const journey = r.journey || [];
  // المرحلة الحالية كما يراها المشارك (currentStages، R3b): ما يسير معًا نشطًا يُسمى كله
  const cur = currentStages(journey);
  const active = cur.stage?.status === 'active' ? cur.stages.map((s) => s.title_ar).join(' و') : null;
  const done = journey.filter((s) => s.status === 'done').length;
  const sessions = r.sessions || [];
  return [
    ['التقدم', `${r.progress || 0}%`, journey.length ? `${done} من ${journey.length} مراحل` : ''],
    ['المرحلة الحالية', active || (journey.length && done === journey.length ? 'أتم الرحلة' : '·'), ''],
    ['آخر نشاط', seenAt(p) ? date(seenAt(p)) : 'لم يدخل', p.last_login_at && date(p.last_login_at) !== date(seenAt(p)) ? `آخر دخول ${date(p.last_login_at)}` : ''],
    ['سجّل', date(p.created_at), ''],
    ['كتاب القائد', `${(r.book || []).length} باب`, r.points ? `${r.points.rank?.title || ''} · ${r.points.total || 0} نقطة` : ''],
    ['الجلسات', sessions.length ? `${sessions.filter((s) => s.status === 'attended').length} حضرها` : 'لا جلسات', sessions.length ? `من ${sessions.length}` : ''],
  ];
}

// قائمة «⋯»: الإجراءات الأقل تكرارًا، بلوحة المفاتيح كاملة (الأسهم بين البنود، وEscape يغلق ويعيد التركيز)
// label: اسم القائمة وزرها. قائمة الرأس «إجراءات أخرى»، وقائمة المرحلة أو البند تسمي ما تخصه فلا يتشابه زران في الصفحة
export function MoreMenu({ items, label = 'إجراءات أخرى' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const list = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    keepInView(list.current);
    list.current?.querySelector('[role="menuitem"]')?.focus();
    const out = (e) => { if (!list.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    addEventListener('mousedown', out);
    return () => removeEventListener('mousedown', out);
  }, [open]);
  const key = (e) => {
    const all = [...(list.current?.querySelectorAll('[role="menuitem"]') || [])];
    const i = all.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <span className="pf-more">
      <button ref={btn} type="button" className="btn-sm ghost pf-more-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <ul ref={list} role="menu" className="pf-menu" aria-label={label} onKeyDown={key}>
          {shown.map((it) => (
            <li key={it.label} role="none">
              <button type="button" role="menuitem" tabIndex={-1} className={it.danger ? 'danger' : ''} title={it.title}
                onClick={() => { setOpen(false); it.run(); }}>{it.label}</button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

// الرأس الثابت: الهوية في سطر، والأعلام رقاقات، والإجراء الأهم، و«⋯»، ثم التبويبات
export function PersonHeader({ r, org, nav, primary, onPrimary, menu, tab, setTab }) {
  const p = r.participant;
  const track = trackOfPlacements(p.placements) || r.profile?.track?.key;
  const cohort = r.program?.cohort;
  const badges = tabBadges(r);
  const tabsRef = useRef(null);
  // أسهم التبويبات بنمط ARIA: يمين ويسار بين التبويبات، وHome وEnd لطرفيها (الصفحة من اليمين لليسار)
  const tabKey = (e) => {
    const i = TABS.findIndex(([k]) => k === tab);
    const to = { ArrowLeft: i + 1, ArrowRight: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const k = TABS[(to + TABS.length) % TABS.length][0];
    setTab(k);
    tabsRef.current?.querySelector(`#pf-tab-${k}`)?.focus();
  };
  return (
    <header className="pf-head">
      {nav}
      <div className="pf-id">
        <div className="pf-id-main">
          <h3>{p.full_name}</h3>
          <span className="la-chip">{STATUS[p.status] || p.status}</span>
          {p.is_test && <span className="la-chip warn" title="خارج النظرة العامة وأعداد الجهات ولوحتها والمالية وتقرير الأثر، وحساب عادي في كل ما سواها">حساب اختبار</span>}
          {track && <code className="la-code" title="المسار">{track}</code>}
        </div>
        <div className="pf-id-sub">
          {org ? <span className="la-orgtag" title="الجهة الراعية" style={{ '--org': org.color || 'var(--brand-gold)' }}>{org.short_name || org.name}</span>
            : p.organization_name && <span>{p.organization_name}</span>}
          {cohort?.id && <a href={`#/leaders/programs/${encodeURIComponent(cohort.id)}`}>{cohort.is_default ? 'الدفعة المفتوحة' : cohort.name}</a>}
          {p.job_title && <span className="la-muted">{p.job_title}</span>}
          {/* البريد وLinkedIn فقط: لا روابط هاتف في الواجهة (single-source.test.js)، والجوال في تبويب «الملف» */}
          <span className="pf-contact">
            {p.email && <a href={`mailto:${p.email}`} aria-label={`راسله: ${p.email}`} title={p.email}>✉</a>}
            {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn">in</a>}
          </span>
        </div>
        <div className="pf-id-act">
          {primary && <button type="button" className="btn-sm primary" onClick={onPrimary}>{primary.label}</button>}
          {menu}
        </div>
      </div>
      <FileFlags flags={r.flags} quiet />
      <div ref={tabsRef} className="pf-tabs" role="tablist" aria-label="أقسام ملف المشارك" onKeyDown={tabKey}>
        {TABS.map(([k, l]) => (
          <button key={k} id={`pf-tab-${k}`} type="button" role="tab" aria-selected={tab === k} aria-controls={`pf-panel-${k}`} tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)}>{l}{badges[k] != null && <span className="pf-badge" aria-label={badges[k] === '!' ? 'بانتظار قرارك' : `${badges[k]} بانتظارك`}>{badges[k]}</span>}</button>
        ))}
      </div>
    </header>
  );
}

export function Glance({ r }) {
  return (
    <aside className="pf-glance" aria-label="لمحة">
      <h4>لمحة</h4>
      <dl>{glance(r).map(([k, v, s]) => <div key={k}><dt>{k}</dt><dd>{v}{s && <small>{s}</small>}</dd></div>)}</dl>
    </aside>
  );
}
