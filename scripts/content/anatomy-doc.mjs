// يولّد مرجع الخبير من المصدر الواحد anatomy.json: node scripts/content/anatomy-doc.mjs
// المرجع للقراءة والمراجعة لا للتحرير: التعديل في anatomy.json ثم يُعاد التوليد، ويحرس اختبار تطابقهما.
import { readFileSync, writeFileSync } from 'node:fs';

export const OUT = 'docs/content/2026-11-15-مرجع-معنى-المبادرة-وخريطة-الوثيقة-v1.md';
const A = JSON.parse(readFileSync('supabase/content/initiative-guide/v1/anatomy.json', 'utf8'));
const TITLES = Object.fromEntries(JSON.parse(readFileSync('supabase/content/initiative-guide/v1/sectors/gov.json', 'utf8')).sections.map((s) => [s.key, s.title]));
TITLES['portfolio-review'] ??= 'مراجعة المحفظة';
const DIM = { milestone: 'إطار المعالم', impact: 'إطار الأثر', leadership: 'إطار القيادة' };
const cell = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function render() {
  const m = A.meaning;
  const out = [];
  out.push('# مرجع معنى المبادرة وخريطة وثيقتها ومسرد مصطلحاتها (v1)', '');
  out.push('> **مولَّد، لا يُحرَّر يدويًا.** المصدر الواحد `supabase/content/initiative-guide/v1/anatomy.json`. أي تعديل يُكتب هناك ثم يُعاد التوليد بالأمر `node scripts/content/anatomy-doc.mjs`.', '');
  out.push(`**الحالة:** ${A._meta.status}`, '');
  out.push(`**اعتمده المالك للنشر:** ${A._meta.approved_by_owner}`, '');
  out.push(`**مراجعة خبير المحتوى:** ${A._meta.expert_review || 'لم تُطلب بعد'}`, '');
  out.push('**أين يظهر:**', '');
  out.push('- صفحة المبادرة عند المشارك: بطاقة «ما المبادرة؟»، وفهرس الوثيقة بمراحله.');
  out.push('- داخل كل فصل: شريط التنقل وإحالته إلى الكتيب.');
  out.push('- حقول الفصول وأعمدة جداولها وفحوص الاتساق: تلميح المصطلح.');
  out.push('- الوثيقة الاحترافية: الفهرس بالمراحل، وسطر «لماذا هذا الفصل»، ومسرد المصطلحات الملحق.', '');
  out.push('**ما يُطلب من الخبير:** مراجعة الدقة المنهجية ووضوح اللغة للمبتدئ، وصحة الإحالة إلى الكتيب. ترسل الملاحظات بالقسم والمفتاح.', '');
  out.push('---', '');
  out.push(`## 1. ${m.title}`, '', m.definition, '', m.in_program, '', `**اختبار سريع:** ${m.test}`, '');
  out.push('### المبادرة والمشروع والبرنامج والمحفظة', '');
  out.push('| | سؤالها | ما هي | مثال |', '|---|---|---|---|');
  for (const l of m.levels) out.push(`| **${cell(l.title)}** | ${cell(l.question)} | ${cell(l.is)} | ${cell(l.example)} |`);
  out.push('', '### ما ليست المبادرة', '');
  for (const n of m.not) out.push(`- **${n.title}:** ${n.is}`);
  out.push('', `### مكوناتها`, '', m.components, '');
  out.push(`**في الكتيب:** ${DIM[m.handbook.dimension]}، الباب ${m.handbook.chapter_key}، قسم «${m.handbook.look_for}».`, '');
  out.push('---', '', '## 2. خريطة الوثيقة: المراحل وفصولها', '');
  out.push('ترتيب الفصول في الوثيقة يأتي من الخادم. هذه المراحل تجمعها بالسؤال الذي تجيب عنه.', '');
  A.phases.forEach((p, i) => {
    out.push(`### ${i + 1}. ${p.title}`, '', p.lead, '');
    out.push('| الفصل | المفتاح | لماذا هو | يغذي | في الكتيب |', '|---|---|---|---|---|');
    for (const k of p.chapters) {
      const c = A.chapters[k] || {};
      const feeds = (c.feeds || []).map((f) => A.feeds[f]).join('، ') || '·';
      const h = c.handbook ? `${DIM[c.handbook.dimension]} · ${c.handbook.chapter_key} · «${c.handbook.look_for}»` : '·';
      out.push(`| ${cell(TITLES[k] || k)} | \`${k}\` | ${cell(c.why)} | ${cell(feeds)} | ${cell(h)} |`);
    }
    out.push('');
  });
  out.push('---', '', `## 3. مسرد المصطلحات (${A.glossary.length} مصطلحًا)`, '');
  out.push('`{RISK_HIGH}` يُستبدل عند العرض بحد الخطر العالي من مصدره في `capstone.js`.', '');
  out.push('| المصطلح | صيغ أخرى يُعرف بها | التعريف |', '|---|---|---|');
  for (const g of A.glossary) out.push(`| **${cell(g.term)}** | ${cell((g.aka || []).join('، ') || '·')} | ${cell(g.def)} |`);
  out.push('');
  if (A.writing_rules?.length) {
    out.push('---', '', '## 4. قواعد الكتابة: المبادرة ملك قائدها', '');
    if (A.meaning.owner_rule) out.push(`> ${A.meaning.owner_rule}`, '');
    A.writing_rules.forEach((r, i) => out.push(`${i + 1}. ${typeof r === 'string' ? r : `**${r.rule}** ${r.why || ''}`.trim()}`));
    out.push('');
  }
  if (A.contexts) {
    out.push('---', '', '## 5. سياق التنفيذ: أين تُنفَّذ المبادرة', '', A.contexts.about, '');
    const opts = A.contexts.options;
    out.push(`| الحقل | ${opts.map((o) => cell(o.label)).join(' | ')} |`, `|---|${opts.map(() => '---').join('|')}|`);
    for (const [k, n] of Object.entries(A.contexts.notes)) out.push(`| \`${k}\` | ${opts.map((o) => cell(n[o.key] || '·')).join(' | ')} |`);
    out.push('', `المثال المحلول الأقرب لكل سياق: ${opts.filter((o) => o.example).map((o) => `«${o.label}» ← \`${o.example}\``).join('، ')}، وما عداها مثال قطاع المشارك.`, '');
  }
  return out.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  writeFileSync(OUT, render());
  console.log('wrote', OUT);
}
