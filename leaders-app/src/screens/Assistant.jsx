// ════════════════════════════════════════════════════════════════
// «اسأل المساعد» من المبادرة: المساعد نفسه (GuideChat في Guidance.jsx) ببوابته وحدوده ومحادثته
// ════════════════════════════════════════════════════════════════
// لا مساعد ثانٍ ولا بوابة ثانية: الحكم من guide.state، والسؤال بـguide.ask بسياق «capstone» القائم في الخادم،
// فيُحسب في الحدود نفسها ويظهر في المحادثة نفسها التي في «التوجيه والإرشاد».
// الخصوصية: لا يُرسل شيء من مسودة المبادرة. اسم الفصل والحقل يُكتب في نص السؤال، والمشارك يراه ويعدّله قبل الإرسال.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import { GuideChat } from './Guidance.jsx';
import ChooseExpert from './ChooseExpert.jsx';
import { GATE_AR } from '../../../supabase/functions/leaders-api/guide.js';

// أسباب يستطيع المشارك نفسه أن يفعل شيئًا فيها: يظهر له سطر بالسبب. والباقي عام (لم يُفعَّل، متوقف، التقييم،
// التجربة، الجهة، المفتاح): لا زر ميت ولا سطر، فيختفي المدخل وحده
export const ACTIONABLE = new Set(['consent', 'start']);

/** @returns {{ kind: 'hidden' } | { kind: 'open' } | { kind: 'line', reason: string, message: string }} */
export function accessOf({ demo = false, ai = false, gate = null } = {}) {
  if (demo || !ai || !gate) return { kind: 'hidden' };
  if (gate.ok) return { kind: 'open' };
  if (ACTIONABLE.has(gate.reason)) return { kind: 'line', reason: gate.reason, message: gate.message || GATE_AR[gate.reason] };
  return { kind: 'hidden' };
}

// السؤال المملوء من الحقل: سياق يراه المشارك ويكمله، لا نص مسودته
export function fieldQuestion(chapter, field) {
  const f = String(field || '').trim();
  const c = String(chapter || '').trim();
  if (!f) return c ? `في فصل «${c}»: ` : '';
  return c ? `في فصل «${c}»، حقل «${f}»: ` : `في حقل «${f}»: `;
}

// حكم البوابة مرة واحدة للصفحة. حساب العرض مغلق كما في الخادم (guide.ask محجوب له)، فلا يُطلب شيء
export function useAssistantAccess(me) {
  const demo = !!me?.participant?.is_demo;
  const ai = !!me?.guidance?.ai;
  const [gate, setGate] = useState(null);
  useEffect(() => {
    if (demo || !ai) return undefined;
    let live = true;
    call('guide.state').then((r) => { if (live && r?.success) setGate(r.gate); }).catch(() => {});
    return () => { live = false; };
  }, [demo, ai]);
  return accessOf({ demo, ai, gate });
}

// المبادرة تمرر فتح اللوحة لفصولها؛ خارجها (مكتبة النماذج) لا سياق فلا زر
export const AssistantContext = createContext(null);
export const useAssistant = () => useContext(AssistantContext);

const NOTE = (d) => `المساعد يرشدك ولا يكتب مبادرتك عنك، ولا يصله منها إلا ما تكتبه هنا، ويُحفظ ما تكتبه ${d.retention_days} يومًا ثم يُحذف.`;

// لوحة جانبية على الحاسوب وورقة سفلية على الجوال، بعنصر <dialog> الأصلي (حبس التركيز وEsc وإعادة التركيز)
export function AssistantDrawer({ open, initialText = '', onClose }) {
  const ref = useRef(null);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return undefined;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
    const done = () => onClose?.();
    d.addEventListener('close', done);
    return () => d.removeEventListener('close', done);
  }, [open]);
  useEffect(() => { if (!open) setConfirm(null); }, [open]);
  return (
    <dialog ref={ref} className="gd-drawer as-drawer" aria-label="اسأل المساعد" onClick={(e) => { if (e.target === ref.current) onClose?.(); }}>
      {open && (
        <div className="gd-drawer-body">
          <button type="button" className="btn ghost sm gd-close" onClick={() => onClose?.()}>إغلاق ✕</button>
          <GuideChat key={initialText} context="capstone" initialText={initialText} autoFocus note={NOTE}
            onConfirm={(q) => setConfirm({ note: `سألت المساعد الذكي: «${q}» وأريد التأكد من خبير.`, at: Date.now() })} />
          {confirm && <ChooseExpert key={confirm.at} context="capstone" title="استشارة لمبادرتك" note={confirm.note} open />}
        </div>
      )}
    </dialog>
  );
}

// زر الحقل بجانب «كيف أكتبه؟»، أو سطر السبب حين يستطيع المشارك فتح البوابة بنفسه
export function FieldAsk({ chapter, field }) {
  const a = useAssistant();
  // السطر (consent أو start) يظهر مرة واحدة أعلى الفصل، لا تحت كل حقل
  if (a?.access.kind !== 'open') return null;
  return (
    <button type="button" className="link small as-ask" aria-haspopup="dialog" aria-label={`اسأل المساعد عن حقل ${field}`}
      onClick={() => a.open(fieldQuestion(chapter, field))}>اسأل المساعد</button>
  );
}

export function GateLine() {
  const a = useAssistant();
  if (a?.access.kind !== 'line') return null;
  return <p className="small muted as-line" data-guide-closed={a.access.reason} role="note">اسأل المساعد: {a.access.message}</p>;
}
