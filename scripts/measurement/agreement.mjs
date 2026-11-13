// اتفاق المقيّمين على السلّم الرباعي، وعيّنة التقييم المزدوج.
//   node scripts/measurement/agreement.mjs sample <بذرة> معرّف1 معرّف2 ...     من يُقيَّم مرتين (20%، ثابتة للبذرة)
//   node scripts/measurement/agreement.mjs score ملف.csv                       ملف بعمودين في كل سطر: تقدير الأول، تقدير الثاني (1 إلى 4)، والسطر الأول عناوين
// الحساب في supabase/functions/leaders-api/evidence.js (agreement وdoubleMarkSample).
import fs from 'node:fs';
import { agreement, AGREEMENT_TARGET, doubleMarkSample } from '../../supabase/functions/leaders-api/evidence.js';

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'sample' && args.length > 1) {
  const [seed, ...ids] = args;
  const s = doubleMarkSample(ids, seed);
  console.log(`العيّنة (${s.length} من ${new Set(ids).size}):\n${s.join('\n')}`);
} else if (cmd === 'score' && args[0]) {
  const pairs = fs.readFileSync(args[0], 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(/[,;\t]/).slice(-2).map(Number));
  const a = agreement(pairs);
  console.log(`الأزواج: ${a.n} · تطابق تام ${a.exact ?? '—'} · تطابق بفرق درجة ${a.adjacent ?? '—'} · كابا الموزون ${a.kappa ?? '—'} (الهدف ${AGREEMENT_TARGET})`);
  console.log(a.meets_target == null ? 'لا أزواج صالحة.' : a.meets_target ? 'بلغ الهدف.' : 'دون الهدف: جلسة معايرة ثانية على النماذج المرجعية قبل اعتماد التقييمات.');
  if (a.n && a.n < 20) console.log('تنبيه: أقل من 20 زوجًا. الرقم مؤشر أولي.');
} else {
  console.error('الاستعمال: agreement.mjs sample <بذرة> معرّف...  |  agreement.mjs score ملف.csv');
  process.exit(1);
}
