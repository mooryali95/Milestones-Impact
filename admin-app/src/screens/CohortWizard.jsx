// ════════════════════════════════════════════════════════════════
// معالج الدفعة الجديدة: لمن ← البرنامج ← المواعيد ← المراجعة، ثم ملف الدفعة وفيه الفريق والجدول والرابط
// ════════════════════════════════════════════════════════════════
// يحفظ بالإجراء نفسه الذي يحفظ به نموذج الدفعة الكامل (admin.cohort-save)، فلا مدخل ثانٍ ولا قاعدة ثانية.
// ما لا يحتاجه الإنشاء (صيغ الأنشطة والبنود المخفية والإشراف) يبقى في «تحرير الدفعة» من ملفها.
import React, { useState } from 'react';
import { COHORT_STATUS, cohortFields, contractLine, itemsAr } from '../methodology.js';
import { CohortField } from './CohortEditor.jsx';
import { useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { saveCohort } from '../cohort-guard.js';
import { WIZARD_STEPS, wizardBlock, wizardBody, wizardNotes } from '../cohort-hub.js';
import { orgProgram, orgProgramLine } from '../../../supabase/functions/leaders-api/logic.js';
import '../cohort-editor.css';

const defaultName = (v, orgs) => {
  const o = orgs.find((x) => x.id === v.organization_id);
  return v.kind === 'org' && o ? `دفعة ${o.name}` : '';
};

// كل دفعة تُثبَّت على أحدث نسخة من برنامجها (ترحيل 20261116110000)، فلا خيار هنا: سطر يقول على أي نسخة ولماذا
const versionLine = (p) => (p.versions?.length
  ? `تُثبَّت الدفعة على أحدث نسخة محفوظة (النسخة ${p.versions[0].number}: ${p.versions[0].label}). تحميها من أي تعديل لاحق على البرنامج حتى ترقّيها بنفسك.`
  : 'لا نسخة محفوظة لهذا البرنامج بعد: تُحفظ نسخته الأولى من حاله الآن عند الإنشاء، وتُثبَّت الدفعة عليها.');

/** @param {{ preset?: any, data: any, onClose: (created?: any) => void }} props */
export default function CohortWizard({ preset = {}, data, onClose }) {
  const { toast, confirm } = useUI();
  const orgs = data.organizations || [];
  const programs = (data.programs || []).filter((p) => !p.archived_at);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const fallback = programs.find((p) => p.is_default)?.id || programs[0]?.id || '';
  // برنامج الجهة (P4): دفعة جهة جديدة تُقترح على برنامج دفعتها الحالية، وإلا آخر دفعة لها، والمؤرشف لا يُقترح.
  // البرنامج القادم من «أنشئ له دفعة» أو ما اختاره المدير بنفسه لا يُستبدل
  const suggest = (o) => orgProgram(data.cohorts || [], data.programs || [], o || null);
  const [v, setV] = useState(() => {
    const init = {
      kind: 'org', organization_id: preset.organization_id || '',
      program_id: preset.program_id || suggest(preset.organization_id)?.program_id || fallback,
      status: 'open', starts_on: '', ends_on: '', capacity: '', name: '',
    };
    return { ...init, name: defaultName(init, orgs) };
  });
  const [named, setNamed] = useState(false);   // كتب المدير الاسم بنفسه: لا يُستبدل باسم الجهة
  const [picked, setPicked] = useState(!!preset.program_id);   // اختار المدير البرنامج بنفسه: لا يُستبدل ببرنامج الجهة
  const set = (patch) => setV((cur) => {
    const next = { ...cur, ...patch };
    if (!named && ('organization_id' in patch || 'kind' in patch)) next.name = defaultName(next, orgs) || cur.name;
    if (!picked && !('program_id' in patch) && ('organization_id' in patch || 'kind' in patch)) {
      next.program_id = (next.kind === 'org' && suggest(next.organization_id)?.program_id) || fallback;
    }
    return next;
  });
  const orgProg = v.kind === 'org' ? suggest(v.organization_id) : null;
  // حقول الخطوة الثالثة من تعريفها الواحد (cohortFields)، و«المقاعد» لدفعة الأفراد وحدها كما في المحرر
  const view = { ...v, organization_id: v.kind === 'org' ? v.organization_id : '' };
  const F = Object.fromEntries(cohortFields({ orgs, programs, isNew: true }).filter((f) => f.section === 'basics').map((f) => [f.name, f]));
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
    const r = await saveCohort(wizardBody(v), confirm);
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
              <select aria-label="البرنامج" value={v.program_id} onChange={(e) => { setPicked(true); set({ program_id: e.target.value }); }} autoFocus>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name} · {itemsAr(p.requirements || 0)}</option>)}
              </select>
            </label>
            {orgProg && (orgProg.program_id === v.program_id
              ? <p className="wiz-source" role="note">{orgProgramLine(orgProg)} <small className="la-muted">يمكنك تغييره.</small></p>
              : <p className="wiz-source warn" role="note">برنامج الجهة «{orgProg.program_name}» ({orgProg.via === 'current' ? 'من دفعتها الحالية' : 'من آخر دفعة لها'}). اخترت برنامجًا آخر: من له تقدم من أعضائها يُسأل عنه قبل الإنشاء، لأن تقدمه مربوط ببرنامجه.{' '}
                  <button type="button" className="la-link" onClick={() => { setPicked(false); set({ program_id: orgProg.program_id }); }}>ارجع إلى برنامج الجهة</button></p>)}
            {prog && <p className="la-muted wiz-version" role="note">{versionLine(prog)}</p>}
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="wiz-body">
            <legend>الاسم والمواعيد</legend>
            {/* الحقول نفسها التي في محرر الدفعة (cohortFields وCohortField)، فلا يختلف حقل بين الإنشاء والتحرير */}
            <CohortField f={F.name} v={view} set={(p) => { setNamed(true); set(p); }} className="wiz-field" autoFocus />
            <div className="wiz-row">
              <CohortField f={F.starts_on} v={view} set={set} className="wiz-field" />
              <CohortField f={F.ends_on} v={view} set={set} className="wiz-field" />
            </div>
            <small className="la-muted">بالمدة يُوزَّع جدول المراحل تلقائيًا في ملف الدفعة. يمكن تركها الآن.</small>
            <div className="wiz-row">
              <CohortField f={F.status} v={view} set={set} className="wiz-field" />
              {/* المقاعد مصدرها واحد (P3): دفعة الجهة تأخذها من عقد الجهة فلا تُسأل هنا، ودفعة الأفراد حقلها هو المصدر */}
              {F.capacity.show(view) && <CohortField f={F.capacity} v={view} set={set} className="wiz-field" />}
            </div>
            {v.kind === 'org' && org && <p className="la-muted wiz-contract">{contractLine(org)} يُعدَّل العقد من ملف الجهة، ولسعة تشغيلية خاصة بالدفعة افتح «تحرير الدفعة» بعد إنشائها.</p>}
          </fieldset>
        )}

        {last && (
          <div className="wiz-body">
            <dl className="la-dl">
              <dt>الدفعة</dt><dd>{v.name}</dd>
              <dt>لمن</dt><dd>{v.kind === 'org' ? `جهة «${org?.name || ''}»، ويدخلها منضموها تلقائيًا` : 'أفراد، بالإلحاق اليدوي'}</dd>
              <dt>البرنامج</dt><dd>{prog?.name} · {prog?.versions?.length ? `النسخة ${prog.versions[0].number}` : 'النسخة 1 (تُنشأ عند الإنشاء)'}</dd>
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
