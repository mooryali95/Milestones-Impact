// ════════════════════════════════════════════════════════════════
// معالج الدفعة الجديدة: لمن ← البرنامج ← المواعيد ← المراجعة، ثم ملف الدفعة وفيه الفريق والجدول والرابط
// ════════════════════════════════════════════════════════════════
// يحفظ بالإجراء نفسه الذي يحفظ به نموذج الدفعة الكامل (admin.cohort-save)، فلا مدخل ثانٍ ولا قاعدة ثانية.
// ما لا يحتاجه الإنشاء (صيغ الأنشطة والبنود المخفية والإشراف) يبقى في «تحرير الدفعة» من ملفها.
import React, { useState } from 'react';
import { L } from '../leaders.js';
import { COHORT_STATUS } from '../methodology.js';
import { useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { WIZARD_STEPS, wizardBlock, wizardBody, wizardNotes } from '../cohort-hub.js';

const defaultName = (v, orgs) => {
  const o = orgs.find((x) => x.id === v.organization_id);
  return v.kind === 'org' && o ? `دفعة ${o.name}` : '';
};

/** @param {{ preset?: any, data: any, onClose: (created?: any) => void }} props */
export default function CohortWizard({ preset = {}, data, onClose }) {
  const { toast } = useUI();
  const orgs = data.organizations || [];
  const programs = (data.programs || []).filter((p) => !p.archived_at);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(() => {
    const init = {
      kind: 'org', organization_id: preset.organization_id || '',
      program_id: preset.program_id || programs.find((p) => p.is_default)?.id || programs[0]?.id || '',
      pin: true, status: 'open', starts_on: '', ends_on: '', capacity: '', name: '',
    };
    return { ...init, name: defaultName(init, orgs) };
  });
  const [named, setNamed] = useState(false);   // كتب المدير الاسم بنفسه: لا يُستبدل باسم الجهة
  const set = (patch) => setV((cur) => {
    const next = { ...cur, ...patch };
    if (!named && ('organization_id' in patch || 'kind' in patch)) next.name = defaultName(next, orgs) || cur.name;
    return next;
  });
  const close = useGuardedClose(step > 0, () => onClose());
  useEscape(close, true);

  const block = wizardBlock(step, v);
  const notes = wizardNotes({ v, cohorts: data.cohorts || [], orgs, programs });
  const prog = programs.find((p) => p.id === v.program_id);
  const org = orgs.find((o) => o.id === v.organization_id);
  const last = step === WIZARD_STEPS.length - 1;

  const next = async () => {
    if (block) return toast(block);
    if (!last) return setStep(step + 1);
    setBusy(true);
    const r = await L('admin.cohort-save', wizardBody(v, { canPin: !!prog?.versions?.length }));
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast('أُنشئت الدفعة. أكمل فريقها وجدولها من ملفها.');
    onClose(r.cohort);
  };

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="la-form mi-form cohort-wizard" role="dialog" aria-modal="true" aria-label="دفعة جديدة">
        <h3>دفعة جديدة</h3>
        <ol className="wiz-steps" aria-label="الخطوات">
          {WIZARD_STEPS.map((t, i) => <li key={t} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span>{i < step ? '✓' : i + 1}</span>{t}</li>)}
        </ol>

        {step === 0 && (
          <fieldset className="wiz-body">
            <legend>لمن هذه الدفعة؟</legend>
            <label className="wiz-choice"><input type="radio" name="kind" checked={v.kind === 'org'} onChange={() => set({ kind: 'org' })} />
              <span><b>لجهة</b><small>يدخلها تلقائيًا كل من يسجّل برابط الجهة. لا حاجة لإلحاق أحد يدويًا.</small></span></label>
            {v.kind === 'org' && (
              <label className="wiz-field">الجهة
                <select aria-label="الجهة" value={v.organization_id} onChange={(e) => set({ organization_id: e.target.value })} autoFocus>
                  <option value="">اختر الجهة…</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.status && o.status !== 'active' ? ' (غير فعّالة)' : ''}</option>)}
                </select>
              </label>
            )}
            <label className="wiz-choice"><input type="radio" name="kind" checked={v.kind === 'individuals'} onChange={() => set({ kind: 'individuals' })} />
              <span><b>لأفراد</b><small>بلا رابط تسجيل. تلحق بها المشاركين يدويًا من شاشة المشاركين.</small></span></label>
            <p className="la-muted">من يسجّل بلا جهة يدخل «الدفعة المفتوحة» العامة تلقائيًا، فلا تحتاج دفعة لهم.</p>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className="wiz-body">
            <legend>أي برنامج يمر به المشاركون؟</legend>
            <label className="wiz-field">البرنامج
              <select aria-label="البرنامج" value={v.program_id} onChange={(e) => set({ program_id: e.target.value })} autoFocus>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.requirements} متطلب</option>)}
              </select>
            </label>
            {prog && (prog.versions?.length
              ? <label className="wiz-check"><input type="checkbox" checked={v.pin} onChange={(e) => set({ pin: e.target.checked })} />
                  <span>ثبّت الدفعة على أحدث نسخة محفوظة (النسخة {prog.versions[0].number}). <small className="la-muted">تحميها من أي تعديل لاحق على البرنامج حتى ترقّيها بنفسك.</small></span></label>
              : <p className="la-muted">لا نسخة محفوظة لهذا البرنامج: ستتبع الدفعة آخر تعديل عليه.</p>)}
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="wiz-body">
            <legend>الاسم والمواعيد</legend>
            <label className="wiz-field">اسم الدفعة<input value={v.name} onChange={(e) => { setNamed(true); set({ name: e.target.value }); }} autoFocus /></label>
            <div className="wiz-row">
              <label className="wiz-field">تبدأ<input type="date" value={v.starts_on} onChange={(e) => set({ starts_on: e.target.value })} /></label>
              <label className="wiz-field">تنتهي<input type="date" value={v.ends_on} onChange={(e) => set({ ends_on: e.target.value })} /></label>
            </div>
            <small className="la-muted">بالمدة يُوزَّع جدول المراحل تلقائيًا في ملف الدفعة. يمكن تركها الآن.</small>
            <div className="wiz-row">
              <label className="wiz-field">الحالة
                <select value={v.status} onChange={(e) => set({ status: e.target.value })}>
                  {['open', 'running', 'planned'].map((k) => <option key={k} value={k}>{COHORT_STATUS[k]}</option>)}
                </select>
              </label>
              <label className="wiz-field">المقاعد (اختياري)<input type="number" min="1" value={v.capacity} onChange={(e) => set({ capacity: e.target.value })} /></label>
            </div>
          </fieldset>
        )}

        {last && (
          <div className="wiz-body">
            <dl className="la-dl">
              <dt>الدفعة</dt><dd>{v.name}</dd>
              <dt>لمن</dt><dd>{v.kind === 'org' ? `جهة «${org?.name || ''}»، ويدخلها منضموها تلقائيًا` : 'أفراد، بالإلحاق اليدوي'}</dd>
              <dt>البرنامج</dt><dd>{prog?.name}{v.pin && prog?.versions?.length ? ` · النسخة ${prog.versions[0].number}` : ' · آخر تعديل'}</dd>
              <dt>المواعيد</dt><dd>{[v.starts_on, v.ends_on].filter(Boolean).join(' إلى ') || 'لم تُحدد بعد'} · {COHORT_STATUS[v.status]}</dd>
            </dl>
            <p className="la-muted">بعد الإنشاء يفتح ملف الدفعة: فيه رابط التسجيل، وما بقي لتعمل الدفعة (المستشار والفريق والجدول) بزر لكل بند.</p>
          </div>
        )}

        {notes.length > 0 && step > 0 && <ul className="wiz-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}

        <div className="la-row between">
          <button className="btn-sm ghost" onClick={close}>إلغاء</button>
          <div className="la-row">
            {step > 0 && <button className="btn-sm ghost" onClick={() => setStep(step - 1)} disabled={busy}>السابق</button>}
            <button className="btn-sm primary" onClick={next} disabled={busy} title={block || undefined}>{last ? (busy ? 'يُنشأ…' : 'أنشئ الدفعة') : 'التالي'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
