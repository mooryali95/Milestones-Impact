// حقل البريد الموحد لكل الشاشات (القادة والإدارة): البريد يُكتب بالإنجليزية وحدها.
// الأرقام العربية تتحول إلى إنجليزية بصمت، والحرف العربي يُحذف لحظة كتابته أو لصقه، ويظهر تحت الحقل سطر يقول السبب،
// ويختفي مع أول إدخال سليم. كل خصائص <input> تمر كما هي، فاستبداله بالحقل القديم لا يغيّر سلوك الشاشة.
import React, { useState } from 'react';
import { latinDigits } from './latin-digits.js';

// العربية وملحقاتها وأشكال العرض (الأرقام تُحوَّل قبل هذا فلا تصل إليه)
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
export const EMAIL_ARABIC_HINT = 'البريد يُكتب بالأحرف الإنجليزية، غيّر لغة لوحة المفاتيح';

export const stripArabic = (s) => String(s ?? '').replace(ARABIC, '');
export const hasArabic = (s) => /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(String(s ?? ''));

export default function EmailInput({ onChange, type = 'email', dir = 'ltr', ...rest }) {
  const [warn, setWarn] = useState(false);
  const change = (e) => {
    const raw = latinDigits(e.target.value);
    if (raw !== e.target.value) e.target.value = raw;
    if (hasArabic(raw)) {
      e.target.value = stripArabic(raw);
      setWarn(true);
    } else if (warn && raw) setWarn(false);
    onChange?.(e);
  };
  return (
    <>
      <input {...rest} type={type} dir={dir} onChange={change} aria-invalid={warn || rest['aria-invalid']} />
      <span className="email-ar-hint" role="status" aria-live="polite"
        style={warn ? { display: 'block', flexBasis: '100%', color: '#b42318', fontSize: '.85em', marginTop: '.3rem', direction: 'rtl', textAlign: 'start' } : { display: 'none' }}>
        {warn ? EMAIL_ARABIC_HINT : ''}
      </span>
    </>
  );
}
