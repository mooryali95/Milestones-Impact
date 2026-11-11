// ════════════════════════════════════════════════════════════════
// حالات الشاشة المشتركة: هيكل التحميل، والفراغ، والخطأ مع إعادة المحاولة، ونتيجة الإجراء في قسمه
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Ico from './Ico.jsx';

// نتيجة الإجراء: say(النص، خطأ؟). النجاح في منطقة إعلان ثابتة بعلامة ✓، والخطأ تنبيه بعلامة ! فلا يُقرأ رفض الخادم نجاحًا.
// تُعرض في القسم الذي وقع فيه الإجراء لا في رأس صفحة طويلة، وreveal يمرّرها إلى مجال الرؤية إن وقعت خارجه
// (قسم لا نداءات خلفية فيه، فلا تنقل الصفحة دون فعل من المستخدم). say ثابتة الهوية فتصلح اعتمادًا في useCallback.
let noticeSeq = 0;
export function useNotice() {
  const [note, setNote] = useState(null);
  const say = useCallback((text, bad = false) => setNote(text ? { text, bad: !!bad, n: ++noticeSeq } : null), []);
  return [note, say];
}
export function Notice({ note, onClose, reveal = false }) {
  const box = useRef(null);
  useEffect(() => { if (reveal && note) box.current?.scrollIntoView?.({ block: 'nearest' }); }, [note, reveal]);
  // المفتاح يعيد رسم الرسالة المكررة فتُعلن ثانية (خطأ التحقق نفسه بعد محاولة أخرى)
  const body = note && <><span className="ico" aria-hidden="true">{note.bad ? '!' : '✓'}</span><div className="grow">{note.text}</div>{onClose && <button className="link small" onClick={onClose}>إغلاق</button>}</>;
  return (
    <>
      <div className="notice-live" role="status" aria-live="polite">{note && !note.bad && <div key={note.n} ref={box} className="banner">{body}</div>}</div>
      {note?.bad && <div key={note.n} ref={box} className="banner warn" role="alert">{body}</div>}
    </>
  );
}

// رسالة واحدة لكل نافذة حجبها المتصفح: ما حدث، وكيف تسمح، وماذا تفعل بعدها
export const POPUP_BLOCKED = 'منع المتصفح فتح النافذة. اسمح بالنوافذ المنبثقة لهذا الموقع من شريط العنوان، ثم اضغط مرة أخرى.';

export function Skel({ h = 16, w = '100%', r = 8, style }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

// هيكل الرحلة: البطل ثم بطاقتان ثم مراحل
export function JourneySkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="skel-hero"><Skel h={14} w="30%" /><Skel h={28} w="60%" /><Skel h={14} w="45%" /></div>
      {[0, 1, 2].map((i) => <div key={i} className="card"><Skel h={18} w="40%" /><Skel h={12} style={{ marginTop: 10 }} /><Skel h={12} w="80%" style={{ marginTop: 6 }} /></div>)}
    </div>
  );
}

export function BookSkeleton() {
  return (
    <div className="page book" aria-busy="true" aria-label="جارٍ تحميل الكتيب">
      <div className="skel-hero"><Skel h={14} w="20%" /><Skel h={30} w="55%" /><Skel h={14} w="70%" /></div>
      <div className="book-grid">
        <div className="card">{[0, 1, 2, 3, 4, 5].map((i) => <Skel key={i} h={14} style={{ marginTop: i ? 12 : 0 }} />)}</div>
        <div className="card"><Skel h={420} /></div>
      </div>
    </div>
  );
}

export function Empty({ icon = 'inbox', title, hint, action }) {
  return (
    <div className="empty-state">
      <span className="ico" aria-hidden="true"><Ico name={icon} /></span>
      <b>{title}</b>
      {hint && <p className="small muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="alert err row between" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn sm ghost" onClick={onRetry}>حاول مرة أخرى</button>}
    </div>
  );
}
