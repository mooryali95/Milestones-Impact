// ════════════════════════════════════════════════════════════════
// اختيار الوجهة لبريد له دور آخر: خبير أو منسق جهة، قبل إنشاء حساب مشارك
// ════════════════════════════════════════════════════════════════
// يظهر بعد إثبات ملكية البريد فقط (رمز أو رابط أو Google)، فلا يكشف لغير صاحبه شيئًا.
import React from 'react';

const DOORS = {
  expert: { href: '/x', title: 'لوحة الخبير', hint: 'طلباتك وجلساتك وساعات خبرتك' },
  org: { href: '/org', title: 'لوحة الجهة', hint: 'مشاركو جهتك وتقدّمهم' },
};

export default function RoleChoice({ roles, onParticipant, busy }) {
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">أين تريد الدخول؟</p>
        <h1>بريدك مسجل في دور آخر</h1>
        <p className="muted">هذا البريد مسجل {roles.includes('expert') ? 'خبيرًا في شبكة البرنامج' : 'منسقًا لجهة'}. لوحتك هناك، ولا تحتاج حساب مشارك إلا إن كنت ستشارك في البرنامج نفسه.</p>
      </div>
      {roles.map((r) => DOORS[r] && (
        <a key={r} className="btn block" href={DOORS[r].href}>{DOORS[r].title}<small style={{ display: 'block', fontWeight: 400, opacity: 0.8 }}>{DOORS[r].hint}</small></a>
      ))}
      <button type="button" className="btn ghost block" disabled={busy} onClick={onParticipant}>سأشارك في البرنامج: أنشئ حساب مشارك</button>
    </div>
  );
}
