// ════════════════════════════════════════════════════════════════
// أبواب البرنامج: سطر صغير في كل شاشة دخول يدل على البوابتين الأخريين
// ════════════════════════════════════════════════════════════════
import React from 'react';

export const DOORS = {
  participant: { href: '/', label: 'دخول المشارك' },
  expert: { href: '/x', label: 'لوحة الخبير' },
  org: { href: '/org', label: 'لوحة الجهة' },
};

// الخادم يعيد door:<أبواب> لمن ثبتت هويته ودخل من الباب الخطأ
export const doorsFromCode = (code) => (String(code || '').startsWith('door:') ? String(code).slice(5).split(',').filter((d) => DOORS[d]) : []);

export function DoorButtons({ doors }) {
  if (!doors?.length) return null;
  return <div className="row">{doors.map((d) => <a key={d} className="btn sm" href={DOORS[d].href}>{DOORS[d].label}</a>)}</div>;
}

export default function OtherDoors({ here }) {
  const others = Object.keys(DOORS).filter((d) => d !== here);
  return (
    <p className="small muted signin-expert">
      لست في المكان الصحيح؟ {others.map((d, i) => <React.Fragment key={d}>{i > 0 && ' · '}<a className="link" href={DOORS[d].href}>{DOORS[d].label}</a></React.Fragment>)}
    </p>
  );
}
