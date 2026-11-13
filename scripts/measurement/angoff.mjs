// عُدّة الضبط المعياري (Angoff المعدّلة) لأداة القياس المبدئي.
//   node scripts/measurement/angoff.mjs sheet [intermediate|advanced] > ورقة.csv   ورقة المحكّم: فقرة في كل سطر وعمود p فارغ
//   node scripts/measurement/angoff.mjs cut ملف1.csv ملف2.csv ...                الحد المقترح من أوراق المحكّمين المملوءة
// كل ملف ورقة محكّم واحد، واسم الملف اسمه. p من 0 إلى 100: النسبة المتوقعة من درجة الفقرة عند «الحد الأدنى للمستوى».
// الحساب في supabase/functions/leaders-api/evidence.js (angoffCut) بأوزان نموذج التسكين، فلا معادلة ثانية هنا.
import fs from 'node:fs';
import path from 'node:path';
import { angoffCut } from '../../supabase/functions/leaders-api/evidence.js';
import { DEFAULT_MODEL } from '../../supabase/functions/leaders-api/logic.js';

const BANK = new URL('../../supabase/content/questions/v5.2/items.json', import.meta.url);
const INSTRUMENT = 'baseline-v5';
const items = JSON.parse(fs.readFileSync(BANK, 'utf8')).filter((q) => q.instrument === INSTRUMENT);
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const TIER = { knowledge: 'معرفة', skill: 'مواقف', behavior: 'ممارسة' };
const DIM = { milestone: 'المعالم', impact: 'الأثر', leadership: 'القيادة' };
const LEVEL = { intermediate: 'متوسط', advanced: 'احترافي' };

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'sheet') {
  const level = args[0] === 'advanced' ? 'advanced' : 'intermediate';
  console.log(['code', 'الإطار', 'الجانب', 'الصيغة', 'الفقرة', 'أفضل إجابة', `p: من 100 مشارك عند الحد الأدنى لمستوى «${LEVEL[level]}»، كم نقطة من 100 يُتوقع أن ينالوا في هذه الفقرة؟`].map(csv).join(','));
  for (const q of [...items].sort((a, b) => a.dimension.localeCompare(b.dimension) || a.tier.localeCompare(b.tier) || a.sort - b.sort)) {
    const best = [...q.options].filter((o) => o.score >= 0).sort((a, b) => b.score - a.score)[0];
    console.log([q.code, DIM[q.dimension], TIER[q.tier], q.form || 'مشتركة', q.text_ar, q.tier === 'behavior' ? '(تقدير ذاتي: النسبة المتوقعة من أعلى تكرار)' : best.label, ''].map(csv).join(','));
  }
} else if (cmd === 'cut' && args.length) {
  const ratings = [];
  for (const file of args) {
    const judge = path.basename(file).replace(/\.csv$/i, '');
    const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean);
    for (const line of lines) {
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
      const p = Number(cells[cells.length - 1] === '' ? cells[cells.length - 2] : cells[cells.length - 1]);
      if (cells[0] && Number.isFinite(p)) ratings.push({ judge, code: cells[0], p: p / 100 });
    }
  }
  const r = angoffCut(ratings, items);
  console.log(`المحكّمون: ${r.judges} · الأوزان: معرفة ${DEFAULT_MODEL.w_knowledge}، مواقف ${DEFAULT_MODEL.w_skill}، ممارسة ${DEFAULT_MODEL.w_behavior}`);
  for (const [d, x] of Object.entries(r.dimensions)) {
    console.log(`${DIM[d]}: الحد المقترح ${x.cut ?? '—'} (± ${x.se ?? '—'} بين المحكّمين، المدى ${x.range ? x.range.join(' إلى ') : '—'}) · الجوانب: ${Object.entries(x.tiers).map(([t, v]) => `${TIER[t]} ${v}`).join('، ')}`);
  }
  console.log(`الحد المقترح للأطر الثلاثة معًا: ${r.cut ?? '—'}`);
  if (r.judges < 5) console.log('تنبيه: أقل من خمسة محكّمين. الحد مؤشر أولي لا يُعتمد.');
} else {
  console.error('الاستعمال: angoff.mjs sheet [intermediate|advanced]  |  angoff.mjs cut ورقة1.csv ورقة2.csv ...');
  process.exit(1);
}
